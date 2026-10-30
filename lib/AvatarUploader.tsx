'use client';

import React, { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';

interface AvatarUploaderProps {
  /** Pixel size of the avatar circle. */
  size?: number;
  className?: string;
  /** Show the "Change photo" caption underneath. */
  showLabel?: boolean;
}

/**
 * Round avatar with an upload overlay. Click (or tap) to pick an image; it is
 * cropped to a square, resized, uploaded to Firebase Storage and saved as the
 * user's profile photo.
 */
export default function AvatarUploader({
  size = 40,
  className = '',
  showLabel = false,
}: AvatarUploaderProps) {
  const { user, updateAvatar } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    await updateAvatar(file);
    setBusy(false);
  };

  const initial = (user?.displayName || 'A')[0].toUpperCase();

  return (
    <div className={`inline-flex flex-col items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || !user}
        title={user ? 'Upload your avatar' : 'Sign in to upload an avatar'}
        aria-label="Upload avatar"
        style={{ width: size, height: size }}
        className="group relative rounded-full overflow-hidden ring-2 ring-acid-400/60 hover:ring-sun-400 transition shrink-0 disabled:cursor-not-allowed"
      >
        {user?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt={user.displayName || 'Your avatar'}
            className="w-full h-full object-cover"
          />
        ) : (
          <span
            className="w-full h-full flex items-center justify-center font-display bg-gradient-to-tr from-chili-500 to-sun-400 text-black"
            style={{ fontSize: size * 0.45 }}
          >
            {initial}
          </span>
        )}
        <span
          className={`absolute inset-0 flex items-center justify-center bg-black/60 transition ${
            busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
          }`}
        >
          {busy ? (
            <Loader2
              className="animate-spin text-acid-400"
              style={{ width: size * 0.4, height: size * 0.4 }}
            />
          ) : (
            <Camera
              className="text-acid-400"
              style={{ width: size * 0.4, height: size * 0.4 }}
            />
          )}
        </span>
      </button>
      {showLabel && (
        <span className="text-[11px] font-semibold text-acid-300">
          {busy ? 'Uploading…' : user ? 'Change photo' : 'Sign in to add photo'}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}

