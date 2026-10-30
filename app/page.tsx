'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import AvatarUploader from '@/lib/AvatarUploader';
import {
  Mic,
  Radio,
  Users,
  Copy,
  ArrowRight,
  LogOut,
  Plus,
  Headphones,
  Check,
  Trash2,
  Crown,
  Sliders,
  VolumeX,
  Smartphone,
  ShieldAlert,
} from 'lucide-react';
import { useAuth, SUPER_ADMIN_EMAIL } from '@/lib/AuthContext';
import {
  createPodcastRoom,
  subscribeToUserRooms,
  subscribeToPodcastMembers,
  deletePodcastRoom,
  PodcastRoom,
  PodcastMember,
} from '@/lib/podcast-service';
import { generateRoomId } from '@/lib/client-utils';
import toast from 'react-hot-toast';

export default function HomePage() {
  const router = useRouter();
  const {
    user,
    loading,
    isSuperAdmin,
    logout,
  } = useAuth();

  // New Episode Form State
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [episodeDesc, setEpisodeDesc] = useState('');
  const [episodeNum, setEpisodeNum] = useState<number>(1);
  const [recordingMode, setRecordingMode] = useState<'small-room' | 'remote'>(
    'small-room'
  );
  const [isCreating, setIsCreating] = useState(false);

  // Join Friend's Room State
  const [joinInput, setJoinInput] = useState('');

  // User's past/active studios & members from Firestore
  const [myRooms, setMyRooms] = useState<PodcastRoom[]>([]);
  const [members, setMembers] = useState<PodcastMember[]>([]);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);

  useEffect(() => {
    const unsubMembers = subscribeToPodcastMembers((m) => setMembers(m));
    return () => unsubMembers();
  }, []);

  useEffect(() => {
    if (!user && !isSuperAdmin) {
      setMyRooms([]);
      return;
    }
    const unsub = subscribeToUserRooms(
      user?.uid || 'admin',
      (rooms) => {
        setMyRooms(rooms);
        if (rooms.length > 0) {
          setEpisodeNum(rooms.length + 1);
        }
      },
      isSuperAdmin
    );
    return () => unsub();
  }, [user, isSuperAdmin]);

  const handleCreateStudio = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      let activeUser = user;
      const roomId = generateRoomId();
      await createPodcastRoom({
        roomId,
        title: episodeTitle.trim() || `Episode #${episodeNum}: Small Room Pod`,
        description:
          episodeDesc.trim() ||
          (recordingMode === 'small-room'
            ? 'In-person small room session â€” local isolated mics, zero speaker feedback.'
            : 'Remote multi-track podcast session with friends.'),
        episodeNumber: episodeNum,
        hostId: activeUser?.uid || 'anon-host',
        hostName: activeUser?.displayName || 'Abhishek (Host)',
        hostPhotoURL: activeUser?.photoURL || null,
        recordingMode,
      });
      toast.success(
        recordingMode === 'small-room'
          ? 'Small-Room Studio ready! Monitoring muted to prevent feedback.'
          : 'Podcast studio lobby ready!'
      );
      router.push(`/rooms/${roomId}?mode=${recordingMode}`);
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to create studio room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinInput.trim();
    if (!raw) {
      toast.error('Enter a room code or invite link');
      return;
    }
    let roomCode = raw;
    if (raw.includes('/rooms/')) {
      const parts = raw.split('/rooms/');
      roomCode = parts[1].split(/[?#]/)[0];
    }
    router.push(`/rooms/${roomCode.trim()}`);
  };

  const copyInviteLink = (roomId: string) => {
    const url = `${window.location.origin}/rooms/${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedRoomId(roomId);
    toast.success('Room link copied! Everyone in the room can open it on their phone.');
    setTimeout(() => setCopiedRoomId(null), 2500);
  };

  return (
    <div className="min-h-[100dvh] bg-[#070707] text-zinc-100 flex flex-col relative overflow-x-hidden pb-20 md:pb-8">
      {/* Ambient Studio Glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-32 left-1/4 w-[360px] sm:w-[520px] h-[360px] sm:h-[520px] bg-chili-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -right-24 w-[320px] sm:w-[460px] h-[320px] sm:h-[460px] bg-acid-400/15 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-grain opacity-40" />
      </div>

      {/* Mobile-First Sticky Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070707]/90 backdrop-blur-xl pt-safe">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/images/acidreflux-logo.jpg"
              alt="AcidReflux Podcast logo"
              width={40}
              height={40}
              className="w-10 h-10 rounded-2xl object-cover object-[50%_35%] ring-2 ring-acid-400/60 shadow-acid shrink-0"
              priority
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-xl sm:text-2xl leading-none tracking-wide truncate">
                  <span className="text-acid-400">ACID</span>
                  <span className="text-sun-400">REFLUX</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-chili-500/15 text-chili-400 border border-chili-500/40 shrink-0">
                  Podcast
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block truncate">
                Spicy Indian takes â€¢ Burning hot-takes
              </p>
            </div>
          </div>

          {/* Desktop Center Nav Links */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => router.push('/admin')}
              className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Crew &amp; Admin ({members.length})</span>
            </button>

            <button
              onClick={() => router.push('/editor')}
              className="px-3.5 py-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Web Audio Editor</span>
            </button>
          </div>

          {/* Compact Auth Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {loading ? (
              <div className="h-9 w-20 rounded-xl bg-white/5 animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10">
                  <AvatarUploader size={28} />
                  <div className="text-left hidden sm:block">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-semibold text-white leading-none">
                        {user.displayName || 'Abhishek'}
                      </p>
                      {isSuperAdmin && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ADMIN
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl sm:rounded-[2rem] border border-acid-400/25 bg-gradient-to-br from-ink-700 via-ink to-ink-800 p-5 sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-chili-500/25 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-acid-400/20 blur-[100px]" />
          <div className="relative grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-7 space-y-5 text-center md:text-left order-2 md:order-1">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full bg-sun-400/10 text-sun-300 border border-sun-400/30">
                <span className="w-2 h-2 rounded-full bg-chili-500 animate-ping" />
                Live from the studio
              </span>
              <h1 className="text-5xl sm:text-7xl lg:text-8xl leading-[0.95] uppercase">
                <span className="text-acid-400">Acid</span>
                <span className="text-sun-400">Reflux</span>
                <span className="block text-2xl sm:text-4xl lg:text-5xl mt-3 text-acid-gradient">
                  Spicy Indian takes. Burning hot-takes.
                </span>
              </h1>
              <p className="text-sm sm:text-base text-zinc-300 max-w-xl mx-auto md:mx-0 leading-relaxed">
                Record every voice on its own crystal-clear track â€” in the same
                room or across the globe â€” then mix, polish and export your
                episode. All from your phone or laptop.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center md:justify-start gap-3">
                <a
                  href="#studio"
                  className="px-6 py-3.5 rounded-2xl btn-chili text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition"
                >
                  <Radio className="w-4 h-4" />
                  Start Recording
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  onClick={() => router.push('/editor')}
                  className="px-6 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-acid-400/40 text-acid-300 text-sm font-bold flex items-center justify-center gap-2 transition"
                >
                  <Sliders className="w-4 h-4" />
                  Open Audio Editor
                </button>
              </div>

              {/* Avatar upload card */}
              <div className="inline-flex items-center gap-4 rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-left">
                <AvatarUploader size={56} showLabel />
                <div>
                  <p className="text-sm font-bold text-white">
                    {user?.displayName || 'Your avatar'}
                  </p>
                  <p className="text-[11px] text-zinc-400 max-w-[210px] leading-snug">
                    {user
                      ? 'Tap your photo to upload a new avatar. It shows up in every studio you join.'
                      : 'Sign in, then tap the circle to upload your avatar.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="md:col-span-5 flex justify-center order-1 md:order-2">
              <div className="relative animate-floaty">
                <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-tr from-chili-500/40 to-acid-400/40 blur-2xl" />
                <Image
                  src="/images/acidreflux-logo.jpg"
                  alt="AcidReflux Podcast â€” spicy Indian takes, burning hot-takes"
                  width={576}
                  height={1024}
                  priority
                  className="relative w-56 sm:w-72 lg:w-80 h-auto rounded-[2rem] ring-2 ring-acid-400/50 shadow-acid"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Small-Room Scenario Callout Banner (Mobile-First Compact Card) */}
        <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-rose-500/10 border border-emerald-500/30 p-3.5 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0 mt-0.5 sm:mt-0">
              <VolumeX className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Small-Room In-Person Mode (Zero Audio Feedback)
                </h2>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  No Monitoring â€¢ Record Only
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">
                All members sitting in the same room? Every phone records its own
                isolated 48kHz mic track with <strong>speakers 100% muted</strong>{' '}
                and <strong>anti-bleed mic gain</strong> â€” zero echo or howling feedback.
              </p>
            </div>
          </div>
        </div>

        {/* Fast Join Bar on Mobile (Right at the top so guests in the room can join in 2 seconds) */}
        <form
          onSubmit={handleJoinRoom}
          className="rounded-2xl bg-zinc-900/90 border border-white/10 p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shadow-xl"
        >
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="In the room? Enter room code or paste link..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition"
            />
          </div>
          <button
            type="submit"
            className="py-3 px-5 rounded-xl btn-acid active:scale-[0.99] text-xs sm:text-sm transition flex items-center justify-center gap-2 shrink-0"
          >
            <Mic className="w-4 h-4" />
            Join Room as Mic
          </button>
        </form>

        {/* Action Grid: Launch Studio vs Active Studios */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Create New Podcast Studio */}
          <div id="studio" className="lg:col-span-7 scroll-mt-24 rounded-3xl bg-zinc-900/80 border border-white/10 p-4 sm:p-7 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base sm:text-xl font-bold text-white">
                    Start Recording Session
                  </h1>
                  <p className="text-[11px] sm:text-xs text-zinc-400">
                    Use phones in a small room as synced mics, or record remotely
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-white/5 text-zinc-300 border border-white/10 shrink-0">
                EP #{episodeNum}
              </span>
            </div>

            <form onSubmit={handleCreateStudio} className="space-y-4">
              {/* Scenario Mode Selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Recording Scenario
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRecordingMode('small-room')}
                    className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                      recordingMode === 'small-room'
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-lg shadow-emerald-500/10'
                        : 'bg-zinc-950/70 border-white/10 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <VolumeX
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        recordingMode === 'small-room'
                          ? 'text-emerald-400'
                          : 'text-zinc-500'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-bold text-white">
                          Small Room (Same Room)
                        </span>
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300">
                          DEFAULT
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                        Record only, <strong>no audio monitoring</strong>. Zero
                        speaker feedback when sitting together.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecordingMode('remote')}
                    className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                      recordingMode === 'remote'
                        ? 'bg-violet-500/15 border-violet-500/50 text-white shadow-lg shadow-violet-500/10'
                        : 'bg-zinc-950/70 border-white/10 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Headphones
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        recordingMode === 'remote'
                          ? 'text-violet-400'
                          : 'text-zinc-500'
                      }`}
                    />
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-white">
                        Remote Studio (Call)
                      </span>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                        Live audio/video monitoring for members in different
                        locations wearing headphones.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Episode Title
                  </label>
                  <input
                    type="text"
                    value={episodeTitle}
                    onChange={(e) => setEpisodeTitle(e.target.value)}
                    placeholder="e.g., Ep. 12 â€” Late Night Small Room Pod"
                    className="w-full px-3.5 py-3 rounded-xl bg-zinc-950/90 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Episode #
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={episodeNum}
                    onChange={(e) => setEpisodeNum(Number(e.target.value) || 1)}
                    className="w-full px-3.5 py-3 rounded-xl bg-zinc-950/90 border border-white/10 text-sm text-white focus:outline-none focus:border-rose-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Show Notes / Talking Points (Visible on everyone&apos;s phone)
                </label>
                <textarea
                  rows={2}
                  value={episodeDesc}
                  onChange={(e) => setEpisodeDesc(e.target.value)}
                  placeholder="Bullet points or cues everyone can read on their phone while recording..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/90 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-4 px-5 rounded-2xl btn-chili active:scale-[0.99] text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Radio className="w-4 h-4" />
                {isCreating
                  ? 'Opening Studio...'
                  : recordingMode === 'small-room'
                  ? 'Launch Small-Room Recorder (No Feedback)'
                  : 'Launch Remote Studio Lobby'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Right: Small-Room Recording Guide + Quick Tools */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-3xl bg-zinc-900/80 border border-white/10 p-5 space-y-3.5">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-emerald-400 shrink-0" />
                <h3 className="text-sm font-bold text-white">
                  How Small-Room Recording Works
                </h3>
              </div>
              <ol className="text-xs text-zinc-300 space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  <strong>Everyone joins on their phone</strong> in the small
                  room using the room code.
                </li>
                <li>
                  <strong>Audio Monitoring is OFF</strong> â€” phones never play
                  voice audio out of speakers, eliminating screeching feedback.
                </li>
                <li>
                  <strong>Anti-Bleed Gain Lock</strong> â€” disables auto-gain
                  boost so quiet phones don&apos;t amplify other people in the
                  room.
                </li>
                <li>
                  <strong>1-Tap Master Record</strong> â€” starts &amp; stops
                  48kHz local recording on every phone simultaneously and sends
                  stems to the Web Audio Editor.
                </li>
              </ol>
            </div>

            {/* Quick Tool Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => router.push('/admin')}
                className="cursor-pointer rounded-2xl bg-gradient-to-br from-amber-500/15 to-rose-500/10 border border-amber-500/30 p-4 hover:border-amber-400/50 active:scale-[0.99] transition"
              >
                <Crown className="w-5 h-5 text-amber-400 mb-1.5" />
                <h3 className="text-xs sm:text-sm font-bold text-white">
                  Crew Roster ({members.length})
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Add members &amp; copy personal links.
                </p>
              </div>

              <div
                onClick={() => router.push('/editor')}
                className="cursor-pointer rounded-2xl bg-gradient-to-br from-violet-500/15 to-sky-500/10 border border-violet-500/30 p-4 hover:border-violet-400/50 active:scale-[0.99] transition"
              >
                <Sliders className="w-5 h-5 text-violet-400 mb-1.5" />
                <h3 className="text-xs sm:text-sm font-bold text-white">
                  Web Audio Editor
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Mix all room tracks &amp; export WAV.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Active & Past Podcast Studios */}
        <section className="pt-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-white">
                Active Studios &amp; Episodes
              </h2>
              <p className="text-xs text-zinc-400">
                Tap any room on your phone to join as an isolated mic
              </p>
            </div>
          </div>

          {myRooms.length === 0 ? (
            <div className="rounded-3xl bg-zinc-900/40 border border-white/10 p-8 text-center">
              <Mic className="w-9 h-9 text-zinc-600 mx-auto mb-2.5" />
              <h3 className="text-sm font-semibold text-zinc-300">
                No studio sessions yet
              </h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
                Launch a Small-Room Recorder above and have everyone in the room
                open it on their phone.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myRooms.map((room) => {
                const isSmallRoom =
                  (room.recordingMode || 'small-room') === 'small-room';
                return (
                  <div
                    key={room.id}
                    className="rounded-2xl bg-zinc-900/80 border border-white/10 p-4 sm:p-5 flex flex-col justify-between hover:border-white/20 transition"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-white/5 text-zinc-300 border border-white/10">
                            EP #{room.episodeNumber || 1}
                          </span>
                          {isSmallRoom && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <VolumeX className="w-3 h-3" />
                              Small Room
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {room.isRecording ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                              REC
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10">
                              Ready
                            </span>
                          )}
                          <button
                            onClick={async () => {
                              await deletePodcastRoom(room.id);
                              toast.success('Studio removed');
                            }}
                            title="Delete studio"
                            className="p-1.5 text-zinc-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-white line-clamp-1">
                        {room.title}
                      </h3>
                      <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                        {room.description}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-500 mt-2">
                        Code: <span className="text-zinc-300">{room.id}</span>
                      </p>
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-white/10 flex items-center gap-2">
                      <button
                        onClick={() => copyInviteLink(room.id)}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-200 transition flex items-center justify-center gap-1.5"
                      >
                        {copiedRoomId === room.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                            Share Link
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => router.push(`/rooms/${room.id}`)}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white transition flex items-center justify-center gap-1.5 shadow-lg shadow-rose-500/20"
                      >
                        Join as Mic
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Mobile-First Bottom Tab Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-white/10 pb-safe">
        <div className="grid grid-cols-3 h-14">
          <button
            onClick={() => router.push('/')}
            className="flex flex-col items-center justify-center gap-1 text-rose-400 font-semibold text-[11px]"
          >
            <Mic className="w-4 h-4" />
            <span>Studios</span>
          </button>
          <button
            onClick={() => router.push('/editor')}
            className="flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white font-medium text-[11px]"
          >
            <Sliders className="w-4 h-4" />
            <span>Audio Editor</span>
          </button>
          <button
            onClick={() => router.push('/admin')}
            className="flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white font-medium text-[11px]"
          >
            <Users className="w-4 h-4" />
            <span>Crew ({members.length})</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

