import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Same-origin streaming proxy for Firebase Storage recordings.
 * The default bucket has no CORS configuration, so the editor cannot fetch()
 * download URLs directly. Only Firebase Storage hosts are allowed (no SSRF).
 */
const ALLOWED_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) {
    return new NextResponse('Missing url', { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse('Invalid url', { status: 400 });
  }

  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const isAllowedHost = target.protocol === 'https:' && ALLOWED_HOSTS.has(target.hostname);
  const isOurBucket = !bucket || target.pathname.includes(`/${bucket}/`) || target.pathname.includes(`/b/${bucket}/`);
  if (!isAllowedHost || !isOurBucket) {
    return new NextResponse('Host not allowed', { status: 403 });
  }

  const upstream = await fetch(target.toString());
  if (!upstream.ok || !upstream.body) {
    return new NextResponse('Upstream error', { status: upstream.status || 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

