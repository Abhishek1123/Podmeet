import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  SUPER_ADMIN_EMAIL,
  isSuperAdminEmail,
  createSessionToken,
  verifySessionToken,
} from '@/lib/session';

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'podmeet-app-studio';

const JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  )
);

/** Member doc ids are the lowercased email with non-alphanumerics replaced by "_". */
const memberDocId = (email: string) => email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');

/** Looks up the invitation using the user's own ID token, so Firestore rules apply. */
async function findInvitation(
  idToken: string,
  email: string
): Promise<{ name?: string; role: string } | null> {
  const cleanEmail = email.trim().toLowerCase();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/members/${memberDocId(
    cleanEmail
  )}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`[findInvitation] Member doc check failed (${res.status}) for ${cleanEmail}`);
      return null;
    }
    const doc = await res.json();
    const f = doc?.fields ?? {};
    const docEmail = String(f.email?.stringValue ?? '').toLowerCase().trim();
    if (docEmail && docEmail !== cleanEmail) return null;
    return { name: f.name?.stringValue, role: f.role?.stringValue ?? 'guest' };
  } catch (err) {
    console.warn('[findInvitation] Network error checking member doc:', err);
    return null;
  }
}

/** Exchange a Firebase (Google) ID token for a signed session cookie, if invited. */
export async function POST(req: NextRequest) {
  let idToken: unknown;
  try {
    ({ idToken } = await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (typeof idToken !== 'string') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  let claims: Record<string, any>;
  try {
    ({ payload: claims } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    }));
  } catch (err: any) {
    console.error('[Auth Session] Token verify failed:', err?.message);
    return NextResponse.json(
      { error: 'invalid_token', message: err?.message },
      { status: 401 }
    );
  }

  const email = String(claims.email ?? '').trim().toLowerCase();
  if (
    !email ||
    claims.firebase?.sign_in_provider !== 'google.com' ||
    claims.email_verified === false
  ) {
    return NextResponse.json({ error: 'google_required' }, { status: 403 });
  }

  let isSuperAdmin = isSuperAdminEmail(email);
  let name: string | undefined = claims.name;
  let role = isSuperAdmin ? 'super_admin' : 'member';

  if (!isSuperAdmin) {
    const invite = await findInvitation(idToken, email);
    if (!invite) {
      console.warn(
        `[Auth Session] Access denied: ${email} is not in super admin emails and has no member invitation.`
      );
      return NextResponse.json({ error: 'not_invited', email }, { status: 403 });
    }
    role = invite.role;
    if (role === 'super_admin') {
      isSuperAdmin = true;
    }
    name = invite.name || name;
  }

  let token: string;
  try {
    token = await createSessionToken({ email, name, role, isSuperAdmin });
  } catch (e: any) {
    console.error('[Auth Session] Session creation failed:', e);
    return NextResponse.json(
      { error: 'server_misconfigured', message: e?.message },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true, email, role, isSuperAdmin });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const s = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!s) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json(s);
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

