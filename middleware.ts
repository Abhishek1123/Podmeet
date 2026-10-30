import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

/** Everything requires an invited Google session except these. */
const PUBLIC_PATHS = ['/login', '/api/auth/session'];

/** Only the super admin may open these. */
const ADMIN_ONLY = ['/admin'];

const matches = (path: string, list: string[]) =>
  list.some((p) => path === p || path.startsWith(`${p}/`));

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (matches(pathname, PUBLIC_PATHS)) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith('/api/');

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (matches(pathname, ADMIN_ONLY) && !session.isSuperAdmin) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images/|opengraph-image|twitter-image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|mp3|wav|woff2?)$).*)',
  ],
};

