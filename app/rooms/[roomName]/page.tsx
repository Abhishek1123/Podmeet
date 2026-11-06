import * as React from 'react';
import { PageClientImpl } from './PageClientImpl';
import { isVideoCodec } from '@/lib/types';
import { getLiveKitURL } from '@/lib/getLiveKitURL';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ roomName: string }>;
  searchParams: Promise<{
    region?: string;
    hq?: string;
    codec?: string;
    singlePC?: string;
    mode?: string;
    member?: string;
    email?: string;
  }>;
}) {
  const _params = await params;
  const _searchParams = await searchParams;
  const cleanRoomName = decodeURIComponent(_params.roomName || '').trim();
  const codec =
    typeof _searchParams.codec === 'string' && isVideoCodec(_searchParams.codec)
      ? _searchParams.codec
      : 'vp9';
  const hq = _searchParams.hq === 'true' ? true : false;
  const singlePC = _searchParams.singlePC !== 'false';
  const serverUrl = process.env.LIVEKIT_URL
    ? getLiveKitURL(process.env.LIVEKIT_URL, _searchParams.region ?? null)
    : undefined;

  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#070707] text-zinc-300 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 animate-pulse">
            <span className="w-3 h-3 rounded-full bg-rose-500" />
          </div>
          <p className="text-sm font-semibold text-zinc-200">
            Opening Studio Lobby...
          </p>
          <p className="text-xs text-zinc-500 font-mono">
            Room: {cleanRoomName}
          </p>
        </div>
      }
    >
      <PageClientImpl
        roomName={cleanRoomName}
        serverUrl={serverUrl}
        region={_searchParams.region}
        hq={hq}
        codec={codec}
        singlePeerConnection={singlePC}
      />
    </React.Suspense>
  );
}
