import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { SUPER_ADMIN_EMAIL, isSuperAdminEmail } from './AuthContext';

export interface PodcastRoom {
  id: string;
  title: string;
  description: string;
  episodeNumber?: number;
  hostId: string;
  hostName: string;
  hostPhotoURL?: string | null;
  status: 'lobby' | 'live' | 'recording' | 'ended';
  recordingMode?: 'small-room' | 'remote';
  sessionLive?: boolean;
  isRecording: boolean;
  recordingStartedAt?: number | null;
  currentSessionId?: string | null;
  createdAt: number;
  updatedAt: number;
  inviteCode: string;
}

export interface PodcastMember {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'host' | 'co-host' | 'producer' | 'editor' | 'guest';
  bio?: string;
  assignedRoomId?: string | null;
  addedBy: string;
  createdAt: number;
}

export interface LobbyParticipant {
  id: string;
  uid: string;
  name: string;
  email?: string | null;
  role: 'super_admin' | 'host' | 'co-host' | 'guest';
  micReady: boolean;
  camReady: boolean;
  inStudio: boolean;
  updatedAt: number;
}

export interface StudioTrackRecord {
  id: string;
  roomId: string;
  sessionId: string;
  participantId: string;
  participantName: string;
  role: 'host' | 'guest';
  mimeType: string;
  durationSec: number;
  sizeBytes: number;
  downloadUrl?: string | null;
  localBlobUrl?: string | null;
  uploadStatus: 'recording' | 'uploading' | 'ready' | 'local-only';
  uploadProgress: number;
  createdAt: number;
  kind: 'video-audio' | 'audio-only' | 'wav';
}

/** One Master Record run = one recording session (one episode take). */
export interface RecordingSession {
  id: string;
  roomId: string;
  label: string;
  startedAt: number;
  endedAt?: number | null;
  startedBy?: string | null;
}

/** Per-track mix settings saved for one edit session. */
export interface EditTrackSettings {
  gain: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  voiceEnhance: boolean;
  trimStart: number;
  trimEnd: number;
}

/**
 * The editor state of ONE recording session. Stored at
 * rooms/{roomId}/editSessions/{sessionId} so each session has its own
 * independent edit and never overwrites another session's mix.
 */
export interface EditSessionState {
  sessionId: string;
  roomId: string;
  tracks: Record<string, EditTrackSettings>;
  updatedAt: number;
  updatedBy?: string | null;
}

export interface StudioMarker {
  id: string;
  roomId: string;
  label: string;
  timestampSec: number;
  createdBy: string;
  createdAt: number;
}

export interface StudioChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  isNote?: boolean;
  recordingTimestampSec?: number | null;
  createdAt: number;
}

// ============================================================================
// PODCAST MEMBERS (ADMIN ROSTER)
// ============================================================================

export async function addPodcastMember(params: {
  name: string;
  email: string;
  role: PodcastMember['role'];
  bio?: string;
  assignedRoomId?: string | null;
  addedBy?: string;
}): Promise<PodcastMember> {
  const cleanEmail = params.email.trim().toLowerCase();
  const id = cleanEmail.replace(/[^a-z0-9]/g, '_') || `mem_${Date.now()}`;
  const isSuper = isSuperAdminEmail(cleanEmail);

  const member: PodcastMember = {
    id,
    name: params.name.trim() || 'Podcast Member',
    email: cleanEmail,
    role: isSuper ? 'super_admin' : params.role,
    bio: params.bio?.trim() || 'Podcast Crew Member',
    assignedRoomId: params.assignedRoomId || null,
    addedBy: params.addedBy || SUPER_ADMIN_EMAIL,
    createdAt: Date.now(),
  };

  await setDoc(doc(db, 'members', id), member, { merge: true });
  return member;
}

export async function removePodcastMember(memberId: string) {
  await deleteDoc(doc(db, 'members', memberId));
}

export function subscribeToPodcastMembers(
  callback: (members: PodcastMember[]) => void
) {
  const q = query(collection(db, 'members'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, async (snap) => {
    const list: PodcastMember[] = [];
    snap.forEach((d) => list.push(d.data() as PodcastMember));

    // Ensure Super Admin email is seeded in the roster
    const hasSuperAdmin = list.some((m) => isSuperAdminEmail(m.email));
    if (!hasSuperAdmin) {
      try {
        const seeded = await addPodcastMember({
          name: 'Abhishek Chatterjee',
          email: SUPER_ADMIN_EMAIL,
          role: 'super_admin',
          bio: 'Founder & Executive Producer (Super Admin)',
          addedBy: 'system',
        });
        list.unshift(seeded);
      } catch (e) {
        // Ignore permission/offline errors
      }
    }

    callback(list);
  });
}

// ============================================================================
// LOBBY PRESENCE & MASTER RECORDING TRIGGER
// ============================================================================

export async function updateLobbyPresence(
  roomId: string,
  participant: LobbyParticipant
) {
  await setDoc(
    doc(db, 'rooms', roomId, 'lobby', participant.id),
    {
      ...participant,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function removeLobbyPresence(roomId: string, participantId: string) {
  await deleteDoc(doc(db, 'rooms', roomId, 'lobby', participantId)).catch(
    () => {}
  );
}

export function subscribeToRoomLobby(
  roomId: string,
  callback: (lobbyList: LobbyParticipant[]) => void
) {
  return onSnapshot(collection(db, 'rooms', roomId, 'lobby'), (snap) => {
    const list: LobbyParticipant[] = [];
    const now = Date.now();
    snap.forEach((d) => {
      const data = d.data() as LobbyParticipant;
      // Filter out stale entries older than 2 hours
      if (now - (data.updatedAt || 0) < 2 * 3600 * 1000) {
        list.push(data);
      }
    });
    callback(list);
  });
}

/**
 * Master Lobby Start & Record Trigger:
 * Pulls all waiting members from the Green Room Lobby into the Live Studio
 * AND starts synchronized multi-track recording across all browsers simultaneously.
 */
export async function triggerMasterLobbyRecordingSession(
  roomId: string,
  sessionId?: string
) {
  const now = Date.now();
  const activeSessionId = sessionId || `master_ep_${now}`;
  await registerRecordingSession(roomId, activeSessionId, now);
  await setDoc(
    doc(db, 'rooms', roomId),
    {
      status: 'recording',
      sessionLive: true,
      isRecording: true,
      recordingStartedAt: now,
      currentSessionId: activeSessionId,
      updatedAt: now,
    },
    { merge: true }
  );
}

// ============================================================================
// ROOMS & TRACKS
// ============================================================================

export async function createPodcastRoom(params: {
  roomId: string;
  title: string;
  description?: string;
  episodeNumber?: number;
  hostId: string;
  hostName: string;
  hostPhotoURL?: string | null;
  recordingMode?: 'small-room' | 'remote';
}): Promise<PodcastRoom> {
  const now = Date.now();
  const room: PodcastRoom = {
    id: params.roomId,
    title: params.title.trim() || 'Untitled Podcast Episode',
    description: params.description?.trim() || 'Recorded in Podmeet Studio',
    episodeNumber: params.episodeNumber || 1,
    hostId: params.hostId,
    hostName: params.hostName || 'Podcast Host',
    hostPhotoURL: params.hostPhotoURL || null,
    status: 'lobby',
    recordingMode: params.recordingMode || 'small-room',
    sessionLive: false,
    isRecording: false,
    recordingStartedAt: null,
    currentSessionId: null,
    createdAt: now,
    updatedAt: now,
    inviteCode: params.roomId,
  };

  await setDoc(doc(db, 'rooms', params.roomId), room, { merge: true });
  return room;
}

export async function setRoomRecordingMode(
  roomId: string,
  recordingMode: 'small-room' | 'remote'
) {
  await setDoc(
    doc(db, 'rooms', roomId),
    {
      recordingMode,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function ensurePodcastRoomExists(
  roomId: string,
  userId: string,
  userName: string,
  photoURL?: string | null
): Promise<PodcastRoom> {
  const ref = doc(db, 'rooms', roomId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data() as PodcastRoom;
  }
  return createPodcastRoom({
    roomId,
    title: `Podcast Session #${roomId.slice(0, 4).toUpperCase()}`,
    description: 'Multi-track remote podcast recording session',
    hostId: userId,
    hostName: userName,
    hostPhotoURL: photoURL,
  });
}

export function subscribeToRoom(
  roomId: string,
  callback: (room: PodcastRoom | null) => void
) {
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    if (snap.exists()) {
      callback(snap.data() as PodcastRoom);
    } else {
      callback(null);
    }
  });
}

export function subscribeToAllRooms(
  callback: (rooms: PodcastRoom[]) => void
) {
  return onSnapshot(collection(db, 'rooms'), (snap) => {
    const rooms: PodcastRoom[] = [];
    snap.forEach((docSnap) => {
      rooms.push(docSnap.data() as PodcastRoom);
    });
    rooms.sort((a, b) => b.createdAt - a.createdAt);
    callback(rooms);
  });
}

export function subscribeToUserRooms(
  userId: string,
  callback: (rooms: PodcastRoom[]) => void,
  includeAllForAdmin?: boolean
) {
  if (includeAllForAdmin) {
    return subscribeToAllRooms(callback);
  }
  const q = query(collection(db, 'rooms'), where('hostId', '==', userId));
  return onSnapshot(q, (snap) => {
    const rooms: PodcastRoom[] = [];
    snap.forEach((docSnap) => {
      rooms.push(docSnap.data() as PodcastRoom);
    });
    rooms.sort((a, b) => b.createdAt - a.createdAt);
    callback(rooms);
  });
}

export async function setRoomRecordingState(
  roomId: string,
  isRecording: boolean,
  sessionId?: string
) {
  const now = Date.now();
  const activeSessionId = isRecording ? sessionId || `sess_${now}` : null;

  if (isRecording && activeSessionId) {
    await registerRecordingSession(roomId, activeSessionId, now);
  } else {
    // Stopping: close out whichever session was running.
    const snap = await getDoc(doc(db, 'rooms', roomId));
    const running = (snap.data() as PodcastRoom | undefined)?.currentSessionId;
    if (running) {
      await updateDoc(doc(db, 'rooms', roomId, 'sessions', running), {
        endedAt: now,
      }).catch(() => {});
    }
  }

  await updateDoc(doc(db, 'rooms', roomId), {
    isRecording,
    sessionLive: true,
    status: isRecording ? 'recording' : 'live',
    recordingStartedAt: isRecording ? now : null,
    currentSessionId: activeSessionId,
    updatedAt: now,
  });
}

// ============================================================================
// RECORDING SESSIONS & PER-SESSION EDIT STATE
// ============================================================================

/** Creates the session doc once (idempotent), numbering sessions in order. */
export async function registerRecordingSession(
  roomId: string,
  sessionId: string,
  startedAt: number = Date.now(),
  startedBy?: string | null
) {
  const ref = doc(db, 'rooms', roomId, 'sessions', sessionId);
  const existing = await getDoc(ref);
  if (existing.exists()) return;

  const all = await getDocs(collection(db, 'rooms', roomId, 'sessions'));
  const session: RecordingSession = {
    id: sessionId,
    roomId,
    label: `Session ${all.size + 1}`,
    startedAt,
    endedAt: null,
    startedBy: startedBy ?? null,
  };
  await setDoc(ref, session);
}

export function subscribeToRoomSessions(
  roomId: string,
  callback: (sessions: RecordingSession[]) => void
) {
  return onSnapshot(collection(db, 'rooms', roomId, 'sessions'), (snap) => {
    const list: RecordingSession[] = [];
    snap.forEach((d) => list.push(d.data() as RecordingSession));
    list.sort((a, b) => b.startedAt - a.startedAt);
    callback(list);
  });
}

/** Tracks belonging to exactly one recording session. */
export function subscribeToSessionTracks(
  roomId: string,
  sessionId: string,
  callback: (tracks: StudioTrackRecord[]) => void
) {
  const q = query(
    collection(db, 'rooms', roomId, 'tracks'),
    where('sessionId', '==', sessionId)
  );
  return onSnapshot(q, (snap) => {
    const list: StudioTrackRecord[] = [];
    snap.forEach((d) => list.push(d.data() as StudioTrackRecord));
    list.sort((a, b) => a.createdAt - b.createdAt);
    callback(list);
  });
}

export async function getEditSession(
  roomId: string,
  sessionId: string
): Promise<EditSessionState | null> {
  const snap = await getDoc(doc(db, 'rooms', roomId, 'editSessions', sessionId));
  return snap.exists() ? (snap.data() as EditSessionState) : null;
}

export async function saveEditSession(
  roomId: string,
  sessionId: string,
  tracks: Record<string, EditTrackSettings>,
  updatedBy?: string | null
) {
  const state: EditSessionState = {
    sessionId,
    roomId,
    tracks,
    updatedAt: Date.now(),
    updatedBy: updatedBy ?? null,
  };
  await setDoc(doc(db, 'rooms', roomId, 'editSessions', sessionId), state);
}

export async function saveStudioTrackMetadata(
  roomId: string,
  track: StudioTrackRecord
) {
  await setDoc(doc(db, 'rooms', roomId, 'tracks', track.id), track, {
    merge: true,
  });
}

export function subscribeToRoomTracks(
  roomId: string,
  callback: (tracks: StudioTrackRecord[]) => void
) {
  const q = query(
    collection(db, 'rooms', roomId, 'tracks'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const list: StudioTrackRecord[] = [];
    snap.forEach((d) => list.push(d.data() as StudioTrackRecord));
    callback(list);
  });
}

export async function sendStudioMessage(params: {
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  isNote?: boolean;
  recordingTimestampSec?: number | null;
}) {
  const msgRef = collection(db, 'rooms', params.roomId, 'messages');
  await addDoc(msgRef, {
    roomId: params.roomId,
    senderId: params.senderId,
    senderName: params.senderName,
    text: params.text,
    isNote: !!params.isNote,
    recordingTimestampSec: params.recordingTimestampSec ?? null,
    createdAt: Date.now(),
  });
}

export function subscribeToRoomMessages(
  roomId: string,
  callback: (messages: StudioChatMessage[]) => void
) {
  const q = query(
    collection(db, 'rooms', roomId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const list: StudioChatMessage[] = [];
    snap.forEach((d) =>
      list.push({ id: d.id, ...(d.data() as Omit<StudioChatMessage, 'id'>) })
    );
    callback(list);
  });
}

export async function addStudioMarker(params: {
  roomId: string;
  label: string;
  timestampSec: number;
  createdBy: string;
}) {
  await addDoc(collection(db, 'rooms', params.roomId, 'markers'), {
    ...params,
    createdAt: Date.now(),
  });
}

export function subscribeToRoomMarkers(
  roomId: string,
  callback: (markers: StudioMarker[]) => void
) {
  const q = query(
    collection(db, 'rooms', roomId, 'markers'),
    orderBy('timestampSec', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const list: StudioMarker[] = [];
    snap.forEach((d) =>
      list.push({ id: d.id, ...(d.data() as Omit<StudioMarker, 'id'>) })
    );
    callback(list);
  });
}

export async function deletePodcastRoom(roomId: string) {
  await deleteDoc(doc(db, 'rooms', roomId));
}
