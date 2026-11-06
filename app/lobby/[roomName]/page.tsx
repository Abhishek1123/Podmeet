import { redirect } from 'next/navigation';

export default async function LobbyPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ roomName: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { roomName } = await params;
  const sp = await searchParams;

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') {
      query.set(k, v);
    } else if (Array.isArray(v)) {
      v.forEach((val) => query.append(k, val));
    }
  }

  const queryString = query.toString();
  redirect(`/rooms/${encodeURIComponent(roomName)}${queryString ? `?${queryString}` : ''}`);
}
