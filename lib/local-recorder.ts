import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { saveStudioTrackMetadata, StudioTrackRecord } from './podcast-service';

export function getSupportedMimeType(hasVideo: boolean): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';

  const videoCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  const audioCandidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];

  const list = hasVideo ? videoCandidates : audioCandidates;
  for (const mime of list) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return hasVideo ? 'video/webm' : 'audio/webm';
}

// ============================================================================
// IndexedDB local copy of every recorded track.
// A blob: URL only exists inside the tab that created it, so it must never be
// stored in Firestore. IndexedDB lets the recording browser re-open its own
// takes in the editor even if the cloud upload failed or is still running.
// ============================================================================

const IDB_NAME = 'podmeet-local-tracks';
const IDB_STORE = 'blobs';

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalTrackBlob(trackId: string, blob: Blob) {
  try {
    const db = await openLocalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(blob, trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('Could not cache track locally:', e);
  }
}

export async function getLocalTrackBlob(trackId: string): Promise<Blob | null> {
  try {
    const db = await openLocalDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(trackId);
      req.onsuccess = () => resolve((req.result as Blob) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob;
  } catch {
    return null;
  }
}

/**
 * Resolve the audio/video bytes of a recorded track:
 *  1. this browser's own IndexedDB copy,
 *  2. Firebase Storage download URL (direct, then via the same-origin proxy
 *     because the bucket has no CORS configuration).
 */
export async function fetchTrackBlob(track: StudioTrackRecord): Promise<Blob> {
  const local = await getLocalTrackBlob(track.id);
  if (local) return local;

  if (!track.downloadUrl) {
    throw new Error(
      `"${track.participantName}" track was not uploaded to the cloud and is only on the recording device.`
    );
  }

  try {
    const direct = await fetch(track.downloadUrl);
    if (direct.ok) return await direct.blob();
  } catch {
    // CORS failure: fall through to proxy
  }

  const proxied = await fetch(
    `/api/track-proxy?url=${encodeURIComponent(track.downloadUrl)}`
  );
  if (!proxied.ok) {
    throw new Error(`Track download failed (${proxied.status})`);
  }
  return await proxied.blob();
}

/**
 * Converts a recorded WebM/MP4 audio/video Blob into an uncompressed 16-bit PCM WAV Blob
 * for professional podcast DAWs (Audition, Logic Pro, Reaper, Descript).
 */
export async function convertBlobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AudioCtx();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const numOfChan = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);

  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  setUint32(0x46464952); // RIFF
  setUint32(length - 8);
  setUint32(0x45564157); // WAVE
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (let i = 0; i < numOfChan; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  await audioCtx.close();
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function uploadTrackToFirebase(params: {
  roomId: string;
  sessionId: string;
  participantId: string;
  participantName: string;
  role: 'host' | 'guest';
  blob: Blob;
  durationSec: number;
  kind: 'video-audio' | 'audio-only' | 'wav';
  onProgress?: (pct: number) => void;
}): Promise<StudioTrackRecord> {
  const trackId = `${params.sessionId}_${params.participantId}_${params.kind}_${Date.now()}`;
  const ext = params.kind === 'wav' ? 'wav' : 'webm';
  const contentType =
    (params.blob.type || '').split(';')[0] ||
    (params.kind === 'audio-only' ? 'audio/webm' : 'video/webm');

  // Always keep a local copy first so nothing is lost if the upload fails.
  await saveLocalTrackBlob(trackId, params.blob);

  const initialRecord: StudioTrackRecord = {
    id: trackId,
    roomId: params.roomId,
    sessionId: params.sessionId,
    participantId: params.participantId,
    participantName: params.participantName,
    role: params.role,
    mimeType: contentType,
    durationSec: Math.max(1, Math.round(params.durationSec)),
    sizeBytes: params.blob.size,
    downloadUrl: null,
    localBlobUrl: null, // never persist blob: URLs, they are tab-local
    uploadStatus: 'uploading',
    uploadProgress: 0,
    createdAt: Date.now(),
    kind: params.kind,
  };

  await saveStudioTrackMetadata(params.roomId, initialRecord).catch((e) =>
    console.warn('Could not save initial track metadata:', e)
  );

  const markLocalOnly = async () => {
    const fallback: StudioTrackRecord = {
      ...initialRecord,
      uploadStatus: 'local-only',
      uploadProgress: 100,
    };
    await saveStudioTrackMetadata(params.roomId, fallback).catch(() => {});
    return fallback;
  };

  return new Promise((resolve) => {
    try {
      const safeName = params.participantName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const storagePath = `recordings/${params.roomId}/${params.sessionId}/${safeName}_${trackId}.${ext}`;
      const uploadTask = uploadBytesResumable(ref(storage, storagePath), params.blob, {
        contentType,
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          params.onProgress?.(
            Math.round(
              (snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes)) * 100
            )
          );
        },
        async (error) => {
          console.warn('Firebase Storage upload failed, track kept locally:', error);
          resolve(await markLocalOnly());
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            const finalRecord: StudioTrackRecord = {
              ...initialRecord,
              downloadUrl,
              uploadStatus: 'ready',
              uploadProgress: 100,
            };
            await saveStudioTrackMetadata(params.roomId, finalRecord);
            resolve(finalRecord);
          } catch {
            resolve(await markLocalOnly());
          }
        }
      );
    } catch {
      markLocalOnly().then(resolve);
    }
  });
}
