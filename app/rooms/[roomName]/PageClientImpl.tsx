'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { VideoCodec } from 'livekit-client';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  Radio,
  Square,
  Copy,
  Check,
  Download,
  FileAudio,
  MessageSquare,
  Disc,
  Music,
  Bookmark,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  ArrowLeft,
  CloudUpload,
  Loader2,
  Crown,
  Sliders,
  CheckCircle2,
  ShieldCheck,
  Headphones,
  Smartphone,
  X,
  ChevronDown,
} from 'lucide-react';
import { useAuth, SUPER_ADMIN_EMAIL } from '@/lib/AuthContext';
import MicSelector from '@/lib/MicSelector';
import {
  MicSourceMode,
  classifyMicLabel,
  findBestMicForMode,
  getSavedMicSelection,
  saveMicSelection,
} from '@/lib/mic-utils';
import {
  PodcastRoom,
  PodcastMember,
  LobbyParticipant,
  StudioTrackRecord,
  StudioChatMessage,
  StudioMarker,
  ensurePodcastRoomExists,
  subscribeToRoom,
  setRoomRecordingState,
  setRoomRecordingMode,
  subscribeToRoomTracks,
  sendStudioMessage,
  subscribeToRoomMessages,
  addStudioMarker,
  subscribeToRoomMarkers,
  subscribeToPodcastMembers,
  updateLobbyPresence,
  removeLobbyPresence,
  subscribeToRoomLobby,
  triggerMasterLobbyRecordingSession,
} from '@/lib/podcast-service';
import {
  getSupportedMimeType,
  uploadTrackToFirebase,
  convertBlobToWav,
  fetchTrackBlob,
} from '@/lib/local-recorder';
import { useWebRTCStudio, StudioParticipant } from '@/lib/useWebRTCStudio';
import { playPodcastSoundEffect } from '@/lib/soundboard';
import { shareLobbyLink } from '@/lib/share-utils';
import toast from 'react-hot-toast';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildSyntheticBars(level = 0): number[] {
  const base = Math.max(8, level);
  return [
    base * 0.5,
    base * 0.85,
    base * 0.65,
    base,
    base * 0.75,
    base * 0.9,
    base * 0.6,
    base * 0.8,
    base * 0.7,
    base * 0.95,
    base * 0.55,
    base * 0.7,
  ].map((v) => Math.max(10, Math.min(100, Math.round(v))));
}

function VideoStreamTile({
  stream,
  muted,
  videoEnabled,
  displayName,
  photoURL,
  role,
  audioEnabled,
  isRecording,
  isScreenSharing,
  waveformBars,
  remoteAudioLevel,
  isLocal,
  smallRoomMode,
  micMode,
}: {
  stream: MediaStream | null | undefined;
  muted: boolean;
  videoEnabled: boolean;
  displayName: string;
  photoURL?: string | null;
  role: 'host' | 'guest' | string;
  audioEnabled: boolean;
  isRecording: boolean;
  isScreenSharing?: boolean;
  waveformBars?: number[];
  remoteAudioLevel?: number;
  isLocal?: boolean;
  smallRoomMode?: boolean;
  micMode?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // In Small-Room mode, ALL audio output is strictly muted so there is NEVER acoustic feedback
  const effectiveMuted = Boolean(isLocal || muted || smallRoomMode);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = effectiveMuted;
    }
  }, [stream, videoEnabled, isScreenSharing, effectiveMuted]);

  const hasVideoTrack =
    !!stream &&
    stream.getVideoTracks().length > 0 &&
    (videoEnabled || isScreenSharing);

  const currentLevel = audioEnabled ? (remoteAudioLevel ?? 0) : 0;
  const isSpeaking = currentLevel > 14;
  const isHot = currentLevel > 80;
  const isWarm = currentLevel > 60;

  const bars =
    waveformBars ||
    buildSyntheticBars(audioEnabled ? (currentLevel > 0 ? currentLevel : 18) : 6);

  return (
    <div className={`relative rounded-2xl sm:rounded-3xl bg-zinc-900/90 border transition-all duration-150 overflow-hidden flex flex-col justify-between min-h-[148px] sm:min-h-[178px] sm:aspect-video shadow-xl group ${
      isSpeaking ? 'border-emerald-500/60 ring-2 ring-emerald-400/40 shadow-emerald-500/10' : 'border-white/10'
    }`}>
      {hasVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={effectiveMuted}
          className={`w-full h-full object-cover ${
            isLocal && !isScreenSharing ? 'scale-x-[-1]' : ''
          }`}
        />
      ) : (
        <div className="w-full h-full flex-1 flex flex-col items-center justify-center py-6 px-4 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 relative">
          {/* Only render remote <audio> if NOT in small-room mode and NOT muted */}
          {!effectiveMuted && stream && (
            <audio
              autoPlay
              ref={(el) => {
                if (el && el.srcObject !== stream) {
                  el.srcObject = stream;
                }
              }}
            />
          )}
          <div className="relative">
            {isSpeaking && (
              <div className="absolute -inset-3 rounded-full bg-emerald-500/30 animate-pulse blur-md" />
            )}
            {photoURL ? (
              <img
                src={photoURL}
                alt={displayName}
                className={`relative w-14 h-14 sm:w-20 sm:h-20 rounded-full object-cover ring-4 shadow-xl transition-all ${
                  isSpeaking ? 'ring-emerald-400' : 'ring-white/10'
                }`}
              />
            ) : (
              <div className={`relative w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-rose-500 to-violet-600 flex items-center justify-center text-xl sm:text-2xl font-extrabold text-white ring-4 shadow-xl transition-all ${
                isSpeaking ? 'ring-emerald-400' : 'ring-white/10'
              }`}>
                {(displayName || 'P')[0].toUpperCase()}
              </div>
            )}
          </div>
          <p className="mt-2.5 text-xs sm:text-sm font-bold text-zinc-100 text-center truncate max-w-full">
            {displayName} {isLocal ? '(You)' : ''}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {smallRoomMode ? (
              <span className="text-[10px] sm:text-[11px] text-zinc-400 flex items-center gap-1">
                <VolumeX className="w-3 h-3 text-emerald-400" />
                <span>Speakers Muted</span>
              </span>
            ) : audioEnabled ? (
              <span className="text-[10px] sm:text-[11px] text-zinc-400">
                48kHz Audio Active
              </span>
            ) : (
              <span className="text-[10px] sm:text-[11px] text-rose-400">
                Microphone Muted
              </span>
            )}
            {micMode && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-zinc-300 font-medium">
                {micMode === 'headphone' ? '🎧 Headphone' : '📱 Phone Mic'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Top Overlay Badges */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border ${
              role === 'super_admin'
                ? 'bg-amber-500/25 text-amber-300 border-amber-500/40'
                : role === 'sub_admin'
                ? 'bg-violet-500/25 text-violet-300 border-violet-500/40'
                : role === 'host'
                ? 'bg-rose-500/25 text-rose-300 border-rose-500/40'
                : 'bg-zinc-800/80 text-zinc-300 border-white/10'
            }`}
          >
            {role === 'super_admin' ? 'Super Admin' : role === 'sub_admin' ? 'Sub Admin' : role === 'host' ? 'Host' : 'Co-Host'}
          </span>
          {smallRoomMode && (
            <span className="px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md flex items-center gap-1">
              <VolumeX className="w-2.5 h-2.5" />
              Zero Feedback
            </span>
          )}
        </div>

        {isRecording && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/75 border border-rose-500/50 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            <span className="text-[9px] sm:text-[10px] font-mono font-semibold text-rose-300">
              REC
            </span>
          </div>
        )}
      </div>

      {/* Bottom Participant Bar + Live Waveform & Numerical Level */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between px-3 py-1.5 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {audioEnabled ? (
            <Mic className={`w-3.5 h-3.5 shrink-0 ${isSpeaking ? 'text-emerald-400' : 'text-zinc-400'}`} />
          ) : (
            <MicOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          )}
          <span className="text-[11px] sm:text-xs font-semibold text-white truncate">
            {displayName} {isLocal ? '(You)' : ''}
          </span>
        </div>

        {/* Individual Mic Level readout & animated Waveform fallback */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Numerical Mic Level Meter */}
          <div className="flex items-center gap-1">
            <div className="w-12 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  !audioEnabled
                    ? 'bg-rose-500'
                    : isHot
                    ? 'bg-rose-500'
                    : isWarm
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
                style={{ width: `${audioEnabled ? Math.max(isSpeaking ? 15 : 4, currentLevel) : 0}%` }}
              />
            </div>
            <span className={`font-mono text-[10px] font-bold ${
              !audioEnabled
                ? 'text-rose-400'
                : isHot
                ? 'text-rose-400'
                : isWarm
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}>
              {audioEnabled ? `${currentLevel}%` : 'MUTE'}
            </span>
          </div>

          {/* Live Waveform Visualizer */}
          <div className="flex items-end gap-[2px] h-3.5 shrink-0">
            {bars.slice(0, 10).map((val, i) => (
              <span
                key={i}
                style={{
                  height: `${audioEnabled ? Math.max(15, val) : 12}%`,
                }}
                className={`w-[2.5px] rounded-full transition-all duration-75 ${
                  audioEnabled ? (isSpeaking ? 'bg-emerald-400' : 'bg-zinc-500') : 'bg-zinc-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PageClientImpl(props: {
  roomName: string;
  serverUrl?: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
  singlePeerConnection: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const memberNameParam = searchParams?.get('member') || '';
  const memberEmailParam = searchParams?.get('email') || '';
  const modeParam = searchParams?.get('mode');

  const { user, isSuperAdmin, isSubAdmin, isAdmin } = useAuth();

  // Stable Lobby Presence ID for this tab
  const [lobbyClientId] = useState(
    () => `lob_${Math.random().toString(36).substring(2, 9)}`
  );

  // Lobby / Green Room State
  // Default video OFF for mobile-first small-room recording so phones act as dedicated studio mics
  const [joined, setJoined] = useState(false);
  const [guestNameInput, setGuestNameInput] = useState(memberNameParam);
  const [preJoinAudio, setPreJoinAudio] = useState(true);
  const [preJoinVideo, setPreJoinVideo] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [micMode, setMicMode] = useState<MicSourceMode>('phone');
  const [previewMicLabel, setPreviewMicLabel] = useState<string>('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [previewLevel, setPreviewLevel] = useState(0);
  const [showStudioMicSheet, setShowStudioMicSheet] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // Restore saved mic preference on mount
  useEffect(() => {
    const saved = getSavedMicSelection();
    setMicMode(saved.mode);
    if (saved.deviceId) {
      setSelectedAudioDevice(saved.deviceId);
    }
  }, []);

  // Small Room Mode (No Monitoring / Zero Audio Feedback) vs Remote Mode
  // Defaults to true for the small-room scenario!
  const [smallRoomMode, setSmallRoomMode] = useState<boolean>(
    modeParam !== 'remote'
  );
  // Local speaker mute override (always true when smallRoomMode is true)
  const [speakerMuted, setSpeakerMuted] = useState<boolean>(
    modeParam !== 'remote'
  );

  // Mobile Workspace Tab ('stage' | 'tracks' | 'chat' | 'soundboard')
  const [mobileViewTab, setMobileViewTab] = useState<
    'stage' | 'tracks' | 'chat' | 'soundboard'
  >('stage');

  // Desktop Sidebar Tab ('tracks' | 'chat' | 'soundboard')
  const [activeSidebarTab, setActiveSidebarTab] = useState<
    'tracks' | 'chat' | 'soundboard'
  >('tracks');

  // Room, Roster & Lobby Firestore State
  const [roomData, setRoomData] = useState<PodcastRoom | null>(null);
  const [rosterMembers, setRosterMembers] = useState<PodcastMember[]>([]);
  const [lobbyParticipants, setLobbyParticipants] = useState<
    LobbyParticipant[]
  >([]);
  const [tracks, setTracks] = useState<StudioTrackRecord[]>([]);
  const [messages, setMessages] = useState<StudioChatMessage[]>([]);
  const [markers, setMarkers] = useState<StudioMarker[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Local MediaRecorder State
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [localBlobsByTrackId, setLocalBlobsByTrackId] = useState<
    Record<string, Blob>
  >({});
  const [convertingWavId, setConvertingWavId] = useState<string | null>(null);

  const effectiveDisplayName =
    guestNameInput.trim() ||
    user?.displayName ||
    (isSuperAdmin ? 'Abhishek (Host)' : 'Podcast Member');

  const isHost = Boolean(
    isSuperAdmin ||
      isSubAdmin ||
      !roomData ||
      (user && roomData.hostId === user.uid) ||
      roomData.hostId === 'anon-host'
  );

  // Subscribe to room metadata, roster, lobby, tracks, chat, and markers
  useEffect(() => {
    const unsubRoom = subscribeToRoom(props.roomName, (r) => {
      setRoomData(r);
      if (r?.recordingMode) {
        const isSmall = r.recordingMode === 'small-room';
        setSmallRoomMode(isSmall);
        if (isSmall) {
          setSpeakerMuted(true);
        }
      }
    });
    const unsubMembers = subscribeToPodcastMembers((m) => setRosterMembers(m));
    const unsubLobby = subscribeToRoomLobby(props.roomName, (l) =>
      setLobbyParticipants(l)
    );
    const unsubTracks = subscribeToRoomTracks(props.roomName, (t) =>
      setTracks(t)
    );
    const unsubMsgs = subscribeToRoomMessages(props.roomName, (m) =>
      setMessages(m)
    );
    const unsubMarkers = subscribeToRoomMarkers(props.roomName, (mk) =>
      setMarkers(mk)
    );
    return () => {
      unsubRoom();
      unsubMembers();
      unsubLobby();
      unsubTracks();
      unsubMsgs();
      unsubMarkers();
    };
  }, [props.roomName]);

  useEffect(() => {
    if (user?.displayName && !guestNameInput) {
      setGuestNameInput(user.displayName);
    }
  }, [user, guestNameInput]);

  // Toggle Small-Room Mode (syncs to Firestore so all phones in the small room mute monitoring together)
  const handleToggleSmallRoomMode = async (nextSmallRoom: boolean) => {
    setSmallRoomMode(nextSmallRoom);
    setSpeakerMuted(nextSmallRoom);
    if (nextSmallRoom) {
      setPreJoinVideo(false);
    }
    try {
      await setRoomRecordingMode(
        props.roomName,
        nextSmallRoom ? 'small-room' : 'remote'
      );
      toast.success(
        nextSmallRoom
          ? 'Small-Room Mode ON: All speakers muted (Zero Audio Feedback)'
          : 'Remote Mode ON: Headphone audio monitoring enabled'
      );
    } catch {
      // Ignore offline/uncreated room state
    }
  };

  // Sync this member's Lobby Presence & Live Mic Level in Firestore so all waiting members see each other's mic level
  useEffect(() => {
    if (!props.roomName) return;

    const syncPresence = () => {
      const curLevel = preJoinAudio ? previewLevel : 0;
      updateLobbyPresence(props.roomName, {
        id: lobbyClientId,
        uid: user?.uid || lobbyClientId,
        name: effectiveDisplayName,
        email:
          memberEmailParam ||
          user?.email ||
          (isSuperAdmin ? SUPER_ADMIN_EMAIL : null),
        role: isSuperAdmin ? 'super_admin' : isSubAdmin ? 'sub_admin' : isHost ? 'host' : 'co-host',
        micReady: preJoinAudio,
        camReady: preJoinVideo,
        inStudio: joined,
        audioLevel: curLevel,
        micMode: micMode,
        updatedAt: Date.now(),
      }).catch(() => {});
    };

    syncPresence();
    const interval = setInterval(syncPresence, 500);

    const handleUnload = () => {
      removeLobbyPresence(props.roomName, lobbyClientId);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [
    props.roomName,
    lobbyClientId,
    user?.uid,
    user?.email,
    effectiveDisplayName,
    memberEmailParam,
    isSuperAdmin,
    isSubAdmin,
    isHost,
    preJoinAudio,
    preJoinVideo,
    previewLevel,
    micMode,
    joined,
  ]);

  // Track when this participant arrived in the lobby so we only auto-transition them
  // if the Master Record is triggered while they are waiting in the lobby.
  const mountedAtRef = useRef<number>(0);
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  // Auto-transition from Green Room Lobby into Live Studio when Master Record is triggered while waiting!
  useEffect(() => {
    if (!joined && roomData?.sessionLive && roomData?.isRecording) {
      const recStarted = roomData.recordingStartedAt || 0;
      const startedWhileWaiting =
        recStarted > 0 && recStarted >= mountedAtRef.current - 2500;

      if (startedWhileWaiting) {
        toast.success(
          'Master Recording started! Your phone is now recording isolated 48kHz audio.',
          { icon: '🔴' }
        );
        setJoined(true);
      }
    }
  }, [
    joined,
    roomData?.sessionLive,
    roomData?.isRecording,
    roomData?.recordingStartedAt,
  ]);

  const rescanLobbyDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devs = await navigator.mediaDevices.enumerateDevices();
      const audioIn = devs.filter((d) => d.kind === 'audioinput');
      const videoIn = devs.filter((d) => d.kind === 'videoinput');
      setAudioDevices(audioIn);
      setVideoDevices(videoIn);
      return audioIn;
    } catch {
      return [];
    }
  }, []);

  // Listen for headphone plug/unplug while in the Green Room Lobby
  useEffect(() => {
    if (joined || typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return;
    }
    const onDevChange = () => {
      rescanLobbyDevices();
    };
    navigator.mediaDevices.addEventListener?.('devicechange', onDevChange);
    return () => {
      navigator.mediaDevices.removeEventListener?.('devicechange', onDevChange);
    };
  }, [joined, rescanLobbyDevices]);

  // Green Room mic & optional camera preview
  useEffect(() => {
    if (joined) return;

    let active = true;
    let currentStream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let rafId: number;

    const initPreview = async () => {
      try {
        let s: MediaStream;
        try {
          s = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: selectedAudioDevice
                ? { exact: selectedAudioDevice }
                : undefined,
              echoCancellation: !smallRoomMode,
              noiseSuppression: true,
              autoGainControl: !smallRoomMode,
            },
            video: preJoinVideo
              ? selectedVideoDevice
                ? { deviceId: { exact: selectedVideoDevice } }
                : true
              : false,
          });
        } catch {
          // Fallback if saved deviceId was unplugged
          s = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: !smallRoomMode,
              noiseSuppression: true,
              autoGainControl: !smallRoomMode,
            },
            video: preJoinVideo,
          });
        }
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        s.getAudioTracks().forEach((t) => (t.enabled = preJoinAudio));
        currentStream = s;

        const firstAudioTrack = s.getAudioTracks()[0];
        if (firstAudioTrack?.label) {
          setPreviewMicLabel(firstAudioTrack.label);
        }

        if (previewVideoRef.current && preJoinVideo) {
          previewVideoRef.current.srcObject = s;
        }

        const devs = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devs.filter((d) => d.kind === 'audioinput');
        setAudioDevices(audioInputs);
        setVideoDevices(devs.filter((d) => d.kind === 'videoinput'));

        // If user chose 'headphone' or 'phone' mode and no specific deviceId was bound yet, bind best match
        if (!selectedAudioDevice && audioInputs.length > 0) {
          const saved = getSavedMicSelection();
          if (saved.mode === 'headphone') {
            const bestHp = findBestMicForMode(audioInputs, 'headphone');
            if (bestHp?.deviceId) {
              setSelectedAudioDevice(bestHp.deviceId);
            }
          }
        }

        if (preJoinAudio && s.getAudioTracks().length > 0) {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          audioCtx = new AudioCtx();
          const src = audioCtx.createMediaStreamSource(s);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 32;
          src.connect(analyser);
          const arr = new Uint8Array(analyser.frequencyBinCount);
          const updateMeter = () => {
            analyser.getByteFrequencyData(arr);
            const avg =
              arr.reduce((acc, v) => acc + v, 0) / Math.max(1, arr.length);
            setPreviewLevel(Math.min(100, Math.round((avg / 175) * 100)));
            rafId = requestAnimationFrame(updateMeter);
          };
          rafId = requestAnimationFrame(updateMeter);
        } else {
          setPreviewLevel(0);
        }
      } catch (e) {
        console.warn('Green room preview fallback:', e);
      }
    };

    initPreview();

    return () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [
    joined,
    preJoinAudio,
    preJoinVideo,
    selectedAudioDevice,
    selectedVideoDevice,
    smallRoomMode,
  ]);

  // WebRTC & Local Mic Studio Hook
  const {
    localStream,
    screenStream,
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    isLocalRecording,
    remoteParticipants,
    audioLevel,
    waveformBars,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    setRecordingStatus,
    activeMicLabel,
    studioAudioDevices,
    refreshAudioDevices,
    switchAudioDevice,
  } = useWebRTCStudio({
    roomId: props.roomName,
    joined,
    uid: user?.uid || 'guest',
    displayName: effectiveDisplayName,
    photoURL: user?.photoURL || null,
    role: isHost ? 'host' : 'guest',
    initialAudioEnabled: preJoinAudio,
    initialVideoEnabled: preJoinVideo,
    selectedAudioDeviceId: selectedAudioDevice || undefined,
    selectedVideoDeviceId: selectedVideoDevice || undefined,
    smallRoomMode,
  });

  const effectiveAudioDevices =
    studioAudioDevices.length > 0 ? studioAudioDevices : audioDevices;
  const effectiveActiveMicLabel = activeMicLabel || previewMicLabel;

  const handleSelectMic = useCallback(
    async (deviceId: string, nextMode: MicSourceMode) => {
      setMicMode(nextMode);
      setSelectedAudioDevice(deviceId);
      saveMicSelection(nextMode, deviceId);
      if (joined) {
        await switchAudioDevice(deviceId);
      }
    },
    [joined, switchAudioDevice]
  );

  const handleQuickStudioMicMode = useCallback(
    async (targetMode: 'phone' | 'headphone') => {
      let currentDevs = effectiveAudioDevices;
      const refreshed = joined
        ? await refreshAudioDevices()
        : await rescanLobbyDevices();
      if (refreshed.length > 0) {
        currentDevs = refreshed;
      }
      const best = findBestMicForMode(currentDevs, targetMode);
      const nextId =
        targetMode === 'headphone'
          ? best?.deviceId || selectedAudioDevice || ''
          : best?.deviceId || '';
      await handleSelectMic(nextId, targetMode);
      if (targetMode === 'headphone') {
        toast.success(
          best?.label
            ? `Switched to Headphone Mic (${best.label})`
            : 'Headphone Mic mode active!'
        );
      } else {
        toast.success(
          best?.label
            ? `Switched to Phone's Mic (${best.label})`
            : "Switched to Phone's Built-in Mic!"
        );
      }
    },
    [
      effectiveAudioDevices,
      joined,
      refreshAudioDevices,
      rescanLobbyDevices,
      selectedAudioDevice,
      handleSelectMic,
    ]
  );

  // Start local high-resolution MediaRecorder
  const startLocalTrackRecorder = useCallback(
    async (sessionId: string) => {
      if (!localStream || mediaRecorderRef.current?.state === 'recording') {
        return;
      }
      try {
        const hasVideo =
          localStream.getVideoTracks().length > 0 && videoEnabled;
        const mimeType = getSupportedMimeType(hasVideo);
        const recorder = new MediaRecorder(localStream, {
          mimeType,
          audioBitsPerSecond: 192000,
          videoBitsPerSecond: hasVideo ? 3500000 : undefined,
        });

        recordedChunksRef.current = [];
        recordingStartTimeRef.current = Date.now();

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            recordedChunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          if (mediaRecorderRef.current === recorder) {
            mediaRecorderRef.current = null;
          }
          const durationSec =
            (Date.now() - recordingStartTimeRef.current) / 1000;
          const mime = recorder.mimeType || mimeType;
          const blob = new Blob(recordedChunksRef.current, { type: mime });
          await setRecordingStatus(false);

          if (blob.size === 0) return;

          toast.loading('Saving & syncing your isolated mic track...', {
            id: 'upload-toast',
          });

          const record = await uploadTrackToFirebase({
            roomId: props.roomName,
            sessionId,
            participantId: user?.uid || 'guest',
            participantName: effectiveDisplayName,
            role: isHost ? 'host' : 'guest',
            blob,
            durationSec,
            kind: hasVideo ? 'video-audio' : 'audio-only',
          });

          setLocalBlobsByTrackId((prev) => ({
            ...prev,
            [record.id]: blob,
          }));

          toast.success(
            'Track saved! Ready in Tracks tab & Web Audio Editor.',
            { id: 'upload-toast' }
          );
          setActiveSidebarTab('tracks');
          setMobileViewTab('tracks');
        };

        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        await setRecordingStatus(true);
      } catch (err) {
        console.error('Failed to start local recorder:', err);
        toast.error('Could not start local track recorder');
      }
    },
    [
      localStream,
      videoEnabled,
      props.roomName,
      user?.uid,
      effectiveDisplayName,
      isHost,
      setRecordingStatus,
    ]
  );

  const stopLocalTrackRecorder = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  // Synchronize every participant's local recorder with roomData.isRecording!
  useEffect(() => {
    if (!joined || !localStream) return;
    if (roomData?.isRecording) {
      const sessId = roomData.currentSessionId || `sess_${Date.now()}`;
      startLocalTrackRecorder(sessId);
    } else {
      stopLocalTrackRecorder();
    }
  }, [
    joined,
    localStream,
    roomData?.isRecording,
    roomData?.currentSessionId,
    startLocalTrackRecorder,
    stopLocalTrackRecorder,
  ]);

  // Recording elapsed timer
  useEffect(() => {
    if (!roomData?.isRecording && !isLocalRecording) {
      setRecordingSeconds(0);
      return;
    }
    const startMs = roomData?.recordingStartedAt || Date.now();
    const interval = setInterval(() => {
      setRecordingSeconds(
        Math.max(0, Math.floor((Date.now() - startMs) / 1000))
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [roomData?.isRecording, roomData?.recordingStartedAt, isLocalRecording]);

  const handleToggleMasterRecording = async () => {
    const currentlyRecording = roomData?.isRecording || isLocalRecording;
    if (currentlyRecording) {
      await setRoomRecordingState(props.roomName, false);
      stopLocalTrackRecorder();
      toast('Recording stopped. Syncing all member tracks...', {
        icon: 'ðŸŽ¬',
      });
    } else {
      const sessionId = `ep_${Date.now()}`;
      await triggerMasterLobbyRecordingSession(props.roomName, sessionId);
      await startLocalTrackRecorder(sessionId);
      toast.success(
        smallRoomMode
          ? 'Master Recording started! Capturing isolated mics (Speakers Muted).'
          : 'Master Recording started! Capturing isolated HD tracks for all members.'
      );
    }
  };

  // Master Record Button directly inside the Green Room Lobby!
  const handleStartMasterRecordFromLobby = async () => {
    try {
      let currentUser = user;
      await ensurePodcastRoomExists(
        props.roomName,
        currentUser?.uid || 'admin',
        effectiveDisplayName,
        currentUser?.photoURL || null,
        isSuperAdmin
      );
      await setRoomRecordingMode(
        props.roomName,
        smallRoomMode ? 'small-room' : 'remote'
      );
      const sessionId = `master_ep_${Date.now()}`;
      await triggerMasterLobbyRecordingSession(props.roomName, sessionId);
      setJoined(true);
      toast.success(
        'Master Recording launched for all phones in the room!'
      );
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to start recording. Only super admins can create new rooms.');
    }
  };

  const handleEnterStudio = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let currentUser = user;
      await ensurePodcastRoomExists(
        props.roomName,
        currentUser?.uid || 'guest',
        effectiveDisplayName,
        currentUser?.photoURL || null,
        isSuperAdmin
      );
      setJoined(true);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'This room does not exist. Only super admins can create new rooms.');
    }
  };

  const handleCopyInvite = async () => {
    const result = await shareLobbyLink({
      roomId: props.roomName,
      roomTitle: roomData?.title,
      mode: smallRoomMode ? 'small-room' : 'remote',
    });

    if (result.success) {
      setCopiedLink(true);
      if (result.method === 'clipboard') {
        toast.success(
          'Studio Lobby link copied! Everyone in the room can open it on their phone.',
          { icon: '🎙️' }
        );
      }
      setTimeout(() => setCopiedLink(false), 2500);
    } else if (result.method !== 'cancelled') {
      toast.error('Could not copy lobby link');
    }
  };

  const handleDownloadWav = async (track: StudioTrackRecord) => {
    try {
      setConvertingWavId(track.id);
      const sourceBlob =
        localBlobsByTrackId[track.id] || (await fetchTrackBlob(track));
      const wavBlob = await convertBlobToWav(sourceBlob);
      const wavUrl = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = wavUrl;
      a.download = `${track.participantName.replace(/\s+/g, '_')}_48kHz_Lossless.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Exported uncompressed 16-bit PCM WAV stem!');
    } catch (err) {
      console.error('WAV conversion error:', err);
      toast.error(
        err instanceof Error ? err.message : 'Could not convert to WAV'
      );
    } finally {
      setConvertingWavId(null);
    }
  };

  const handleDownloadOriginal = async (track: StudioTrackRecord) => {
    try {
      const blob =
        localBlobsByTrackId[track.id] || (await fetchTrackBlob(track));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${track.participantName.replace(/\s+/g, '_')}_track.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Track is not available here'
      );
    }
  };

  const handleAddChapterMarker = async () => {
    await addStudioMarker({
      roomId: props.roomName,
      label: `Highlight @ ${formatDuration(recordingSeconds)}`,
      timestampSec: recordingSeconds,
      createdBy: effectiveDisplayName,
    });
    toast.success(`Marker dropped at ${formatDuration(recordingSeconds)}`);
  };

  // Shared Sidebar / Tab Panels (Tracks, Chat, Soundboard)
  const renderTracksPanel = () => (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-2.5">
        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
          <CloudUpload className="w-4 h-4 text-emerald-400" />
          Isolated Multi-Track Stems ({tracks.length})
        </h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Every member&apos;s phone records its own local 48kHz stem and syncs
          it here when Master Recording stops.
        </p>
        <button
          onClick={() =>
            router.push(
              `/editor?roomId=${props.roomName}${
                roomData?.currentSessionId || tracks[0]?.sessionId
                  ? `&sessionId=${
                      roomData?.currentSessionId || tracks[0]?.sessionId
                    }`
                  : ''
              }`
            )
          }
          className="w-full py-2.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg shadow-violet-600/20"
        >
          <Sliders className="w-3.5 h-3.5" />
          Mix All Stems in Web Audio Editor
        </button>
      </div>

      {tracks.length === 0 ? (
        <div className="text-center py-10 px-4">
          <FileAudio className="w-9 h-9 text-zinc-600 mx-auto mb-2" />
          <p className="text-xs font-semibold text-zinc-300">
            No recorded tracks yet
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Tap &ldquo;Master Record&rdquo; at the bottom to capture isolated
            audio from every phone in the room.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="rounded-2xl bg-zinc-900 border border-white/10 p-3.5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">
                      {track.participantName}
                    </span>
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-white/5 text-zinc-400">
                      {track.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Duration: {formatDuration(track.durationSec)} â€¢{' '}
                    {formatBytes(track.sizeBytes)}
                  </p>
                </div>

                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    track.uploadStatus === 'ready'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : track.uploadStatus === 'uploading'
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  }`}
                >
                  {track.uploadStatus === 'ready'
                    ? 'Cloud Synced'
                    : track.uploadStatus === 'uploading'
                    ? 'Uploading...'
                    : 'Saved on Device'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleDownloadOriginal(track)}
                  className="py-2.5 px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5 text-rose-400" />
                  HD WebM
                </button>

                <button
                  onClick={() => handleDownloadWav(track)}
                  disabled={convertingWavId === track.id}
                  className="py-2.5 px-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  {convertingWavId === track.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileAudio className="w-3.5 h-3.5" />
                  )}
                  16-Bit WAV
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {markers.length > 0 && (
        <div className="pt-3 border-t border-white/10 space-y-2">
          <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            Episode Edit Markers ({markers.length})
          </h4>
          {markers.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5"
            >
              <span className="text-zinc-200">{m.label}</span>
              <span className="font-mono text-amber-400">
                {formatDuration(m.timestampSec)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderChatPanel = (isStudioRecording: boolean) => (
    <div className="flex-1 flex flex-col overflow-hidden">
      {roomData?.description && (
        <div className="p-3.5 bg-zinc-900/90 border-b border-white/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-1">
            Show Notes / Teleprompter
          </p>
          <p className="text-xs text-zinc-200 leading-relaxed">
            {roomData.description}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-zinc-500 py-8 px-4">
            Send silent cues or talking points to other members in the room
            without speaking into the microphones.
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className="rounded-2xl bg-zinc-900/90 border border-white/10 p-3"
            >
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span className="font-semibold text-zinc-200">
                  {msg.senderName}
                </span>
                {msg.recordingTimestampSec != null && (
                  <span className="font-mono text-rose-400">
                    @{formatDuration(msg.recordingTimestampSec)}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-200 break-words">{msg.text}</p>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!chatInput.trim()) return;
          const text = chatInput.trim();
          setChatInput('');
          await sendStudioMessage({
            roomId: props.roomName,
            senderId: user?.uid || 'guest',
            senderName: effectiveDisplayName,
            text,
            recordingTimestampSec: isStudioRecording ? recordingSeconds : null,
          });
        }}
        className="p-3 border-t border-white/10 flex gap-2 bg-zinc-950"
      >
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Send silent cue to room..."
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white focus:outline-none focus:border-rose-500"
        />
        <button
          type="submit"
          className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white transition"
        >
          Send
        </button>
      </form>
    </div>
  );

  const renderSoundboardPanel = () => (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
      {smallRoomMode && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] text-amber-200 flex items-start gap-2">
          <VolumeX className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Small-Room Tip:</strong> Sound pads play through your device
            speaker. Keep volume moderate in a small room so it doesn&apos;t
            clip open mics, or add music beds later in the Web Audio Editor.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {[
          {
            id: 'intro' as const,
            label: 'Podcast Intro',
            desc: 'Warm 4-note chime',
            color: 'from-rose-500/20 to-orange-500/20 border-rose-500/30',
          },
          {
            id: 'rimshot' as const,
            label: 'Ba-Dum-Tss',
            desc: 'Punchline rimshot',
            color: 'from-amber-500/20 to-yellow-500/20 border-amber-500/30',
          },
          {
            id: 'woosh' as const,
            label: 'Topic Transition',
            desc: 'Smooth air swoosh',
            color: 'from-sky-500/20 to-indigo-500/20 border-sky-500/30',
          },
          {
            id: 'boom' as const,
            label: 'Dramatic Drop',
            desc: 'Sub-bass boom',
            color: 'from-violet-500/20 to-purple-500/20 border-violet-500/30',
          },
          {
            id: 'chime' as const,
            label: 'Bonus Bell',
            desc: 'Crystal alert chime',
            color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
          },
          {
            id: 'fanfare' as const,
            label: 'Victory Fanfare',
            desc: 'Celebration chord',
            color: 'from-pink-500/20 to-rose-500/20 border-pink-500/30',
          },
        ].map((pad) => (
          <button
            key={pad.id}
            onClick={() => playPodcastSoundEffect(pad.id)}
            className={`p-3.5 rounded-2xl bg-gradient-to-br ${pad.color} border text-left active:scale-95 transition`}
          >
            <Volume2 className="w-4 h-4 text-white mb-1.5" />
            <p className="text-xs font-bold text-white">{pad.label}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">{pad.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );

  // ============================================================================
  // RENDER 1: MOBILE-FIRST GREEN ROOM LOBBY (SMALL ROOM MIC CHECK & ROSTER)
  // ============================================================================
  if (!joined) {
    return (
      <div className="min-h-[100dvh] bg-[#090a0f] text-zinc-100 flex flex-col justify-between p-3.5 sm:p-6 pb-safe pt-safe">
        {/* Top Bar */}
        <div className="max-w-6xl w-full mx-auto flex items-center justify-between gap-2 pb-3 border-b border-white/10">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Home</span>
          </button>

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-rose-400">
              Code: {props.roomName}
            </span>
            <button
              onClick={handleCopyInvite}
              className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1 transition"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Share</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mobile-First Main Lobby Content */}
        <div className="max-w-6xl w-full mx-auto my-auto py-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* FIRST ON MOBILE: Identity, Small-Room Mode Switch & Master Record Trigger (7 cols on lg) */}
          <div className="lg:col-span-7 rounded-3xl bg-zinc-900/90 border border-white/10 p-4 sm:p-6 shadow-2xl space-y-5 order-1">
            {/* Title + Mode Badge */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold mb-1.5">
                  <Sparkles className="w-3 h-3" />
                  {smallRoomMode
                    ? 'Small-Room Pocket Recorder'
                    : 'Remote Studio Lobby'}
                </span>
                <h1 className="text-lg sm:text-2xl font-extrabold text-white">
                  {roomData?.title || `Studio #${props.roomName.slice(0, 6)}`}
                </h1>
              </div>
            </div>

            {/* Live Recording In Progress Alert (if guest arrived while room is recording) */}
            {roomData?.isRecording && (
              <div className="rounded-2xl bg-rose-500/15 border border-rose-500/40 p-3 flex items-center justify-between gap-2.5 text-rose-200">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
                  <span className="text-xs font-semibold">
                    Live Recording is currently active in this studio! Test your mic below and tap &quot;Join Live Recording&quot; to enter.
                  </span>
                </div>
              </div>
            )}

            {/* Direct Lobby Share Card */}
            <div className="rounded-2xl bg-zinc-950/80 border border-white/10 p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <Copy className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    Invite Guests to Exact Lobby
                  </p>
                  <p className="text-[11px] font-mono text-zinc-400 truncate">
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}/rooms/${props.roomName}`
                      : `/rooms/${props.roomName}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="py-2 px-3.5 rounded-xl bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0 shadow-lg shadow-rose-500/20"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Share Lobby</span>
                  </>
                )}
              </button>
            </div>

            {/* Scenario Toggle: Small Room (No Monitoring) vs Remote (Headphones) */}
            <div className="rounded-2xl bg-zinc-950/90 border border-white/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Audio Mode (Synced for Room)
                </span>
                <span className="text-[11px] font-semibold text-emerald-400">
                  {smallRoomMode ? 'Zero Feedback Active' : 'Live Call Audio'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleSmallRoomMode(true)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                    smallRoomMode
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow'
                      : 'bg-white/5 border-white/5 text-zinc-400'
                  }`}
                >
                  <VolumeX className="w-4 h-4 shrink-0" />
                  <span>Small Room (No Monitor)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleSmallRoomMode(false)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                    !smallRoomMode
                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-300 shadow'
                      : 'bg-white/5 border-white/5 text-zinc-400'
                  }`}
                >
                  <Headphones className="w-4 h-4 shrink-0" />
                  <span>Remote (Headphones)</span>
                </button>
              </div>
              {smallRoomMode && (
                <p className="text-[11px] text-zinc-400 leading-snug pt-0.5">
                  All members in the same room: <strong>speakers are muted</strong>{' '}
                  so there is zero audio feedback. Only your local microphone is
                  recorded at 48kHz.
                </p>
              )}
            </div>

            {/* Your Name + Live Mic Check Meter */}
            <form onSubmit={handleEnterStudio} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Your Name (Labels your isolated audio track)
                </label>
                <input
                  type="text"
                  required
                  value={guestNameInput}
                  onChange={(e) => setGuestNameInput(e.target.value)}
                  placeholder="Enter your name (e.g., Abhishek, Rohan...)"
                  className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/15 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Prominent Mobile Mic Selector: Phone's Mic vs Headphone Mic */}
              <MicSelector
                audioDevices={effectiveAudioDevices}
                selectedDeviceId={selectedAudioDevice}
                micMode={micMode}
                activeHardwareLabel={effectiveActiveMicLabel}
                audioEnabled={preJoinAudio}
                audioLevel={previewLevel}
                onSelectMic={handleSelectMic}
                onToggleAudio={() => setPreJoinAudio(!preJoinAudio)}
                onRescanDevices={rescanLobbyDevices}
              />

              {/* Compact Camera Toggle Bar */}
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-zinc-950/90 border border-white/10">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-200">
                    Video Camera (Optional)
                  </p>
                  <p className="text-[10px] text-zinc-400 truncate">
                    {preJoinVideo
                      ? 'Camera preview enabled'
                      : 'Audio-Only recommended on phones to save battery'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreJoinVideo(!preJoinVideo)}
                  className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition active:scale-95 ${
                    preJoinVideo
                      ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                      : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {preJoinVideo ? (
                    <Video className="w-3.5 h-3.5" />
                  ) : (
                    <VideoOff className="w-3.5 h-3.5" />
                  )}
                  <span>{preJoinVideo ? 'Camera ON' : 'Audio-Only'}</span>
                </button>
              </div>

              {/* Optional Video Preview only if user turned Camera ON */}
              {preJoinVideo && (
                <div className="relative aspect-video max-h-48 w-full rounded-2xl bg-zinc-950 border border-white/10 overflow-hidden">
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                </div>
              )}

              {/* Primary Mobile Actions */}
              <div className="space-y-2.5 pt-1">
                {isHost ? (
                  <>
                    <button
                      type="button"
                      onClick={handleStartMasterRecordFromLobby}
                      className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-rose-600 via-rose-500 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white font-extrabold text-sm shadow-xl shadow-rose-500/30 flex items-center justify-center gap-2.5 transition active:scale-[0.99]"
                    >
                      <span className="w-3 h-3 rounded-full bg-white animate-ping" />
                      <Radio className="w-4 h-4" />
                      MASTER RECORD: Start for All ({lobbyParticipants.length} Ready)
                    </button>

                    <button
                      type="submit"
                      className="w-full py-3.5 px-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2"
                    >
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                      Enter Room in Standby (Wait for Host to Record)
                    </button>
                  </>
                ) : (
                  <button
                    type="submit"
                    className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2.5 transition active:scale-[0.99]"
                  >
                    <Smartphone className="w-4 h-4" />
                    {roomData?.isRecording
                      ? 'Join Live Recording as Synced Mic'
                      : 'Enter Studio as Synced Mic (Ready)'}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* SECOND ON MOBILE: Connected Crew in the Small Room (5 cols on lg) */}
          <div className="lg:col-span-5 rounded-3xl bg-zinc-900/80 border border-white/10 p-4 sm:p-6 shadow-2xl space-y-4 order-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    Phones Ready in Room ({lobbyParticipants.length})
                  </h2>
                  <p className="text-[11px] text-zinc-400">
                    Live microphone levels of everyone in this room lobby
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {lobbyParticipants.map((lp) => {
                const isSelf = lp.id === lobbyClientId;
                const currentLevel = isSelf
                  ? (preJoinAudio ? previewLevel : 0)
                  : (lp.micReady ? (lp.audioLevel || 0) : 0);
                const isSpeaking = currentLevel > 14;
                const isHot = currentLevel > 80;
                const isWarm = currentLevel > 60;

                return (
                  <div
                    key={lp.id}
                    className={`p-3 rounded-2xl border transition-all ${
                      isSpeaking
                        ? 'bg-emerald-500/15 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                        : 'bg-zinc-950/80 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isSpeaking
                              ? 'bg-emerald-500 text-black font-extrabold animate-pulse'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          <Mic className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-white truncate">
                              {lp.name} {isSelf ? '(Your Phone)' : ''}
                            </p>
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/5 text-zinc-300 border border-white/10">
                              {lp.role === 'super_admin'
                                ? 'Super Admin'
                                : lp.role === 'sub_admin'
                                ? 'Sub Admin'
                                : lp.role || 'Member'}
                            </span>
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white/5 text-zinc-300">
                              {lp.micMode === 'headphone' ? '🎧 Headphone' : '📱 Phone Mic'}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            {lp.inStudio ? 'In Studio • Armed' : 'In Lobby • Ready'}
                          </p>
                        </div>
                      </div>

                      {/* Live Microphone Meter Fallback & Readout */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              !lp.micReady
                                ? 'bg-rose-500'
                                : isSpeaking
                                ? 'bg-emerald-400 animate-ping'
                                : 'bg-emerald-400'
                            }`}
                          />
                          <span
                            className={`font-mono text-[11px] font-bold ${
                              !lp.micReady
                                ? 'text-rose-400'
                                : isHot
                                ? 'text-rose-400'
                                : isWarm
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {lp.micReady ? `${currentLevel}%` : 'MUTED'}
                          </span>
                        </div>

                        <div className="w-20 h-2 rounded-full bg-black/70 border border-white/10 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-75 ${
                              !lp.micReady
                                ? 'bg-rose-500'
                                : isHot
                                ? 'bg-rose-500'
                                : isWarm
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                            }`}
                            style={{
                              width: `${
                                lp.micReady
                                  ? Math.max(isSpeaking ? 15 : 4, currentLevel)
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {rosterMembers
                .filter(
                  (rm) =>
                    !lobbyParticipants.some(
                      (lp) =>
                        lp.email?.toLowerCase() === rm.email.toLowerCase() ||
                        lp.name.toLowerCase() === rm.name.toLowerCase()
                    )
                )
                .map((rm) => (
                  <div
                    key={rm.id}
                    className="p-3 rounded-2xl bg-zinc-950/70 border border-white/5 flex items-center justify-between gap-2 opacity-70"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-300 truncate">
                        {rm.name}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {rm.role} â€¢ Waiting to open link
                      </p>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 shrink-0">
                      Not Joined
                    </span>
                  </div>
                ))}
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                onClick={() => router.push('/admin')}
                className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Crown className="w-3.5 h-3.5" />
                Manage Crew
              </button>
              <button
                onClick={() => router.push(`/editor?roomId=${props.roomName}`)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Sliders className="w-3.5 h-3.5" />
                Audio Editor
              </button>
            </div>
          </div>
        </div>

        <div />
      </div>
    );
  }

  // ============================================================================
  // RENDER 2: MOBILE-FIRST LIVE PODCAST RECORDING STUDIO
  // ============================================================================
  const totalParticipants = 1 + remoteParticipants.length;
  const isStudioRecording = !!(roomData?.isRecording || isLocalRecording);
  const isUsingHeadphoneMic =
    micMode === 'headphone' ||
    classifyMicLabel(effectiveActiveMicLabel, selectedAudioDevice).category ===
      'headphone';

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#090a0f] text-zinc-100 flex flex-col">
      {/* Studio Top Bar (Compact Mobile-First) */}
      <header className="px-3 sm:px-6 py-2.5 border-b border-white/10 bg-zinc-950/95 backdrop-blur-md flex items-center justify-between gap-2 shrink-0 pt-safe">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isStudioRecording
                ? 'bg-rose-500 animate-pulse'
                : 'bg-gradient-to-br from-rose-500 to-orange-500'
            }`}
          >
            <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-white truncate">
              {roomData?.title || `Room ${props.roomName}`}
            </h1>
            <p className="text-[10px] text-zinc-400 truncate">
              {totalParticipants} Mic{totalParticipants > 1 ? 's' : ''} â€¢{' '}
              {smallRoomMode ? 'Small Room (No Feedback)' : 'Remote Call'}
            </p>
          </div>
        </div>

        {/* Center: Live Recording Timer + 1-Tap Marker */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isStudioRecording ? (
            <>
              <div className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span>{formatDuration(recordingSeconds)}</span>
              </div>
              <button
                onClick={handleAddChapterMarker}
                title="Drop edit marker"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-[11px] font-bold text-amber-300 transition"
              >
                <Bookmark className="w-3 h-3" />
                <span className="hidden xs:inline">Marker</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Standby</span>
            </div>
          )}
        </div>

        {/* Right: Mode Toggle + Lobby + Share */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              setJoined(false);
              toast('Switched to Studio Lobby', { icon: '🎙️' });
            }}
            title="Return to Studio Lobby"
            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white transition flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Lobby</span>
          </button>

          <button
            onClick={() => handleToggleSmallRoomMode(!smallRoomMode)}
            title="Toggle Small-Room Zero-Feedback Mode"
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition ${
              smallRoomMode
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-violet-500/15 border-violet-500/40 text-violet-300'
            }`}
          >
            {smallRoomMode ? (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">No Feedback</span>
              </>
            ) : (
              <>
                <Headphones className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Monitoring ON</span>
              </>
            )}
          </button>

          <button
            onClick={handleCopyInvite}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition flex items-center gap-1.5"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span className="hidden md:inline">
              {copiedLink ? 'Copied' : 'Invite'}
            </span>
          </button>
        </div>
      </header>

      {/* Mobile View Switcher Bar (Visible on < lg so mobile screens aren't squished by a sidebar!) */}
      <div className="lg:hidden grid grid-cols-4 gap-1 p-1.5 bg-zinc-900/90 border-b border-white/10 shrink-0">
        <button
          onClick={() => setMobileViewTab('stage')}
          className={`py-2 px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition ${
            mobileViewTab === 'stage'
              ? 'bg-rose-500 text-white shadow'
              : 'text-zinc-400'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Mics ({totalParticipants})</span>
        </button>
        <button
          onClick={() => setMobileViewTab('tracks')}
          className={`py-2 px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition ${
            mobileViewTab === 'tracks'
              ? 'bg-rose-500 text-white shadow'
              : 'text-zinc-400'
          }`}
        >
          <Disc className="w-3.5 h-3.5" />
          <span>Tracks ({tracks.length})</span>
        </button>
        <button
          onClick={() => setMobileViewTab('chat')}
          className={`py-2 px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition ${
            mobileViewTab === 'chat'
              ? 'bg-rose-500 text-white shadow'
              : 'text-zinc-400'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Notes</span>
        </button>
        <button
          onClick={() => setMobileViewTab('soundboard')}
          className={`py-2 px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition ${
            mobileViewTab === 'soundboard'
              ? 'bg-rose-500 text-white shadow'
              : 'text-zinc-400'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>FX</span>
        </button>
      </div>

      {/* Main Studio Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left/Center Stage (Shown on Desktop always, and on Mobile when mobileViewTab === 'stage') */}
        <div
          className={`flex-1 flex-col justify-between overflow-y-auto p-3 sm:p-5 ${
            mobileViewTab === 'stage' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="space-y-3.5 max-w-6xl w-full mx-auto my-auto">
            {/* Dedicated Field Recorder & Mic Selector Card for THIS Phone */}
            <div
              className={`rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border transition shadow-2xl ${
                isStudioRecording
                  ? 'bg-gradient-to-br from-rose-950/50 via-zinc-900 to-zinc-950 border-rose-500/40'
                  : 'bg-zinc-900/90 border-emerald-500/30'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={toggleAudio}
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 transition active:scale-95 ${
                      audioEnabled
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    {audioEnabled ? (
                      <Mic className="w-5 h-5" />
                    ) : (
                      <MicOff className="w-5 h-5" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h2 className="text-sm sm:text-base font-extrabold text-white truncate">
                        {effectiveDisplayName}
                      </h2>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {smallRoomMode ? 'Speakers Muted' : 'Remote Call'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate">
                      Active Mic:{' '}
                      <span className="text-zinc-200 font-semibold">
                        {effectiveActiveMicLabel ||
                          (isUsingHeadphoneMic
                            ? 'Headphone Mic'
                            : "Phone's Built-in Mic")}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-black/50 border border-white/10 text-emerald-400">
                    Input: {audioEnabled ? `${audioLevel}%` : 'MUTED'}
                  </span>
                </div>
              </div>

              {/* 1-Tap Quick Mic Source Switcher right on the Studio Recorder Card */}
              <div className="mb-3 p-2 rounded-2xl bg-black/50 border border-white/10 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-zinc-300 pl-1">
                  Mic Source:
                </span>
                <div className="flex items-center gap-1.5 flex-1 sm:flex-initial justify-end">
                  <button
                    type="button"
                    onClick={() => handleQuickStudioMicMode('phone')}
                    className={`flex-1 sm:flex-initial py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition active:scale-95 ${
                      !isUsingHeadphoneMic
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow'
                        : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5 shrink-0" />
                    <span>Phone&apos;s Mic</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickStudioMicMode('headphone')}
                    className={`flex-1 sm:flex-initial py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition active:scale-95 ${
                      isUsingHeadphoneMic
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow'
                        : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Headphones className="w-3.5 h-3.5 shrink-0" />
                    <span>Headphone Mic</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStudioMicSheet(true)}
                    title="View all detected microphones"
                    className="py-2 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 flex items-center gap-1 shrink-0 active:scale-95 transition"
                  >
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden xs:inline">All Mics</span>
                  </button>
                </div>
              </div>

              {/* Large 24-Bar Studio Waveform Meter for easy viewing on a table in a small room */}
              <div className="h-14 sm:h-16 rounded-2xl bg-black/60 border border-white/10 px-4 py-2.5 flex items-end justify-between gap-1">
                {waveformBars.map((val, i) => {
                  const barHeight = audioEnabled ? Math.max(12, val) : 8;
                  const isHot = val > 80;
                  const isMid = val > 45;
                  return (
                    <span
                      key={i}
                      style={{ height: `${barHeight}%` }}
                      className={`flex-1 rounded-full transition-all duration-75 ${
                        !audioEnabled
                          ? 'bg-zinc-700'
                          : isHot
                          ? 'bg-rose-500'
                          : isMid
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Show Notes Teleprompter Strip right inside the Recorder Card if present */}
              {roomData?.description && (
                <div className="mt-3 pt-2.5 border-t border-white/10 flex items-start justify-between gap-2 text-xs text-zinc-300">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 mr-2">
                      Show Notes:
                    </span>
                    <span>{roomData.description}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Live Studio Individual Microphone Levels HUD Panel */}
            <div className="rounded-2xl bg-zinc-950/90 border border-white/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">
                    Live Microphone Levels ({totalParticipants} Active)
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {smallRoomMode ? 'Speakers Muted • Calibrated' : 'Remote 48kHz Audio'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {/* Local user meter */}
                <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                  audioLevel > 14 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-900 border-white/5'
                }`}>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {effectiveDisplayName} (You)
                    </p>
                    <p className="text-[10px] text-zinc-400 truncate">
                      {isUsingHeadphoneMic ? '🎧 Headphone Mic' : "📱 Phone's Mic"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-16 h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-75 ${
                          !audioEnabled ? 'bg-rose-500' : audioLevel > 80 ? 'bg-rose-500' : audioLevel > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${audioEnabled ? Math.max(audioLevel > 14 ? 12 : 4, audioLevel) : 0}%` }}
                      />
                    </div>
                    <span className={`font-mono text-[11px] font-bold w-9 text-right ${
                      !audioEnabled ? 'text-rose-400' : audioLevel > 80 ? 'text-rose-400' : audioLevel > 60 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {audioEnabled ? `${audioLevel}%` : 'MUTE'}
                    </span>
                  </div>
                </div>

                {/* Remote participants meters */}
                {remoteParticipants.map((part: StudioParticipant) => {
                  const pLevel = part.audioEnabled ? (part.audioLevel || 0) : 0;
                  const isPartSpeaking = pLevel > 14;
                  return (
                    <div
                      key={part.peerId}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                        isPartSpeaking ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-900 border-white/5'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {part.displayName}
                        </p>
                        <p className="text-[10px] text-zinc-400 truncate">
                          {part.role === 'host' ? 'Host' : 'Co-Host'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 h-2 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-75 ${
                              !part.audioEnabled ? 'bg-rose-500' : pLevel > 80 ? 'bg-rose-500' : pLevel > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${part.audioEnabled ? Math.max(isPartSpeaking ? 12 : 4, pLevel) : 0}%` }}
                          />
                        </div>
                        <span className={`font-mono text-[11px] font-bold w-9 text-right ${
                          !part.audioEnabled ? 'text-rose-400' : pLevel > 80 ? 'text-rose-400' : pLevel > 60 ? 'text-amber-400' : 'text-zinc-200'
                        }`}>
                          {part.audioEnabled ? `${pLevel}%` : 'MUTE'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Room Participants Grid */}
            <div
              className={`grid gap-3 sm:gap-4 w-full ${
                totalParticipants === 1
                  ? 'grid-cols-1 max-w-2xl mx-auto'
                  : totalParticipants === 2
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {/* Local User Video Tile (Hidden on mobile when camera/screenshare is off since Pocket Field Recorder card is above) */}
              <div
                className={
                  videoEnabled || isScreenSharing
                    ? 'block'
                    : 'hidden lg:block'
                }
              >
                <VideoStreamTile
                  stream={isScreenSharing ? screenStream : localStream}
                  muted={true}
                  videoEnabled={videoEnabled}
                  displayName={effectiveDisplayName}
                  photoURL={user?.photoURL}
                  role={isHost ? 'host' : 'guest'}
                  audioEnabled={audioEnabled}
                  isRecording={isStudioRecording}
                  isScreenSharing={isScreenSharing}
                  waveformBars={waveformBars}
                  remoteAudioLevel={audioLevel}
                  isLocal={true}
                  smallRoomMode={smallRoomMode}
                  micMode={isUsingHeadphoneMic ? 'headphone' : 'phone'}
                />
              </div>

              {/* Other Members in the Room */}
              {remoteParticipants.map((part: StudioParticipant) => (
                <VideoStreamTile
                  key={part.peerId}
                  stream={part.stream}
                  muted={smallRoomMode || speakerMuted}
                  videoEnabled={part.videoEnabled}
                  displayName={part.displayName}
                  photoURL={part.photoURL}
                  role={part.role}
                  audioEnabled={part.audioEnabled}
                  isRecording={part.isLocalRecording || isStudioRecording}
                  isScreenSharing={part.isScreenSharing}
                  remoteAudioLevel={part.audioLevel}
                  smallRoomMode={smallRoomMode || speakerMuted}
                />
              ))}
            </div>

            {remoteParticipants.length === 0 && (
              <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-200">
                    Waiting for co-hosts to join on their phones
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    Room Code: <span className="font-mono text-white">{props.roomName}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 shrink-0 active:scale-95 transition"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-rose-400" />
                      <span>Share Link</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Non-Stage Tab Views (< lg) */}
        {mobileViewTab === 'tracks' && (
          <div className="flex-1 flex flex-col overflow-hidden lg:hidden">
            {renderTracksPanel()}
          </div>
        )}
        {mobileViewTab === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden lg:hidden">
            {renderChatPanel(isStudioRecording)}
          </div>
        )}
        {mobileViewTab === 'soundboard' && (
          <div className="flex-1 flex flex-col overflow-hidden lg:hidden">
            {renderSoundboardPanel()}
          </div>
        )}

        {/* Desktop Right Studio Sidebar (lg+) */}
        <aside className="hidden lg:flex w-96 border-l border-white/10 bg-zinc-950/95 flex-col shrink-0">
          <div className="grid grid-cols-3 p-2 gap-1 border-b border-white/10 bg-zinc-900/50">
            <button
              onClick={() => setActiveSidebarTab('tracks')}
              className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                activeSidebarTab === 'tracks'
                  ? 'bg-rose-500 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Disc className="w-3.5 h-3.5" />
              Tracks ({tracks.length})
            </button>
            <button
              onClick={() => setActiveSidebarTab('chat')}
              className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                activeSidebarTab === 'chat'
                  ? 'bg-rose-500 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Notes &amp; Chat
            </button>
            <button
              onClick={() => setActiveSidebarTab('soundboard')}
              className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                activeSidebarTab === 'soundboard'
                  ? 'bg-rose-500 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              Sound FX
            </button>
          </div>

          {activeSidebarTab === 'tracks' && renderTracksPanel()}
          {activeSidebarTab === 'chat' && renderChatPanel(isStudioRecording)}
          {activeSidebarTab === 'soundboard' && renderSoundboardPanel()}
        </aside>
      </div>

      {/* Mobile Mic Selector Bottom Sheet (Accessible anytime inside the Studio) */}
      {showStudioMicSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowStudioMicSheet(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-zinc-900 border-t sm:border border-white/15 p-4 sm:p-5 pb-safe space-y-3.5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto sm:hidden" />
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Switch Studio Microphone
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Choose between your Phone&apos;s Mic or Headphone Mic
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStudioMicSheet(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <MicSelector
              audioDevices={effectiveAudioDevices}
              selectedDeviceId={selectedAudioDevice}
              micMode={micMode}
              activeHardwareLabel={effectiveActiveMicLabel}
              audioEnabled={audioEnabled}
              audioLevel={audioLevel}
              onSelectMic={async (devId, mode) => {
                await handleSelectMic(devId, mode);
              }}
              onToggleAudio={toggleAudio}
              onRescanDevices={refreshAudioDevices}
            />

            <button
              type="button"
              onClick={() => setShowStudioMicSheet(false)}
              className="w-full py-3 rounded-2xl btn-acid text-xs sm:text-sm font-extrabold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Thumb-Friendly Mobile-First Bottom Studio Control Dock */}
      <footer className="border-t border-white/10 bg-zinc-950/95 backdrop-blur-xl px-2.5 sm:px-4 py-2.5 pb-safe shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between sm:justify-center gap-1.5 sm:gap-2.5">
          {/* Mic Mute Toggle */}
          <button
            onClick={toggleAudio}
            title={audioEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
            className={`px-3 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 ${
              audioEnabled
                ? 'bg-white/10 hover:bg-white/15 text-white'
                : 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
            }`}
          >
            {audioEnabled ? (
              <Mic className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <MicOff className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="hidden sm:inline">
              {audioEnabled ? 'Mic On' : 'Muted'}
            </span>
          </button>

          {/* Mic Source Selector Button (Phone's Mic vs Headphone Mic) */}
          <button
            type="button"
            onClick={() => setShowStudioMicSheet(true)}
            title="Switch between Phone's Mic and Headphone Mic"
            className={`px-2.5 sm:px-3.5 py-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-1 transition active:scale-95 ${
              isUsingHeadphoneMic
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
            }`}
          >
            {isUsingHeadphoneMic ? (
              <Headphones className="w-4 h-4 shrink-0" />
            ) : (
              <Smartphone className="w-4 h-4 shrink-0" />
            )}
            <span className="text-[11px] sm:text-xs">
              {isUsingHeadphoneMic ? 'Headphone' : 'Phone Mic'}
            </span>
            <ChevronDown className="w-3 h-3 opacity-80 shrink-0" />
          </button>

          {/* Giant Center Master Record / Stop Button */}
          <button
            onClick={handleToggleMasterRecording}
            className={`flex-1 sm:flex-initial px-4 sm:px-5 py-3.5 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition shadow-xl active:scale-[0.98] ${
              isStudioRecording
                ? 'bg-zinc-100 text-zinc-950 hover:bg-white shadow-white/10'
                : 'bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white shadow-rose-500/30'
            }`}
          >
            {isStudioRecording ? (
              <>
                <Square className="w-4 h-4 fill-rose-600 text-rose-600 shrink-0" />
                <span>Stop ({formatDuration(recordingSeconds)})</span>
              </>
            ) : (
              <>
                <Radio className="w-4 h-4 shrink-0" />
                <span>Record</span>
              </>
            )}
          </button>

          {/* Speaker / Monitoring Mute Toggle */}
          <button
            onClick={() => {
              if (smallRoomMode) {
                toast(
                  'Speakers stay muted in Small-Room Mode to prevent audio feedback.',
                  { icon: '🔇' }
                );
              } else {
                setSpeakerMuted(!speakerMuted);
              }
            }}
            title="Speaker Monitoring"
            className={`px-2.5 sm:px-3 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 ${
              smallRoomMode || speakerMuted
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-white/10 hover:bg-white/15 text-white'
            }`}
          >
            {smallRoomMode || speakerMuted ? (
              <VolumeX className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Volume2 className="w-4 h-4 text-violet-400 shrink-0" />
            )}
            <span className="hidden md:inline">
              {smallRoomMode || speakerMuted ? 'Monitor OFF' : 'Monitor ON'}
            </span>
          </button>

          {/* Camera Toggle */}
          <button
            onClick={toggleVideo}
            title="Toggle Camera"
            className={`hidden xs:flex px-2.5 sm:px-3.5 py-3 rounded-2xl font-semibold text-xs items-center justify-center gap-1.5 transition active:scale-95 ${
              videoEnabled
                ? 'bg-sky-500/20 border border-sky-500/40 text-sky-300'
                : 'bg-white/5 hover:bg-white/10 text-zinc-400'
            }`}
          >
            {videoEnabled ? (
              <Video className="w-4 h-4 text-sky-400 shrink-0" />
            ) : (
              <VideoOff className="w-4 h-4 shrink-0" />
            )}
            <span className="hidden md:inline">
              {videoEnabled ? 'Cam On' : 'Cam Off'}
            </span>
          </button>

          {/* Screen Share (Desktop) */}
          <button
            onClick={toggleScreenShare}
            className={`hidden md:flex px-3.5 py-3 rounded-2xl font-semibold text-xs items-center gap-1.5 transition ${
              isScreenSharing
                ? 'bg-sky-500 text-white'
                : 'bg-white/10 hover:bg-white/15 text-white'
            }`}
          >
            <MonitorUp className="w-4 h-4" />
          </button>

          {/* Lobby Button */}
          <button
            onClick={() => {
              setJoined(false);
              toast('Switched to Studio Lobby', { icon: '🎙️' });
            }}
            title="Return to Studio Lobby"
            className="px-3 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-zinc-200 text-xs font-bold transition flex items-center justify-center gap-1 active:scale-95"
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Lobby</span>
          </button>

          {/* Leave Studio */}
          <button
            onClick={() => {
              stopLocalTrackRecorder();
              router.push('/');
            }}
            title="Leave Studio"
            className="px-3 py-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-xs font-bold transition flex items-center justify-center gap-1 active:scale-95"
          >
            <PhoneOff className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

