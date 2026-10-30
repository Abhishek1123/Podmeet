'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mic, ShieldAlert, AlertTriangle, Info } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

function LoginInner() {
  const params = useSearchParams();
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const errorParam = params.get('error');
  const emailParam = params.get('email') || '';

  const [denied, setDenied] = useState<string | null>(
    errorParam === 'not_invited' ? emailParam : null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(
    errorParam === 'session_failed'
      ? 'Session expired or could not be established. Please try signing in again.'
      : null
  );

  const rawNext = params.get('next') || '/';
  // Only allow same-origin relative redirects.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const handleSignIn = async () => {
    setBusy(true);
    setDenied(null);
    setErrorMessage(null);
    const result = await signInWithGoogle();
    if (result.ok) {
      window.location.replace(next);
      return;
    }
    if (result.error === 'not_invited') {
      setDenied(result.email || '');
    } else if (result.error === 'unauthorized_domain') {
      setErrorMessage(
        result.message ||
          'This Vercel domain has not been added to Firebase Authorized Domains.'
      );
    } else if (result.error === 'failed') {
      setErrorMessage(
        result.message ||
          'Sign-in failed. Please check your network and Vercel environment variables.'
      );
    }
    setBusy(false);
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 bg-[#070707] text-zinc-100">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900/80 p-8 text-center space-y-6 shadow-2xl">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-acid-400/15 border border-acid-400/30 flex items-center justify-center text-acid-400">
          <Mic className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-white">AcidReflux Studio</h1>
          <p className="text-xs text-zinc-400">
            Private Recording Studio &bull; Sign in with your Google account.
          </p>
        </div>

        {denied !== null && (
          <div className="flex flex-col gap-2 text-left text-xs rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-200 p-3.5">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>
                {denied ? <strong className="font-semibold text-white">{denied}</strong> : 'This Google account'}{' '}
                is not on the invited crew roster.
              </span>
            </div>
            <p className="text-[11px] text-rose-300/80 pl-6">
              If you are the admin, make sure your email is listed in Vercel&apos;s{' '}
              <code className="px-1 py-0.5 rounded bg-black/40 text-amber-300">SUPER_ADMIN_EMAIL</code>{' '}
              environment variable or added by an owner.
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-start gap-2 text-left text-xs rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={busy}
          className="w-full px-4 py-3 rounded-xl bg-white text-zinc-950 text-sm font-bold hover:bg-zinc-100 disabled:opacity-60 transition flex items-center justify-center gap-2"
        >
          {busy ? 'Verifying account…' : 'Continue with Google'}
        </button>

        <div className="text-[11px] text-zinc-500 text-center flex items-center justify-center gap-1">
          <Info className="w-3.5 h-3.5" />
          <span>Hosts &amp; Invited Guests Only</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

