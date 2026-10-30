'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  addDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export interface StudioParticipant {
  peerId: string;
  uid: string;
  displayName: string;
  photoURL?: string | null;
  role: 'host' | 'guest';
  audioEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing: boolean;
  isLocalRecording: boolean;
  audioLevel?: number;
  smallRoomMode?: boolean;
  joinedAt: number;
  updatedAt: number;
  stream?: MediaStream | null;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function useWebRTCStudio(params: {
  roomId: string;
  joined: boolean;
  uid: string;
  displayName: string;
  photoURL?: string | null;
  role: 'host' | 'guest';
  initialAudioEnabled: boolean;
  initialVideoEnabled: boolean;
  selectedAudioDeviceId?: string;
  selectedVideoDeviceId?: string;
  smallRoomMode?: boolean;
}) {
  const {
    roomId,
    joined,
    uid,
    displayName,
    photoURL,
    role,
    initialAudioEnabled,
    initialVideoEnabled,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    smallRoomMode = true,
  } = params;

  const [peerId] = useState(
    () => `${uid || 'anon'}_${Math.random().toString(36).substring(2, 8)}`
  );
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(initialAudioEnabled);
  const [videoEnabled, setVideoEnabled] = useState(initialVideoEnabled);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isLocalRecording, setIsLocalRecording] = useState(false);
  const [remoteParticipants, setRemoteParticipants] = useState<
    Record<string, StudioParticipant>
  >({});
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(
    new Array(24).fill(8)
  );

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const makingOfferRef = useRef<Record<string, boolean>>({});
  const audioLevelRef = useRef<number>(0);

  // Acquire or update camera/mic media stream
  // In Small-Room Mode:
  // - autoGainControl is FALSE so a silent member's phone doesn't boost gain and pick up neighbors' voices in the room
  // - echoCancellation is FALSE because speaker monitoring is 100% muted (prevents hollow phase cancellation when 2 people laugh/speak)
  // - noiseSuppression is TRUE to filter AC/room hum
  const acquireMedia = useCallback(
    async (
      wantAudio: boolean,
      wantVideo: boolean,
      audioDev?: string,
      videoDev?: string,
      inSmallRoom: boolean = smallRoomMode
    ) => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            deviceId: audioDev ? { exact: audioDev } : undefined,
            echoCancellation: !inSmallRoom,
            noiseSuppression: true,
            autoGainControl: !inSmallRoom,
            sampleRate: 48000,
            channelCount: 2,
          },
          video: wantVideo
            ? {
                deviceId: videoDev ? { exact: videoDev } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              }
            : false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getAudioTracks().forEach((t) => {
          t.enabled = wantAudio;
        });
        stream.getVideoTracks().forEach((t) => {
          t.enabled = wantVideo;
        });

        // Replace tracks in active peer connections if any
        Object.values(pcsRef.current).forEach((pc) => {
          const senders = pc.getSenders();
          const audioTrack = stream.getAudioTracks()[0];
          const videoTrack = stream.getVideoTracks()[0];
          if (audioTrack && !inSmallRoom) {
            const audioSender = senders.find((s) => s.track?.kind === 'audio');
            if (audioSender) audioSender.replaceTrack(audioTrack);
            else pc.addTrack(audioTrack, stream);
          }
          if (videoTrack) {
            const videoSender = senders.find((s) => s.track?.kind === 'video');
            if (videoSender) videoSender.replaceTrack(videoTrack);
            else pc.addTrack(videoTrack, stream);
          }
        });

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (err) {
        console.warn('High-res media fallback to audio-only:', err);
        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: !inSmallRoom,
              noiseSuppression: true,
              autoGainControl: !inSmallRoom,
            },
            video: false,
          });
          audioOnlyStream.getAudioTracks().forEach((t) => {
            t.enabled = wantAudio;
          });
          localStreamRef.current = audioOnlyStream;
          setLocalStream(audioOnlyStream);
          setVideoEnabled(false);
          return audioOnlyStream;
        } catch (audioErr) {
          console.error('Could not access microphone:', audioErr);
          return null;
        }
      }
    },
    [smallRoomMode]
  );

  // Audio level & live studio waveform analyzer
  useEffect(() => {
    if (!localStream || !audioEnabled) {
      setAudioLevel(0);
      audioLevelRef.current = 0;
      setWaveformBars(new Array(24).fill(6));
      return;
    }
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    let animId: number;
    let audioCtx: AudioContext | null = null;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(localStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        const bars: number[] = [];
        for (let i = 0; i < 24; i++) {
          const val = dataArray[i] || 0;
          sum += val;
          bars.push(Math.max(6, Math.min(100, Math.round((val / 255) * 100))));
        }
        const avg = Math.min(100, Math.round((sum / (24 * 185)) * 100));
        audioLevelRef.current = avg;
        setAudioLevel(avg);
        setWaveformBars(bars);
        animId = requestAnimationFrame(tick);
      };
      animId = requestAnimationFrame(tick);
    } catch (e) {
      // Ignore AudioContext errors in restricted environments
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [localStream, audioEnabled]);

  // Sync participant state in Firestore
  const syncMyPresence = useCallback(
    async (overrides?: Partial<StudioParticipant>) => {
      if (!joined || !roomId) return;
      const partRef = doc(db, 'rooms', roomId, 'participants', peerId);
      await setDoc(
        partRef,
        {
          peerId,
          uid,
          displayName: displayName || 'Co-Host',
          photoURL: photoURL || null,
          role,
          audioEnabled,
          videoEnabled,
          isScreenSharing,
          isLocalRecording,
          audioLevel: audioLevelRef.current,
          smallRoomMode,
          joinedAt: Date.now(),
          updatedAt: Date.now(),
          ...overrides,
        },
        { merge: true }
      ).catch(() => {});
    },
    [
      joined,
      roomId,
      peerId,
      uid,
      displayName,
      photoURL,
      role,
      audioEnabled,
      videoEnabled,
      isScreenSharing,
      isLocalRecording,
      smallRoomMode,
    ]
  );

  // Lightweight heartbeat to sync live speaking level for visual meters in Small Room Mode
  useEffect(() => {
    if (!joined || !roomId) return;
    let lastSyncedLevel = -1;
    const interval = setInterval(() => {
      const cur = audioEnabled ? audioLevelRef.current : 0;
      if (Math.abs(cur - lastSyncedLevel) >= 8 || (cur === 0 && lastSyncedLevel !== 0)) {
        lastSyncedLevel = cur;
        const partRef = doc(db, 'rooms', roomId, 'participants', peerId);
        setDoc(
          partRef,
          {
            audioLevel: cur,
            updatedAt: Date.now(),
          },
          { merge: true }
        ).catch(() => {});
      }
    }, 850);
    return () => clearInterval(interval);
  }, [joined, roomId, peerId, audioEnabled]);

  // Create or get RTCPeerConnection for a remote peer
  const getOrCreatePeerConnection = useCallback(
    (remotePeerId: string): RTCPeerConnection => {
      if (pcsRef.current[remotePeerId]) {
        return pcsRef.current[remotePeerId];
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcsRef.current[remotePeerId] = pc;

      // Add local tracks:
      // In Small Room Mode, we DO NOT transmit live audio over WebRTC to peers in the same room
      // so mobile OSes keep pure studio-mic recording quality and zero speaker feedback can occur.
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          if (smallRoomMode && track.kind === 'audio') {
            return;
          }
          pc.addTrack(track, stream);
        });
      }

      // Handle incoming remote tracks
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          remoteStreamsRef.current[remotePeerId] = remoteStream;
          setRemoteParticipants((prev) => {
            const existing = prev[remotePeerId];
            if (!existing) return prev;
            return {
              ...prev,
              [remotePeerId]: {
                ...existing,
                stream: remoteStream,
              },
            };
          });
        }
      };

      // Send ICE candidates via Firestore signals
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await addDoc(collection(db, 'rooms', roomId, 'signals'), {
            from: peerId,
            to: remotePeerId,
            type: 'candidate',
            candidate: event.candidate.toJSON(),
            createdAt: Date.now(),
          }).catch(() => {});
        }
      };

      return pc;
    },
    [roomId, peerId, smallRoomMode]
  );

  // Main WebRTC signaling & participant subscription effect when joined
  useEffect(() => {
    if (!joined || !roomId) return;

    let unsubParticipants: (() => void) | undefined;
    let unsubSignals: (() => void) | undefined;
    let isMounted = true;

    const setupRoomConnection = async () => {
      await acquireMedia(
        initialAudioEnabled,
        initialVideoEnabled,
        selectedAudioDeviceId,
        selectedVideoDeviceId,
        smallRoomMode
      );
      if (!isMounted) return;

      const partRef = doc(db, 'rooms', roomId, 'participants', peerId);
      await setDoc(partRef, {
        peerId,
        uid,
        displayName: displayName || 'Co-Host',
        photoURL: photoURL || null,
        role,
        audioEnabled: initialAudioEnabled,
        videoEnabled: initialVideoEnabled,
        isScreenSharing: false,
        isLocalRecording: false,
        audioLevel: 0,
        smallRoomMode,
        joinedAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Listen for participants
      unsubParticipants = onSnapshot(
        collection(db, 'rooms', roomId, 'participants'),
        (snap) => {
          const updated: Record<string, StudioParticipant> = {};
          snap.forEach((docSnap) => {
            const data = docSnap.data() as StudioParticipant;
            if (data.peerId === peerId) return;
            // Ignore stale participants older than 2 hours
            if (
              Date.now() - (data.updatedAt || data.joinedAt || 0) >
              2 * 3600 * 1000
            ) {
              return;
            }
            updated[data.peerId] = {
              ...data,
              stream: remoteStreamsRef.current[data.peerId] || null,
            };

            // Only negotiate WebRTC if not in pure audio-only Small Room Mode (or if video/remote mode is used)
            const needsWebRTC =
              !smallRoomMode ||
              videoEnabled ||
              data.videoEnabled ||
              data.isScreenSharing;

            if (
              needsWebRTC &&
              peerId < data.peerId &&
              !pcsRef.current[data.peerId]
            ) {
              const pc = getOrCreatePeerConnection(data.peerId);
              makingOfferRef.current[data.peerId] = true;
              pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .then(() => {
                  if (pc.localDescription) {
                    return addDoc(collection(db, 'rooms', roomId, 'signals'), {
                      from: peerId,
                      to: data.peerId,
                      type: 'offer',
                      sdp: {
                        type: pc.localDescription.type,
                        sdp: pc.localDescription.sdp,
                      },
                      createdAt: Date.now(),
                    });
                  }
                })
                .catch((e) => console.warn('Offer error:', e))
                .finally(() => {
                  makingOfferRef.current[data.peerId] = false;
                });
            }
          });

          // Cleanup disconnected peers
          Object.keys(pcsRef.current).forEach((remId) => {
            if (!updated[remId]) {
              pcsRef.current[remId].close();
              delete pcsRef.current[remId];
              delete remoteStreamsRef.current[remId];
            }
          });

          setRemoteParticipants(updated);
        }
      );

      // Listen for incoming WebRTC signals addressed to peerId
      const sigQuery = query(
        collection(db, 'rooms', roomId, 'signals'),
        where('to', '==', peerId)
      );
      unsubSignals = onSnapshot(sigQuery, (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          const fromPeer = data.from as string;
          const pc = getOrCreatePeerConnection(fromPeer);

          try {
            if (data.type === 'offer' && data.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              if (pc.localDescription) {
                await addDoc(collection(db, 'rooms', roomId, 'signals'), {
                  from: peerId,
                  to: fromPeer,
                  type: 'answer',
                  sdp: {
                    type: pc.localDescription.type,
                    sdp: pc.localDescription.sdp,
                  },
                  createdAt: Date.now(),
                });
              }
            } else if (data.type === 'answer' && data.sdp) {
              if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(data.sdp)
                );
              }
            } else if (data.type === 'candidate' && data.candidate) {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              }
            }
            await deleteDoc(change.doc.ref).catch(() => {});
          } catch (err) {
            console.warn('WebRTC signaling handling warning:', err);
          }
        });
      });
    };

    setupRoomConnection();

    const handleBeforeUnload = () => {
      deleteDoc(doc(db, 'rooms', roomId, 'participants', peerId)).catch(
        () => {}
      );
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unsubParticipants?.();
      unsubSignals?.();
      deleteDoc(doc(db, 'rooms', roomId, 'participants', peerId)).catch(
        () => {}
      );
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [joined, roomId, peerId]);

  // Re-tune microphone constraints when smallRoomMode changes while in studio
  useEffect(() => {
    if (!joined || !localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track
        .applyConstraints({
          echoCancellation: !smallRoomMode,
          noiseSuppression: true,
          autoGainControl: !smallRoomMode,
        })
        .catch(() => {});
    });
    syncMyPresence({ smallRoomMode });
  }, [smallRoomMode, joined, syncMyPresence]);

  const toggleAudio = useCallback(async () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
    }
    await syncMyPresence({ audioEnabled: next, audioLevel: next ? audioLevelRef.current : 0 });
  }, [audioEnabled, syncMyPresence]);

  const toggleVideo = useCallback(async () => {
    const next = !videoEnabled;
    setVideoEnabled(next);
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((t) => {
          t.enabled = next;
        });
      } else if (next) {
        await acquireMedia(
          audioEnabled,
          true,
          selectedAudioDeviceId,
          selectedVideoDeviceId,
          smallRoomMode
        );
      }
    }
    await syncMyPresence({ videoEnabled: next });
  }, [
    videoEnabled,
    audioEnabled,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    smallRoomMode,
    acquireMedia,
    syncMyPresence,
  ]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing && screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
      setIsScreenSharing(false);
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) {
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          sender?.replaceTrack(camTrack);
        });
      }
      await syncMyPresence({ isScreenSharing: false });
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: !smallRoomMode,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (screenTrack) {
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
          else pc.addTrack(screenTrack, displayStream);
        });
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          setScreenStream(null);
          const camTrack = localStreamRef.current?.getVideoTracks()[0];
          if (camTrack) {
            Object.values(pcsRef.current).forEach((pc) => {
              const sender = pc
                .getSenders()
                .find((s) => s.track?.kind === 'video');
              sender?.replaceTrack(camTrack);
            });
          }
          syncMyPresence({ isScreenSharing: false });
        };
      }
      setScreenStream(displayStream);
      setIsScreenSharing(true);
      await syncMyPresence({ isScreenSharing: true });
    } catch (e) {
      console.warn('Screen share cancelled or failed:', e);
    }
  }, [isScreenSharing, screenStream, smallRoomMode, syncMyPresence]);

  const setRecordingStatus = useCallback(
    async (recording: boolean) => {
      setIsLocalRecording(recording);
      await syncMyPresence({ isLocalRecording: recording });
    },
    [syncMyPresence]
  );

  return {
    peerId,
    localStream,
    screenStream,
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    isLocalRecording,
    remoteParticipants: Object.values(remoteParticipants),
    audioLevel,
    waveformBars,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    setRecordingStatus,
    acquireMedia,
  };
}
