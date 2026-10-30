import '../styles/globals.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import { Anton, Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/AuthContext';

const display = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});
const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000');

const TITLE = 'AcidReflux Podcast | Spicy Indian Takes, Burning Hot-Takes';
const DESCRIPTION =
  'AcidReflux is the podcast with spicy Indian takes and burning hot-takes. Record multi-track episodes in the same room or remotely, then mix and export in the built-in studio editor.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s | AcidReflux Podcast',
  },
  description: DESCRIPTION,
  applicationName: 'AcidReflux Podcast',
  keywords: [
    'AcidReflux',
    'podcast',
    'Indian podcast',
    'hot takes',
    'podcast studio',
    'multi-track recorder',
  ],
  openGraph: {
    type: 'website',
    siteName: 'AcidReflux Podcast',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AcidReflux',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/images/acidreflux-logo.jpg', type: 'image/jpeg' },
    ],
    apple: '/images/acidreflux-logo.jpg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#070707',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${display.variable} ${body.variable}`}>
      <body className="bg-[#070707] text-zinc-100 antialiased font-sans selection:bg-acid-400 selection:text-black">
        <AuthProvider>
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: '#121210',
                color: '#f4f4ef',
                border: '1px solid rgba(201,226,27,0.35)',
                borderRadius: '14px',
                fontSize: '13px',
              },
              success: { iconTheme: { primary: '#c9e21b', secondary: '#070707' } },
              error: { iconTheme: { primary: '#f0391e', secondary: '#fff' } },
            }}
          />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}