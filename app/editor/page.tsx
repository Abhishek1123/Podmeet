'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  Upload,
  Download,
  Sliders,
  Volume2,
  Sparkles,
  Trash2,
  ArrowLeft,
  Wand2,
  Layers,
  Disc,
  Loader2,
  Scissors,
  Crown,
} from 'lucide-react';
import {
  PodcastRoom,
  RecordingSession,
  StudioTrackRecord,
  EditTrackSettings,
  subscribeToAllRooms,
  subscribeToRoomSessions,
  subscribeToSessionTracks,
  subscribeToRoomTracks,
  registerRecordingSession,
  getEditSession,
  saveEditSession,
} from '@/lib/podcast-service';
import { fetchTrackBlob } from '@/lib/local-recorder';
import { useAuth } from '@/lib/AuthContext';
import toast from 'react-hot-toast';

interface EditorTrack {
  id: string;
  name: string;
  role: string;
  color: string;
  buffer: AudioBuffer;
  peaks: number[];
  gain: number; // 0 to 2.0
  pan: number; // -1 to 1
  muted: boolean;
  solo: boolean;
  voiceEnhance: boolean; // High-pass + vocal presence + compressor
  trimStart: number; // seconds
  trimEnd: number; // seconds
}

const TRACK_COLORS = [
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#06b6d4', // cyan
];

/** Stable colour per participant so a person keeps their colour across sessions. */
function hashIndex(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % TRACK_COLORS.length;
}

function computePeaks(buffer: AudioBuffer, numBins = 240): number[] {
  const chan = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(chan.length / numBins));
  const peaks: number[] = [];
  for (let i = 0; i < numBins; i++) {
    let start = i * blockSize;
    let max = 0;
    for (let j = 0; j < blockSize && start + j < chan.length; j++) {
      const val = Math.abs(chan[start + j]);
      if (val > max) max = val;
    }
    peaks.push(Math.min(1, max));
  }
  return peaks;
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  let pos = 0;

  const setUint16 = (data: number) => {
    view.setUint16(pos, data, true);
    pos += 2;
  };
  const setUint32 = (data: number) => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"
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

  const channels: Float32Array[] = [];
  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 0;
  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset] || 0));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out], { type: 'audio/wav' });
}

function formatTimecode(sec: number): string {
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  const tenths = Math.floor((sec % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function TrackWaveformCanvas({
  track,
  maxDuration,
  playheadSec,
  onSeek,
}: {
  track: EditorTrack;
  maxDuration: number;
  playheadSec: number;
  onSeek: (sec: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += w / 10) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const durRatio = track.buffer.duration / Math.max(1, maxDuration);
    const trackPixelW = w * durRatio;
    const bins = track.peaks.length;
    const barW = Math.max(2, trackPixelW / bins - 1.5);

    const trimStartX = (track.trimStart / Math.max(1, maxDuration)) * w;
    const trimEndX = (track.trimEnd / Math.max(1, maxDuration)) * w;

    track.peaks.forEach((peak, idx) => {
      const x = (idx / bins) * trackPixelW;
      const inTrim = x >= trimStartX && x <= trimEndX;
      const barH = Math.max(4, peak * (h * 0.8) * Math.min(1.6, track.gain));
      const y = (h - barH) / 2;

      ctx.fillStyle = track.muted
        ? 'rgba(113, 113, 122, 0.35)'
        : inTrim
        ? track.color
        : 'rgba(113, 113, 122, 0.2)';
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    });

    // Shaded trimmed-out overlays
    if (trimStartX > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, trimStartX, h);
    }
    if (trimEndX < trackPixelW) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(trimEndX, 0, trackPixelW - trimEndX, h);
    }

    // Playhead line
    const playX = (playheadSec / Math.max(1, maxDuration)) * w;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, h);
    ctx.stroke();
  }, [track, maxDuration, playheadSec]);

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={84}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width)
        );
        onSeek(pct * maxDuration);
      }}
      className="w-full h-[84px] rounded-xl bg-zinc-950/90 border border-white/10 cursor-pointer block"
    />
  );
}

function PodcastEditorInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const initialRoomId = searchParams?.get('roomId') || '';
  const initialSessionId = searchParams?.get('sessionId') || '';

  const [rooms, setRooms] = useState<PodcastRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState(initialRoomId);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [sessionTracks, setSessionTracks] = useState<StudioTrackRecord[]>([]);
  const [loadingTrackIds, setLoadingTrackIds] = useState<string[]>([]);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>(
    'idle'
  );

  const [tracks, setTracks] = useState<EditorTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [masterNormalize, setMasterNormalize] = useState(true);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const startWallTimeRef = useRef<number>(0);
  const startOffsetSecRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // Per edit-session bookkeeping (reset whenever the session changes)
  const requestedTrackIdsRef = useRef<Set<string>>(new Set());
  const savedSettingsRef = useRef<Record<string, EditTrackSettings>>({});
  const settingsLoadedRef = useRef(false);
  const lastSavedSigRef = useRef('');

  const maxDuration = Math.max(
    10,
    ...tracks.map((t) => t.buffer.duration)
  );

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // Subscribe to rooms
  useEffect(() => {
    const unsub = subscribeToAllRooms((list) => {
      setRooms(list);
      if (!selectedRoomId && list.length > 0) {
        setSelectedRoomId(list[0].id);
      }
    });
    return () => unsub();
  }, [selectedRoomId]);

  // Subscribe to the recording sessions of the selected room
  useEffect(() => {
    if (!selectedRoomId) {
      setSessions([]);
      return;
    }
    const unsub = subscribeToRoomSessions(selectedRoomId, (list) => {
      setSessions(list);
      setSelectedSessionId((current) =>
        current && list.some((s) => s.id === current)
          ? current
          : list[0]?.id || ''
      );
    });
    return () => unsub();
  }, [selectedRoomId]);

  // Backfill: tracks recorded before sessions existed carry a sessionId but no
  // session document. Register them so they show up as their own edit session.
  useEffect(() => {
    if (!selectedRoomId) return;
    let busy = false;
    const unsub = subscribeToRoomTracks(selectedRoomId, async (all) => {
      if (busy) return;
      const firstSeen = new Map<string, number>();
      all.forEach((t) => {
        const prev = firstSeen.get(t.sessionId);
        if (prev === undefined || t.createdAt < prev) {
          firstSeen.set(t.sessionId, t.createdAt);
        }
      });
      const known = new Set(sessionsRef.current.map((s) => s.id));
      const missing = [...firstSeen.entries()]
        .filter(([id]) => !known.has(id))
        .sort((a, b) => a[1] - b[1]);
      if (missing.length === 0) return;
      busy = true;
      try {
        for (const [id, startedAt] of missing) {
          await registerRecordingSession(selectedRoomId, id, startedAt);
        }
      } catch (e) {
        console.warn('Session backfill failed:', e);
      } finally {
        busy = false;
      }
    });
    return () => unsub();
  }, [selectedRoomId]);

  const sessionsRef = useRef<RecordingSession[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Switching session = switching to a completely separate edit: stop audio,
  // clear the timeline and restore only that session's saved mix.
  useEffect(() => {
    stopPlayback();
    setTracks([]);
    setSessionTracks([]);
    setLoadErrors({});
    setLoadingTrackIds([]);
    setPlayheadSec(0);
    setSaveState('idle');
    requestedTrackIdsRef.current = new Set();
    savedSettingsRef.current = {};
    settingsLoadedRef.current = false;
    lastSavedSigRef.current = '';

    if (!selectedRoomId || !selectedSessionId) return;

    let cancelled = false;
    getEditSession(selectedRoomId, selectedSessionId)
      .then((state) => {
        if (cancelled) return;
        savedSettingsRef.current = state?.tracks || {};
        lastSavedSigRef.current = JSON.stringify(state?.tracks || {});
        settingsLoadedRef.current = true;
        // Apply to anything that loaded while we were fetching settings
        setTracks((prev) =>
          prev.map((t) =>
            savedSettingsRef.current[t.id]
              ? { ...t, ...savedSettingsRef.current[t.id] }
              : t
          )
        );
      })
      .catch(() => {
        settingsLoadedRef.current = true;
      });

    const unsub = subscribeToSessionTracks(
      selectedRoomId,
      selectedSessionId,
      (list) => {
        if (!cancelled) setSessionTracks(list);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
    // stopPlayback is stable (useCallback with no deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, selectedSessionId]);

  // Auto-load every track of the selected session onto the timeline
  useEffect(() => {
    if (!selectedSessionId) return;
    const pending = sessionTracks.filter(
      (st) => !requestedTrackIdsRef.current.has(st.id)
    );
    if (pending.length === 0) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    pending.forEach(async (st) => {
      requestedTrackIdsRef.current.add(st.id);
      setLoadingTrackIds((ids) => [...ids, st.id]);
      const sessionAtStart = selectedSessionId;
      try {
        const blob = await fetchTrackBlob(st);
        const ctx = new AudioCtx();
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        await ctx.close().catch(() => {});

        if (sessionAtStart !== selectedSessionIdRef.current) return;

        const saved = savedSettingsRef.current[st.id];
        const duration = Number(decoded.duration.toFixed(2));
        const newTrack: EditorTrack = {
          id: st.id,
          name: `${st.participantName} (${st.role})`,
          role: st.role,
          color: TRACK_COLORS[hashIndex(st.participantId + st.participantName)],
          buffer: decoded,
          peaks: computePeaks(decoded),
          gain: saved?.gain ?? 1.0,
          pan: saved?.pan ?? 0,
          muted: saved?.muted ?? false,
          solo: saved?.solo ?? false,
          voiceEnhance: saved?.voiceEnhance ?? true,
          trimStart: saved?.trimStart ?? 0,
          trimEnd: Math.min(saved?.trimEnd ?? duration, duration),
        };
        setTracks((prev) =>
          prev.some((t) => t.id === newTrack.id) ? prev : [...prev, newTrack]
        );
      } catch (err) {
        console.error('Track load failed', st.id, err);
        requestedTrackIdsRef.current.delete(st.id); // allow retry
        if (sessionAtStart === selectedSessionIdRef.current) {
          setLoadErrors((prev) => ({
            ...prev,
            [st.id]:
              err instanceof Error ? err.message : 'Could not load this track',
          }));
        }
      } finally {
        setLoadingTrackIds((ids) => ids.filter((id) => id !== st.id));
      }
    });
  }, [sessionTracks, selectedSessionId]);

  // Keep a ref of the active session so async loads can detect a stale session
  const selectedSessionIdRef = useRef(selectedSessionId);
  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  // Autosave this session's mix (debounced). Each session writes only to its
  // own editSessions/{sessionId} document.
  useEffect(() => {
    if (!selectedRoomId || !selectedSessionId || !settingsLoadedRef.current) {
      return;
    }
    const sessionTrackIds = new Set(sessionTracks.map((s) => s.id));
    const settings: Record<string, EditTrackSettings> = {};
    tracks.forEach((t) => {
      if (!sessionTrackIds.has(t.id)) return;
      settings[t.id] = {
        gain: t.gain,
        pan: t.pan,
        muted: t.muted,
        solo: t.solo,
        voiceEnhance: t.voiceEnhance,
        trimStart: t.trimStart,
        trimEnd: t.trimEnd,
      };
    });
    const merged = { ...savedSettingsRef.current, ...settings };
    const sig = JSON.stringify(merged);
    if (Object.keys(settings).length === 0 || sig === lastSavedSigRef.current) {
      return;
    }

    const timer = setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveEditSession(
          selectedRoomId,
          selectedSessionId,
          merged,
          user?.email || user?.displayName || null
        );
        savedSettingsRef.current = merged;
        lastSavedSigRef.current = sig;
        setSaveState('saved');
      } catch (e) {
        console.error(e);
        setSaveState('idle');
        toast.error('Could not save this session\u2019s edit');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [tracks, sessionTracks, selectedRoomId, selectedSessionId, user]);

  // Generate sample 3-track podcast stems so editor works out-of-the-box immediately
  const loadDemoMultiTrackSession = useCallback(() => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const sampleRate = 44100;
    const duration = 16; // 16 seconds demo multi-track

    const createSimulatedVoiceBuffer = (
      seedFreq: number,
      cadenceHz: number,
      talkWindows: [number, number][]
    ) => {
      const buf = ctx.createBuffer(2, sampleRate * duration, sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          const t = i / sampleRate;
          const isSpeaking = talkWindows.some(
            ([s, e]) => t >= s && t <= e
          );
          if (!isSpeaking) {
            data[i] = 0;
            continue;
          }
          const env =
            Math.max(0, Math.sin(2 * Math.PI * cadenceHz * t)) *
            (0.65 + 0.35 * Math.sin(2 * Math.PI * 1.7 * t));
          const fundamental =
            Math.sin(2 * Math.PI * seedFreq * t) * 0.45 +
            Math.sin(2 * Math.PI * (seedFreq * 2) * t) * 0.25 +
            Math.sin(2 * Math.PI * (seedFreq * 3) * t) * 0.12;
          data[i] = fundamental * env * 0.6;
        }
      }
      return buf;
    };

    const hostBuf = createSimulatedVoiceBuffer(145, 3.2, [
      [0.5, 5.5],
      [9.2, 15.2],
    ]);
    const cohostBuf = createSimulatedVoiceBuffer(195, 3.8, [
      [5.2, 9.8],
      [12.5, 15.6],
    ]);
    const musicBuf = createSimulatedVoiceBuffer(261.63, 1.2, [
      [0, 3.2],
      [13.0, 16.0],
    ]);

    const demoTracks: EditorTrack[] = [
      {
        id: 'demo_host',
        name: 'Abhishek (Host Mic - Shure SM7B)',
        role: 'Host',
        color: TRACK_COLORS[0],
        buffer: hostBuf,
        peaks: computePeaks(hostBuf),
        gain: 1.1,
        pan: -0.15,
        muted: false,
        solo: false,
        voiceEnhance: true,
        trimStart: 0,
        trimEnd: duration,
      },
      {
        id: 'demo_cohost',
        name: 'Co-Host Friend (Remote Guest Track)',
        role: 'Co-Host',
        color: TRACK_COLORS[1],
        buffer: cohostBuf,
        peaks: computePeaks(cohostBuf),
        gain: 1.0,
        pan: 0.15,
        muted: false,
        solo: false,
        voiceEnhance: true,
        trimStart: 0,
        trimEnd: duration,
      },
      {
        id: 'demo_music',
        name: 'Podcast Intro / Outro Music Bed',
        role: 'Music FX',
        color: TRACK_COLORS[2],
        buffer: musicBuf,
        peaks: computePeaks(musicBuf),
        gain: 0.55,
        pan: 0,
        muted: false,
        solo: false,
        voiceEnhance: false,
        trimStart: 0,
        trimEnd: duration,
      },
    ];

    setTracks(demoTracks);
    setPlayheadSec(0);
    ctx.close().catch(() => {});
    toast.success('Loaded 3-track multi-track podcast session!');
  }, []);

  const stopPlayback = useCallback(() => {
    activeNodesRef.current.forEach((n) => {
      try {
        n.stop();
        n.disconnect();
      } catch (e) {}
    });
    activeNodesRef.current = [];
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(
    (fromSec = playheadSec) => {
      stopPlayback();
      if (tracks.length === 0) return;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const anySolo = tracks.some((t) => t.solo);
      const sources: AudioBufferSourceNode[] = [];

      tracks.forEach((t) => {
        if (t.muted) return;
        if (anySolo && !t.solo) return;
        if (fromSec >= t.trimEnd || fromSec >= t.buffer.duration) return;

        const source = ctx.createBufferSource();
        source.buffer = t.buffer;

        let lastNode: AudioNode = source;

        // Voice Enhancement DSP Chain (85Hz High-Pass + 3.2kHz Presence + Compressor)
        if (t.voiceEnhance) {
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 85;

          const presence = ctx.createBiquadFilter();
          presence.type = 'peaking';
          presence.frequency.value = 3200;
          presence.gain.value = 3.5;

          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -20;
          comp.ratio.value = 3.5;

          lastNode.connect(hp);
          hp.connect(presence);
          presence.connect(comp);
          lastNode = comp;
        }

        const gainNode = ctx.createGain();
        gainNode.gain.value = t.gain;

        const panNode = ctx.createStereoPanner();
        panNode.pan.value = t.pan;

        lastNode.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(ctx.destination);

        const playStartOffset = Math.max(fromSec, t.trimStart);
        const delayBeforeStart = Math.max(0, t.trimStart - fromSec);
        const playDuration = Math.max(0, t.trimEnd - playStartOffset);

        if (playDuration > 0) {
          source.start(
            ctx.currentTime + delayBeforeStart,
            playStartOffset,
            playDuration
          );
          sources.push(source);
        }
      });

      activeNodesRef.current = sources;
      startWallTimeRef.current = performance.now();
      startOffsetSecRef.current = fromSec;
      setIsPlaying(true);

      const tick = () => {
        const elapsed =
          (performance.now() - startWallTimeRef.current) / 1000;
        const nextSec = startOffsetSecRef.current + elapsed;
        if (nextSec >= maxDuration) {
          setPlayheadSec(0);
          stopPlayback();
          return;
        }
        setPlayheadSec(nextSec);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [playheadSec, stopPlayback, tracks, maxDuration]
  );

  // Import local audio/video file into a new track
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const arr = await file.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arr);
        const newTrack: EditorTrack = {
          id: `upload_${Date.now()}_${i}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          role: 'Imported Stem',
          color: TRACK_COLORS[(tracks.length + i) % TRACK_COLORS.length],
          buffer: audioBuf,
          peaks: computePeaks(audioBuf),
          gain: 1.0,
          pan: 0,
          muted: false,
          solo: false,
          voiceEnhance: true,
          trimStart: 0,
          trimEnd: Number(audioBuf.duration.toFixed(2)),
        };
        setTracks((prev) => [...prev, newTrack]);
        toast.success(`Imported track: ${file.name}`);
      } catch (err) {
        console.error(err);
        toast.error(`Could not decode audio from ${file.name}`);
      }
    }
    await ctx.close().catch(() => {});
  };

  // Master Mixdown Export using OfflineAudioContext
  const handleExportMasterMixdown = async () => {
    if (tracks.length === 0) {
      toast.error('Add at least one track to export');
      return;
    }
    setIsExporting(true);
    try {
      const sampleRate = 48000;
      const totalLen = Math.ceil(maxDuration * sampleRate);
      const offlineCtx = new OfflineAudioContext(2, totalLen, sampleRate);
      const anySolo = tracks.some((t) => t.solo);

      tracks.forEach((t) => {
        if (t.muted) return;
        if (anySolo && !t.solo) return;

        const src = offlineCtx.createBufferSource();
        src.buffer = t.buffer;
        let lastNode: AudioNode = src;

        if (t.voiceEnhance) {
          const hp = offlineCtx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 85;

          const presence = offlineCtx.createBiquadFilter();
          presence.type = 'peaking';
          presence.frequency.value = 3200;
          presence.gain.value = 3.5;

          const comp = offlineCtx.createDynamicsCompressor();
          comp.threshold.value = -20;
          comp.ratio.value = 3.5;

          lastNode.connect(hp);
          hp.connect(presence);
          presence.connect(comp);
          lastNode = comp;
        }

        const gainNode = offlineCtx.createGain();
        gainNode.gain.value = t.gain;

        const panNode = offlineCtx.createStereoPanner();
        panNode.pan.value = t.pan;

        lastNode.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(offlineCtx.destination);

        const playDuration = Math.max(0, t.trimEnd - t.trimStart);
        if (playDuration > 0) {
          src.start(t.trimStart, t.trimStart, playDuration);
        }
      });

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWavBlob(renderedBuffer);
      const dlUrl = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `Podmeet_Master_Episode_48kHz.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(
        'Mastered 16-bit 48kHz Stereo WAV Episode exported!'
      );
    } catch (err) {
      console.error(err);
      toast.error('Mixdown export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#070707] text-zinc-100 flex flex-col pb-20 md:pb-8">
      {/* Top Editor Header (Mobile-First) */}
      <header className="border-b border-white/10 bg-zinc-950/90 backdrop-blur-xl sticky top-0 z-20 pt-safe">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => {
                stopPlayback();
                router.push('/');
              }}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-rose-500 flex items-center justify-center shadow-lg shadow-violet-500/20 shrink-0">
              <Sliders className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-base font-bold text-white truncate">
                  Web Audio DAW
                </h1>
                <span className="hidden xs:inline-flex text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 shrink-0">
                  Multi-Track
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block truncate">
                Mix small-room &amp; remote stems, AI vocal EQ &amp; 48kHz WAV Mixdown
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              onClick={() => router.push('/admin')}
              className="hidden sm:flex px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-amber-300 items-center gap-1.5 transition"
            >
              <Crown className="w-3.5 h-3.5" />
              Super Admin
            </button>

            <label className="cursor-pointer px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 transition">
              <Upload className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden xs:inline">Import</span>
              <input
                type="file"
                accept="audio/*,video/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <button
              onClick={handleExportMasterMixdown}
              disabled={isExporting}
              className="px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-xs font-bold text-white shadow-lg shadow-rose-500/25 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Export WAV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Editor Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Transport & Studio Room Track Importer Bar */}
        <div className="rounded-2xl sm:rounded-3xl bg-zinc-900/90 border border-white/10 p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-2xl">
          {/* Left: Transport Controls */}
          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  stopPlayback();
                  setPlayheadSec(0);
                }}
                title="Return to 00:00"
                className="p-2.5 sm:p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 transition"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (isPlaying) {
                    stopPlayback();
                  } else {
                    startPlayback(playheadSec);
                  }
                }}
                className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-rose-500 hover:from-violet-500 hover:to-rose-400 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-violet-600/25 transition"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" /> Play Mix
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  stopPlayback();
                  setPlayheadSec(0);
                }}
                className="p-2.5 sm:p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 transition"
              >
                <Square className="w-4 h-4" />
              </button>
            </div>

            {/* Timecode Readout */}
            <div className="px-3 py-2 rounded-2xl bg-zinc-950 border border-white/10 font-mono text-xs sm:text-sm font-bold text-emerald-400">
              {formatTimecode(playheadSec)}{' '}
              <span className="text-zinc-500 text-[11px]">
                / {formatTimecode(maxDuration)}
              </span>
            </div>
          </div>

          {/* Right: Quick DSP & Demo Stem Loader */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setTracks((prev) =>
                  prev.map((t) => ({ ...t, voiceEnhance: true }))
                );
                toast.success(
                  'Applied Broadcast Vocal EQ + Compressor to all tracks!'
                );
              }}
              className="flex-1 sm:flex-initial justify-center px-3 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>AI Voice Polish (All)</span>
            </button>

            {!selectedSessionId && (
              <button
                onClick={loadDemoMultiTrackSession}
                className="flex-1 sm:flex-initial justify-center px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Layers className="w-3.5 h-3.5 text-rose-400" />
                <span>Demo 3-Track</span>
              </button>
            )}
          </div>
        </div>

        {/* Recording Session Picker: every session is its own edit */}
        <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Disc className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <h3 className="text-xs font-bold text-white">
                  Edit Session
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Each Master Record is a separate session with its own tracks
                  and its own saved edit.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedRoomId}
                onChange={(e) => {
                  setSelectedRoomId(e.target.value);
                  setSelectedSessionId('');
                }}
                className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-200"
              >
                <option value="">Select Podcast Episode...</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.id})
                  </option>
                ))}
              </select>

              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                disabled={sessions.length === 0}
                className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-200 disabled:opacity-50"
              >
                {sessions.length === 0 && (
                  <option value="">No recording sessions yet</option>
                )}
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {new Date(s.startedAt).toLocaleString()}
                  </option>
                ))}
              </select>

              {selectedSession && (
                <span
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    saveState === 'saving'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : saveState === 'saved'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-white/5 text-zinc-400 border-white/10'
                  }`}
                >
                  {saveState === 'saving'
                    ? 'Saving edit...'
                    : saveState === 'saved'
                    ? 'Edit saved'
                    : 'Edit autosaves'}
                </span>
              )}
            </div>
          </div>

          {selectedSessionId && (
            <div className="flex flex-wrap gap-2">
              {sessionTracks.length === 0 && (
                <p className="text-[11px] text-zinc-500">
                  No tracks have been uploaded for this session yet. They appear
                  here automatically when Master Recording stops.
                </p>
              )}
              {sessionTracks.map((st) => {
                const loaded = tracks.some((t) => t.id === st.id);
                const loading = loadingTrackIds.includes(st.id);
                const error = loadErrors[st.id];
                return (
                  <div
                    key={st.id}
                    title={error || undefined}
                    className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 ${
                      error
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        : loaded
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-white/5 border-white/10 text-zinc-300'
                    }`}
                  >
                    {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                    {st.participantName}
                    <span className="font-normal opacity-70">
                      {error
                        ? 'unavailable'
                        : loaded
                        ? 'loaded'
                        : loading
                        ? 'loading'
                        : st.uploadStatus === 'uploading'
                        ? 'uploading'
                        : 'queued'}
                    </span>
                    {error && (
                      <button
                        onClick={() => {
                          setLoadErrors((prev) => {
                            const next = { ...prev };
                            delete next[st.id];
                            return next;
                          });
                          // re-trigger the auto-loader
                          setSessionTracks((prev) => [...prev]);
                        }}
                        className="underline font-semibold"
                      >
                        retry
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {Object.values(loadErrors).length > 0 && (
            <p className="text-[11px] text-rose-300">
              {Object.values(loadErrors)[0]}
            </p>
          )}
        </div>

        {/* Multi-Track Timeline Tracks */}
        <div className="space-y-4">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="rounded-3xl bg-zinc-900/80 border border-white/10 p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center shadow-xl"
            >
              {/* Left Channel Strip (4 cols) */}
              <div className="lg:col-span-4 space-y-3 pr-2 border-b lg:border-b-0 lg:border-r border-white/10 pb-3 lg:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: track.color }}
                    />
                    <span className="text-sm font-bold text-white truncate">
                      {track.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() =>
                        setTracks((prev) =>
                          prev.map((t) =>
                            t.id === track.id ? { ...t, muted: !t.muted } : t
                          )
                        )
                      }
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                        track.muted
                          ? 'bg-rose-500 text-white'
                          : 'bg-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      M
                    </button>
                    <button
                      onClick={() =>
                        setTracks((prev) =>
                          prev.map((t) =>
                            t.id === track.id ? { ...t, solo: !t.solo } : t
                          )
                        )
                      }
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                        track.solo
                          ? 'bg-amber-400 text-zinc-950'
                          : 'bg-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      S
                    </button>
                    <button
                      onClick={() =>
                        setTracks((prev) =>
                          prev.map((t) =>
                            t.id === track.id
                              ? { ...t, voiceEnhance: !t.voiceEnhance }
                              : t
                          )
                        )
                      }
                      title="Broadcast Voice EQ + Compressor"
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition flex items-center gap-1 ${
                        track.voiceEnhance
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-white/5 text-zinc-500'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      EQ
                    </button>
                    <button
                      onClick={() =>
                        setTracks((prev) =>
                          prev.filter((t) => t.id !== track.id)
                        )
                      }
                      className="p-1 text-zinc-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Volume & Pan Sliders */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <div className="flex justify-between text-zinc-400 mb-1">
                      <span className="flex items-center gap-1">
                        <Volume2 className="w-3 h-3" /> Gain
                      </span>
                      <span>{Math.round(track.gain * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={track.gain}
                      onChange={(e) =>
                        setTracks((prev) =>
                          prev.map((t) =>
                            t.id === track.id
                              ? { ...t, gain: parseFloat(e.target.value) }
                              : t
                          )
                        )
                      }
                      className="w-full accent-rose-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-zinc-400 mb-1">
                      <span>Stereo Pan</span>
                      <span>
                        {track.pan === 0
                          ? 'Center'
                          : track.pan < 0
                          ? `L ${Math.round(Math.abs(track.pan) * 100)}%`
                          : `R ${Math.round(track.pan * 100)}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={track.pan}
                      onChange={(e) =>
                        setTracks((prev) =>
                          prev.map((t) =>
                            t.id === track.id
                              ? { ...t, pan: parseFloat(e.target.value) }
                              : t
                          )
                        )
                      }
                      className="w-full accent-violet-500"
                    />
                  </div>
                </div>

                {/* Trim Start / End Controls */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <div className="flex justify-between text-zinc-400 mb-1">
                      <span className="flex items-center gap-1">
                        <Scissors className="w-3 h-3" /> Trim In
                      </span>
                      <span>{track.trimStart.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0.1, track.trimEnd - 0.5)}
                      step={0.1}
                      value={track.trimStart}
                      onChange={(e) =>
                        setTracks((prev) =>
                          prev.map((t) =>
                            t.id === track.id
                              ? { ...t, trimStart: parseFloat(e.target.value) }
                              : t
                          )
                        )
                      }
                      className="w-full accent-emerald-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-zinc-400 mb-1">
                      <span>Trim Out</span>
                      <span>{track.trimEnd.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={track.trimStart + 0.5}
                      max={track.buffer.duration}
                      step={0.1}
                      value={track.trimEnd}
                      onChange={(e) =>
                        setTracks((prev) =>
                          prev.map((t) =>
                            t.id === track.id
                              ? { ...t, trimEnd: parseFloat(e.target.value) }
                              : t
                          )
                        )
                      }
                      className="w-full accent-emerald-400"
                    />
                  </div>
                </div>
              </div>

              {/* Right Waveform Canvas (8 cols) */}
              <div className="lg:col-span-8">
                <TrackWaveformCanvas
                  track={track}
                  maxDuration={maxDuration}
                  playheadSec={playheadSec}
                  onSeek={(sec) => {
                    setPlayheadSec(sec);
                    if (isPlaying) {
                      startPlayback(sec);
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Mobile-First Bottom Tab Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-white/10 pb-safe">
        <div className="grid grid-cols-3 h-14">
          <button
            onClick={() => {
              stopPlayback();
              router.push('/');
            }}
            className="flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white font-medium text-[11px]"
          >
            <Disc className="w-4 h-4" />
            <span>Studios</span>
          </button>
          <button
            onClick={() => router.push('/editor')}
            className="flex flex-col items-center justify-center gap-1 text-violet-400 font-semibold text-[11px]"
          >
            <Sliders className="w-4 h-4" />
            <span>Audio Editor</span>
          </button>
          <button
            onClick={() => {
              stopPlayback();
              router.push('/admin');
            }}
            className="flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white font-medium text-[11px]"
          >
            <Crown className="w-4 h-4" />
            <span>Crew &amp; Admin</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function PodcastEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#070707] text-zinc-400 flex items-center justify-center text-sm">
          Loading Web Audio Studio DAW...
        </div>
      }
    >
      <PodcastEditorInner />
    </Suspense>
  );
}

