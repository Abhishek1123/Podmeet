import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default async function AppleIcon() {
  let logoSrc = '';
  try {
    const logo = await readFile(
      path.join(process.cwd(), 'public', 'images', 'acidreflux-logo.jpg')
    );
    logoSrc = `data:image/jpeg;base64,${logo.toString('base64')}`;
  } catch (e) {
    console.warn('Could not load logo for apple-icon:', e);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#070707',
          borderRadius: '40px',
          overflow: 'hidden',
          border: '6px solid #c9e21b',
        }}
      >
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            width={180}
            height={180}
            alt="AcidReflux"
            style={{
              objectFit: 'cover',
              objectPosition: '50% 35%',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 72,
              fontWeight: 900,
              color: '#c9e21b',
            }}
          >
            AR
          </div>
        )}
      </div>
    ),
    {
      ...size,
    }
  );
}

