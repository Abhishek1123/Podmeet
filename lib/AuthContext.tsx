'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  auth,
  db,
  storage,
  googleProvider,
  signInWithPopup,
  updateProfile,
  fbSignOut,
} from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  SUPER_ADMIN_EMAIL,
  isSuperAdminEmail,
  getSuperAdminEmails,
} from './session';
import toast from 'react-hot-toast';

export { SUPER_ADMIN_EMAIL, isSuperAdminEmail, getSuperAdminEmails };

export type SignInResult =
  | { ok: true; user: User; isSuperAdmin: boolean }
  | {
      ok: false;
      error: 'not_invited' | 'cancelled' | 'failed' | 'unauthorized_domain';
      email?: string;
      message?: string;
    };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isSuperAdmin: boolean;
  /** Google sign-in + server-side invitation check. Sets the session cookie. */
  signInWithGoogle: () => Promise<SignInResult>;
  updateAvatar: (file: File) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isSuperAdmin: false,
  signInWithGoogle: async () => ({ ok: false, error: 'failed' }),
  updateAvatar: async () => null,
  logout: async () => {},
});

async function createServerSession(user: User) {
  const idToken = await user.getIdToken(true);
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const onLogin =
        typeof window !== 'undefined' && window.location.pathname === '/login';

      if (!currentUser) {
        setUser(null);
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      // Only Google accounts are allowed (no anonymous / email-password).
      const isGoogle = currentUser.providerData.some(
        (p) => p.providerId === 'google.com'
      );
      if (!isGoogle) {
        await fbSignOut(auth);
        return;
      }

      const email = (currentUser.email || '').toLowerCase().trim();
      const isSuper = isSuperAdminEmail(email);
      setUser(currentUser);
      setIsSuperAdmin(isSuper);
      setLoading(false);

      if (onLogin) return; // the login page runs its own session exchange

      try {
        const check = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!check.ok) {
          const r = await createServerSession(currentUser);
          if (!r.ok) {
            await fetch('/api/auth/session', { method: 'DELETE' });
            await fbSignOut(auth);
            const redirectUrl =
              r.body?.error === 'not_invited'
                ? `/login?error=not_invited&email=${encodeURIComponent(email)}`
                : `/login?error=session_failed&msg=${encodeURIComponent(
                    r.body?.error || 'unauthorized'
                  )}`;
            window.location.href = redirectUrl;
            return;
          }
        }
      } catch (err) {
        console.warn('Session check failed:', err);
      }

      try {
        await setDoc(
          doc(db, 'users', currentUser.uid),
          {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'Podcast Creator',
            email,
            photoURL: currentUser.photoURL || null,
            role: isSuper ? 'super_admin' : 'member',
            isSuperAdmin: isSuper,
            lastSeenAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Could not sync user doc:', err);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async (): Promise<SignInResult> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const isSuper = isSuperAdminEmail(result.user.email);
      const r = await createServerSession(result.user);
      if (!r.ok) {
        await fbSignOut(auth);
        if (r.body?.error === 'not_invited') {
          return {
            ok: false,
            error: 'not_invited',
            email: result.user.email || undefined,
          };
        }
        return {
          ok: false,
          error: 'failed',
          email: result.user.email || undefined,
          message:
            r.body?.message ||
            r.body?.error ||
            'Could not establish server session',
        };
      }
      setUser(result.user);
      setIsSuperAdmin(Boolean(r.body?.isSuperAdmin || isSuper));
      return {
        ok: true,
        user: result.user,
        isSuperAdmin: Boolean(r.body?.isSuperAdmin || isSuper),
      };
    } catch (error: any) {
      if (
        error?.code === 'auth/popup-closed-by-user' ||
        error?.code === 'auth/cancelled-popup-request'
      ) {
        return { ok: false, error: 'cancelled' };
      }
      if (error?.code === 'auth/unauthorized-domain') {
        const msg =
          'Domain not authorized in Firebase! Add your Vercel domain to Firebase Console → Authentication → Settings → Authorized domains.';
        console.error(msg, error);
        toast.error(msg, { duration: 8000 });
        return { ok: false, error: 'unauthorized_domain', message: msg };
      }
      console.error('Google Sign-In Error:', error);
      toast.error(error?.message || 'Google Sign-In failed');
      return { ok: false, error: 'failed', message: error?.message };
    }
  };
  /** Resize to a 384px square JPEG, upload to Storage and set as the profile photo. */
  const updateAvatar = async (file: File): Promise<string | null> => {
    const current = auth.currentUser;
    if (!current) {
      toast.error('Sign in first to set an avatar');
      return null;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return null;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image is too large (max 15 MB)');
      return null;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const size = 384;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unsupported');
      const side = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size
      );
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Could not encode image'))),
          'image/jpeg',
          0.88
        )
      );
      const fileRef = ref(storage, `avatars/${current.uid}/avatar.jpg`);
      await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
      const url = `${await getDownloadURL(fileRef)}`;
      const bustedUrl = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
      await updateProfile(current, { photoURL: bustedUrl });
      setUser({ ...current, photoURL: bustedUrl } as User);
      try {
        await setDoc(
          doc(db, 'users', current.uid),
          { photoURL: bustedUrl },
          { merge: true }
        );
      } catch (err) {
        console.warn('Could not sync avatar to user doc:', err);
      }
      toast.success('Avatar updated!');
      return bustedUrl;
    } catch (error: any) {
      console.error('Avatar upload error:', error);
      toast.error(error?.message || 'Avatar upload failed');
      return null;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      await fbSignOut(auth);
    } finally {
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, isSuperAdmin, signInWithGoogle, updateAvatar, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
