'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  UserPlus,
  Users,
  Radio,
  Sliders,
  Trash2,
  Copy,
  Check,
  ArrowLeft,
  Crown,
  Mail,
  Mic,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useAuth, SUPER_ADMIN_EMAIL, isSuperAdminEmail } from '@/lib/AuthContext';
import {
  PodcastMember,
  PodcastRoom,
  addPodcastMember,
  removePodcastMember,
  updatePodcastMemberRole,
  subscribeToPodcastMembers,
  subscribeToAllRooms,
  triggerMasterLobbyRecordingSession,
} from '@/lib/podcast-service';
import { shareLobbyLink } from '@/lib/share-utils';
import toast from 'react-hot-toast';

export default function AdminPortalPage() {
  const router = useRouter();
  const {
    user,
    loading,
    isSuperAdmin,
    isSubAdmin,
    isAdmin,
  } = useAuth();

  const [members, setMembers] = useState<PodcastMember[]>([]);
  const [rooms, setRooms] = useState<PodcastRoom[]>([]);

  // Add Member Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PodcastMember['role']>('co-host');
  const [bio, setBio] = useState('');
  const [assignedRoomId, setAssignedRoomId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/');
    }
  }, [loading, isAdmin, router]);

  useEffect(() => {
    const unsubMembers = subscribeToPodcastMembers((list) => setMembers(list));
    const unsubRooms = subscribeToAllRooms((list) => {
      setRooms(list);
      if (list.length > 0 && !assignedRoomId) {
        setAssignedRoomId(list[0].id);
      }
    });
    return () => {
      unsubMembers();
      unsubRooms();
    };
  }, [assignedRoomId]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      toast.error('Only the Super Admin can register new members or create Sub Admins.');
      return;
    }
    if (!name.trim() || !email.trim()) {
      toast.error('Please enter member name and email');
      return;
    }
    setSubmitting(true);
    try {
      await addPodcastMember({
        name,
        email,
        role,
        bio: bio.trim() || (role === 'sub_admin' ? 'Sub Admin' : 'Podcast Studio Member'),
        assignedRoomId: assignedRoomId || null,
        addedBy: user?.email || SUPER_ADMIN_EMAIL,
      });
      toast.success(
        role === 'sub_admin'
          ? `Created Sub Admin: ${name} (${email})!`
          : `Added ${name} (${email}) to Podcast Members!`
      );
      setName('');
      setEmail('');
      setBio('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  const copyMemberInvite = async (member: PodcastMember) => {
    const targetRoom = member.assignedRoomId || rooms[0]?.id || 'main-studio';
    const matchedRoom = rooms.find((r) => r.id === targetRoom);
    const mode = matchedRoom?.recordingMode || 'small-room';

    const result = await shareLobbyLink({
      roomId: targetRoom,
      roomTitle: matchedRoom?.title || `Studio #${targetRoom}`,
      mode,
      member: member.name,
      email: member.email,
    });

    if (result.success) {
      setCopiedId(member.id);
      if (result.method === 'clipboard') {
        toast.success(`Copied personal studio lobby link for ${member.name}!`, {
          icon: '🎙️',
        });
      }
      setTimeout(() => setCopiedId(null), 2500);
    } else if (result.method !== 'cancelled') {
      toast.error('Failed to copy member link');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#070707] text-zinc-100 flex flex-col pb-20 md:pb-8">
      {/* Top Admin Header (Mobile-First) */}
      <header className="border-b border-white/10 bg-zinc-950/90 backdrop-blur-xl sticky top-0 z-20 pt-safe">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => router.push('/')}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
                <Crown className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm sm:text-base font-bold text-white truncate">
                    {isSuperAdmin ? 'Crew & Super Admin' : 'Crew & Sub Admin'}
                  </h1>
                  <span className={`hidden sm:inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${
                    isSuperAdmin
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                  }`}>
                    {isSuperAdmin ? SUPER_ADMIN_EMAIL : (user?.email || 'Sub Admin')}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 hidden sm:block truncate">
                  {isSuperAdmin
                    ? 'Manage podcast members, studio lobbies & web audio editor'
                    : 'Access podcast crew roster, studio lobbies & web audio editor'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => router.push('/editor')}
              className="px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition flex items-center gap-1.5 shadow-lg shadow-violet-600/20"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Audio Editor</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* Status Banner */}
        <div className={`rounded-3xl border p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          isSuperAdmin
            ? 'bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-violet-500/15 border-amber-500/30'
            : 'bg-gradient-to-r from-violet-500/15 via-sky-500/10 to-emerald-500/15 border-violet-500/30'
        }`}>
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl border flex items-center justify-center shrink-0 ${
              isSuperAdmin
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-violet-500/20 border-violet-500/40 text-violet-300'
            }`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  {isSuperAdmin ? 'Super Admin Control Center' : 'Sub Admin Portal'}
                </h2>
                <span className={`text-[10px] sm:text-[11px] font-mono px-2 py-0.5 rounded break-all ${
                  isSuperAdmin
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-violet-500/20 text-violet-300'
                }`}>
                  {isSuperAdmin ? `Owner: ${SUPER_ADMIN_EMAIL}` : `Sub Admin: ${user?.email || 'Logged In'}`}
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5">
                {isSuperAdmin
                  ? 'As Super Admin, you can add crew members, designate Sub Admins, manage studios, and launch Master Recordings.'
                  : 'As Sub Admin, you have access to studio lobbies, master recordings, and the crew roster.'}
              </p>
            </div>
          </div>
        </div>

        {/* Main Grid: Add Member Form + Roster */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          {/* Left: Add Podcast Member Form (Super Admin Only) */}
          <div className="lg:col-span-5 rounded-3xl bg-zinc-900/80 border border-white/10 p-4 sm:p-8 shadow-2xl">
            {isSuperAdmin ? (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      Add Member &amp; Sub Admins
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Super Admin: register crew or appoint Sub Admins
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAddMember} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Rohan Verma"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Email Address (Google Account)
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="friend@gmail.com"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Studio Role
                      </label>
                      <select
                        value={role}
                        onChange={(e) =>
                          setRole(e.target.value as PodcastMember['role'])
                        }
                        className="w-full px-3.5 py-3 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:outline-none focus:border-rose-500"
                      >
                        <option value="co-host">Co-Host</option>
                        <option value="sub_admin">Sub Admin (Admin Access)</option>
                        <option value="host">Host</option>
                        <option value="guest">Featured Guest</option>
                        <option value="producer">Audio Producer</option>
                        <option value="editor">Sound Editor</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Assign to Studio
                      </label>
                      <select
                        value={assignedRoomId}
                        onChange={(e) => setAssignedRoomId(e.target.value)}
                        className="w-full px-3.5 py-3 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:outline-none focus:border-rose-500"
                      >
                        <option value="">All Studios</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title} ({r.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {role === 'sub_admin' && (
                    <div className="rounded-xl bg-violet-500/15 border border-violet-500/30 p-3 text-xs text-violet-200">
                      <p className="font-semibold text-violet-300 flex items-center gap-1.5">
                        <Crown className="w-3.5 h-3.5" /> Sub Admin Privileges:
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-300">
                        This member will be able to access the Admin dashboard, studio lobbies, and trigger master recordings. Only you (Super Admin) can add/remove members.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Notes / Mic Setup (Optional)
                    </label>
                    <input
                      type="text"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="e.g., Shure MV7 â€¢ Co-Host on Tech Episodes"
                      className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-semibold text-sm shadow-lg shadow-rose-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    {submitting
                      ? 'Saving...'
                      : role === 'sub_admin'
                      ? 'Create Sub Admin'
                      : 'Add Member to Podcast Roster'}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-6 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-500/40 text-violet-300 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">Sub Admin Mode</h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                  You have Sub Admin access to manage studio lobbies, launch master recordings, and view the crew roster.
                </p>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 text-left">
                  <strong>Notice:</strong> Only the Super Admin ({SUPER_ADMIN_EMAIL}) can add new members or designate new Sub Admins.
                </div>
              </div>
            )}
          </div>

          {/* Right: Podcast Members Roster */}
          <div className="lg:col-span-7 rounded-3xl bg-zinc-900/80 border border-white/10 p-4 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Podcast Members Roster ({members.length})
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {isSuperAdmin
                      ? 'Change roles, promote to Sub Admin, or copy lobby links'
                      : 'Copy personal lobby invite links for the crew'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {members.map((m) => {
                const isOwner = isSuperAdminEmail(m.email);
                const isSub = m.role === 'sub_admin' || m.role === 'admin';
                return (
                  <div
                    key={m.id}
                    className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                      isOwner
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : isSub
                        ? 'bg-violet-500/10 border-violet-500/30'
                        : 'bg-zinc-950/80 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-base shrink-0 ${
                          isOwner
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950'
                            : isSub
                            ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white'
                            : 'bg-gradient-to-br from-rose-500 to-violet-600 text-white'
                        }`}
                      >
                        {m.name[0]?.toUpperCase() || 'M'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white truncate">
                            {m.name}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              isOwner
                                ? 'bg-amber-500/25 text-amber-300 border-amber-500/40'
                                : isSub
                                ? 'bg-violet-500/25 text-violet-300 border-violet-500/40'
                                : 'bg-white/10 text-zinc-300 border-white/15'
                            }`}
                          >
                            {isOwner ? 'SUPER ADMIN' : isSub ? 'SUB ADMIN' : m.role}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5 truncate">
                          <Mail className="w-3 h-3 text-zinc-500 shrink-0" />
                          {m.email}
                        </p>
                        {m.bio && (
                          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                            {m.bio}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto flex-wrap">
                      {/* Super Admin Role Changer */}
                      {isSuperAdmin && !isOwner && (
                        <select
                          value={m.role}
                          onChange={async (e) => {
                            const newRole = e.target.value as PodcastMember['role'];
                            await updatePodcastMemberRole(m.id, newRole);
                            toast.success(`Updated ${m.name}'s role to ${newRole === 'sub_admin' ? 'Sub Admin' : newRole}`);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-white/15 text-xs text-zinc-200 focus:outline-none focus:border-amber-400 cursor-pointer"
                          title="Change member role or promote to Sub Admin"
                        >
                          <option value="co-host">Co-Host</option>
                          <option value="sub_admin">Sub Admin ⭐</option>
                          <option value="host">Host</option>
                          <option value="guest">Guest</option>
                          <option value="producer">Producer</option>
                          <option value="editor">Editor</option>
                        </select>
                      )}

                      <button
                        onClick={() => copyMemberInvite(m)}
                        className="flex-1 sm:flex-initial justify-center px-3 py-2.5 sm:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition active:scale-95"
                      >
                        {copiedId === m.id ? (
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

                      {isSuperAdmin && !isOwner && (
                        <button
                          onClick={async () => {
                            await removePodcastMember(m.id);
                            toast.success(`Removed ${m.name}`);
                          }}
                          title="Remove member"
                          className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Active Studio Rooms & Master Record Trigger */}
        <section className="rounded-3xl bg-zinc-900/80 border border-white/10 p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Mic className="w-5 h-5 text-rose-400" />
                Studio Lobbies &amp; Master Recording Control
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Start the Master Recording for any room once members are in the
                lobby, or open tracks in the Web Audio Editor
              </p>
            </div>
          </div>

          {rooms.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">
              No studios created yet. Create a studio on the Home dashboard first.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="rounded-2xl bg-zinc-950 border border-white/10 p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white/5 text-zinc-400 border border-white/10">
                        Room: {room.id}
                      </span>
                      {room.isRecording ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                          RECORDING LIVE
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          LOBBY READY
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-white">
                      {room.title}
                    </h3>
                    <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                      {room.description}
                    </p>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-white/10">
                    <button
                      onClick={async () => {
                        await triggerMasterLobbyRecordingSession(room.id);
                        toast.success(
                          'Master Recording triggered! Entering studio...'
                        );
                        router.push(
                          `/rooms/${room.id}?mode=${
                            room.recordingMode || 'small-room'
                          }`
                        );
                      }}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-lg shadow-rose-500/20 transition"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      Master Record &amp; Enter Lobby
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() =>
                          router.push(
                            `/rooms/${room.id}?mode=${
                              room.recordingMode || 'small-room'
                            }`
                          )
                        }
                        className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 flex items-center justify-center gap-1 transition"
                      >
                        Lobby
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() =>
                          router.push(`/editor?roomId=${room.id}`)
                        }
                        className="py-2 px-3 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-xs font-semibold text-violet-300 flex items-center justify-center gap-1 transition"
                      >
                        <Sliders className="w-3 h-3" />
                        Audio Editor
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Mobile-First Bottom Tab Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-white/10 pb-safe">
        <div className="grid grid-cols-3 h-14">
          <button
            onClick={() => router.push('/')}
            className="flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white font-medium text-[11px]"
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
            className="flex flex-col items-center justify-center gap-1 text-amber-400 font-semibold text-[11px]"
          >
            <Users className="w-4 h-4" />
            <span>Crew ({members.length})</span>
          </button>
        </div>
      </nav>
    </div>
  );
}


