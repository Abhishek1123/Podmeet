import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const alt =
  'AcidReflux Podcast — Spicy Indian Takes, Burning Hot-Takes';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const logo = await readFile(
    path.join(process.cwd(), 'public', 'images', 'acidreflux-logo.jpg')
  );
  const logoSrc = `data:image/jpeg;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#070707',
          backgroundImage:
            'radial-gradient(circle at 78% 20%, rgba(240,57,30,0.35), transparent 45%), radial-gradient(circle at 15% 90%, rgba(201,226,27,0.22), transparent 45%)',
          color: '#f4f4ef',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 420,
            height: '100%',
            padding: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            width={354}
            height={630}
            alt=""
            style={{ objectFit: 'cover' }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            padding: '0 56px 0 24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 6,
              color: '#ffd60a',
              textTransform: 'uppercase',
            }}
          >
            The Podcast
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 128,
              fontWeight: 900,
              lineHeight: 1,
              marginTop: 8,
              letterSpacing: -3,
            }}
          >
            <span style={{ color: '#c9e21b' }}>ACID</span>
            <span style={{ color: '#ffd60a' }}>REFLUX</span>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 40,
              fontWeight: 700,
              marginTop: 28,
              color: '#f4f4ef',
            }}
          >
            Spicy Indian takes. Burning hot-takes.
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 36,
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                padding: '12px 26px',
                borderRadius: 999,
                background: '#f0391e',
                color: '#fff',
                fontSize: 26,
                fontWeight: 800,
              }}
            >
              Record · Mix · Publish
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

