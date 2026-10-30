import { SignJWT, jwtVerify } from 'jose';

/** Edge-safe session helpers (used by middleware and API routes). */
export const SESSION_COOKIE = 'podmeet_session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export const DEFAULT_SUPER_ADMIN = 'abhichatterjee90@gmail.com';

/** List of all super admin emails from env and defaults. */
export function getSuperAdminEmails(): string[] {
  const envSources = [
    typeof process !== 'undefined' ? process.env.SUPER_ADMIN_EMAIL : undefined,
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL : undefined,
    typeof process !== 'undefined' ? process.env.ADMIN_EMAIL : undefined,
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_ADMIN_EMAIL : undefined,
  ];

  const list = [DEFAULT_SUPER_ADMIN.toLowerCase()];
  for (const src of envSources) {
    if (src) {
      src.split(',').forEach((em) => {
        const clean = em.trim().toLowerCase();
        if (clean && !list.includes(clean)) {
          list.push(clean);
        }
      });
    }
  }
  return list;
}

/** Check if an email is recognized as a Super Admin */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return getSuperAdminEmails().includes(clean);
}

const envAdmin =
  typeof process !== 'undefined'
    ? process.env.SUPER_ADMIN_EMAIL ||
      process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL ||
      process.env.ADMIN_EMAIL ||
      process.env.NEXT_PUBLIC_ADMIN_EMAIL
    : undefined;

export const SUPER_ADMIN_EMAIL =
  (envAdmin ? envAdmin.split(',')[0].trim().toLowerCase() : '') ||
  DEFAULT_SUPER_ADMIN;

export interface SessionPayload {
  email: string;
  name?: string;
  role: string;
  isSuperAdmin: boolean;
}

// Fallback key (32+ chars) guarantees Vercel never crashes with 500 server_misconfigured
// even if AUTH_SESSION_SECRET wasn't pasted into Vercel environment variables.
const FALLBACK_SECRET =
  'podmeet-studio-session-secret-default-key-min32chars-2026-safe-edge';

function secretKey(): Uint8Array {
  const s =
    (typeof process !== 'undefined' ? process.env.AUTH_SESSION_SECRET : undefined) ||
    FALLBACK_SECRET;
  return new TextEncoder().encode(s.padEnd(32, '_'));
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const key = secretKey();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(key);
}

export async function verifySessionToken(
  token: string | undefined
): Promise<SessionPayload | null> {
  if (!token) return null;
  const key = secretKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    if (typeof payload.email !== 'string') return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

