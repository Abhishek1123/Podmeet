# 🎙️ Podmeet — Studio-Quality Podcast Recording with Friends

**Podmeet** is a modern, full-stack web application inspired by Riverside.fm and Zencastr that lets you record multi-track, studio-quality remote podcasts with friends directly in your browser.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, **WebRTC Multi-Peer Mesh**, **Web Audio API**, and **Google Firebase (Authentication, Cloud Firestore & Cloud Storage)**, and ready for **Vercel** deployment.

---

## ✨ Key Features

- **🔐 Google Sign-In, Email Auth & 1-Click Guest Links**:
  - Hosts can sign in with Google or Email/Password to create and manage podcast episodes.
  - Friends can join via a shareable `/rooms/[roomName]` invite link using instant **Guest Access** without needing to install anything.
- **🎧 Local Multi-Track HD Recording (Riverside-Style)**:
  - Each participant's browser records their raw, uncompressed local audio/video stream directly on their device (`MediaRecorder` + Web Audio API), eliminating WebRTC network glitches from the final recording.
  - **Synchronized Master Record Button**: When the Host presses **Record Episode**, recording starts and stops across all connected friends simultaneously via Firestore real-time state sync.
  - **16-Bit Lossless PCM `.wav` & HD `.webm` Export**: Download isolated per-participant video tracks or convert any track in-browser to an uncompressed 16-bit 48kHz `.wav` stem for your DAW (Logic Pro, Audition, Reaper, Descript).
- **📹 Real-Time WebRTC Studio & Green Room**:
  - **Green Room Check**: Preview camera framing, select microphone/camera hardware, and test live microphone input levels before entering the studio.
  - **Live Studio**: Multi-party WebRTC audio/video call, screen sharing, real-time frequency waveform visualizers on every participant card, timestamped chapter markers, show notes, and a built-in synthesized **Podcast Soundboard** (Intro Chime, Rimshot, Transition Swoosh, Dramatic Boom, etc.).

---

## 🚀 Getting Started Locally

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env.local` (already pre-configured with the `podmeet-app-studio` Firebase project):
   ```bash
   cp .env.example .env.local
   ```

3. **Start the development server**:
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deploying to Vercel

1. Push your changes to GitHub (`https://github.com/Abhishek1123/Podmeet.git`).
2. Import the `Abhishek1123/Podmeet` repository in [Vercel](https://vercel.com/new).
3. Add the `NEXT_PUBLIC_FIREBASE_*` environment variables from `.env.example` (also configured as defaults in `lib/firebase.ts`).
4. Click **Deploy**! Next.js App Router will build and deploy automatically.
5. *(Important for Google Sign-In on Vercel)*: Once deployed, add your Vercel domain (e.g. `podmeet.vercel.app`) to **Firebase Console → Authentication → Settings → Authorized domains**.
