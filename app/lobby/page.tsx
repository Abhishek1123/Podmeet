import { redirect } from 'next/navigation';

export default async function LobbyIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const targetRoom =
    (typeof sp.room === 'string' && sp.room) ||
    (typeof sp.roomName === 'string' && sp.roomName) ||
    '';

  if (targetRoom) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k !== 'room' && k !== 'roomName') {
        if (typeof v === 'string') query.set(k, v);
        else if (Array.isArray(v)) v.forEach((val) => query.append(k, val));
      }
    }
    const qStr = query.toString();
    redirect(`/rooms/${encodeURIComponent(targetRoom)}${qStr ? `?${qStr}` : ''}`);
  }

  redirect('/');
}
