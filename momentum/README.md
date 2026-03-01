# Momentum

Momentum är en AI-driven produktivitetsapp byggd för att sänka tröskeln till handling:

- **AI Task Splitting** med Gemini
- **Vision Mode** (bildanalys för "var börjar jag?")
- **Dynamisk momentum-graf**
- **Realtidssynk med Supabase Auth + Postgres**

## Tech stack

- Next.js 16 (App Router)
- TypeScript + Tailwind CSS
- Supabase (`@supabase/supabase-js`) för auth + datalager
- Gemini 1.5 Flash via server-side API routes

## 1) Lokalt: starta projektet

```bash
cd momentum
npm install
cp .env.example .env.local
```

Fyll sedan i `.env.local`.

## 2) Miljövariabler

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
GEMINI_API_KEY=your-gemini-api-key
```

### Säkerhet

- `NEXT_PUBLIC_SUPABASE_*` är publika klientnycklar och måste skyddas med RLS policies.
- `GEMINI_API_KEY` är hemlig och får aldrig ha `NEXT_PUBLIC_` prefix.
- AI-anrop går via server-routes:
  - `POST /api/ai/split-task`
  - `POST /api/ai/vision-mode`

## 3) Supabase setup (obligatoriskt)

1. Skapa ett Supabase-projekt.
2. Gå till **Auth → Providers** och aktivera **Anonymous sign-ins**.
3. Gå till **SQL Editor** och kör SQL från `supabase/schema.sql`.
4. Hämta:
   - `Project URL`
   - `anon public key`
   och lägg in i `.env.local`.

## 4) Kör appen

```bash
npm run dev
```

Öppna `http://localhost:3000`.

## 5) PWA-läge (mobilkänsla)

Projektet innehåller:

- Web App Manifest (`src/app/manifest.ts`)
- Service Worker (`public/sw.js`)
- Offline-sida (`/offline`)
- Install-knapp när `beforeinstallprompt` stöds

För installtest:

```bash
npm run build
npm run start
```

Öppna appen via HTTPS-url på mobil och installera från browsern.

## 6) Deploy till Vercel (rekommenderat)

1. Importera repo i Vercel.
2. Sätt **Root Directory** till `momentum/`.
3. Lägg in env vars i Vercel Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
4. Deploy.

## 7) Egendomän (Vercel + Supabase)

1. I Vercel: **Settings → Domains → Add domain**.
2. Lägg DNS-poster enligt Vercels instruktioner hos din domänleverantör.
3. I Supabase: **Auth → URL Configuration**:
   - Site URL = `https://dindoman.se`
   - Lägg även preview/staging-domäner i Redirect URLs vid behov.

## 8) Projektstruktur

- `src/lib/supabase.ts` – klientinitiering för Supabase
- `src/context/MomentumContext.tsx` – auth + realtime tasks + actions
- `src/app/api/ai/split-task/route.ts` – Gemini textanalys
- `src/app/api/ai/vision-mode/route.ts` – Gemini bildanalys
- `supabase/schema.sql` – tabell + RLS policies

## 9) Redo för senare Google Play

1. Stabil webb/PWA-funktion först.
2. Wrapper med **Capacitor** eller **Trusted Web Activity**.
3. Mobile-hardening:
   - säkra API-routes (rate limit + auth checks)
   - strikt server-side hantering av hemliga nycklar
   - telemetry/crash reporting
4. Play Console-krav:
   - privacy policy
   - data safety declaration
   - app signing + release process
