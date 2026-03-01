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

## 3) Supabase setup (obligatoriskt, steg-för-steg)

Gör detta i Supabase Dashboard:

1. Skapa ett Supabase-projekt.
2. Gå till **Connect** och kopiera:
   - `Project URL`
   - `anon public key`
3. Klistra in värdena i `.env.local`.
4. Gå till **SQL Editor** och kör hela filen `supabase/schema.sql`.
5. Gå till **Auth → Sign In / Providers**:
   - aktivera **Email**
   - aktivera **Magic Link** (passwordless)
6. Gå till **Auth → URL Configuration**:
   - sätt **Site URL** till din utvecklingsurl (t.ex. `http://localhost:3000`)
   - lägg till samma url i **Redirect URLs**

Efter detta kommer första inloggade användaren automatiskt få ett eget team via `ensure_user_bootstrap`.

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

## 6) Deploy till Vercel (rekommenderat, steg-för-steg)

Gör detta i Vercel:

1. **New Project** → importera GitHub-repot.
2. Sätt **Root Directory** till `momentum/`.
3. Lägg in Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
4. Deploya.

När deployment är klar: öppna app-url och testa login via magic link.

## 7) Egendomän (Vercel + Supabase, steg-för-steg)

1. I Vercel: **Project → Settings → Domains → Add**.
2. Lägg de DNS-poster som Vercel visar hos din domänleverantör.
3. Vänta tills domänen är verifierad och HTTPS är aktiv.
4. Gå till Supabase: **Auth → URL Configuration**:
   - Site URL = `https://dindoman.se`
   - Redirect URLs:
     - `https://dindoman.se`
     - `https://www.dindoman.se` (om du använder www)
     - ev. `https://<din-vercel-preview>.vercel.app` för testmiljö
5. Testa login igen via e-postlänk på den riktiga domänen.

## 8) Vad som är implementerat i appen nu

- E-postinloggning via Supabase Magic Link
- Automatisk bootstrap av team/profile i Supabase (`ensure_user_bootstrap`)
- Gemensam schema-bas för Koll + Momentum (`teams`, `profiles`, `tasks`, `subtasks`, m.m.)
- AI Task Splitting i två steg:
  1. generera förslag
  2. användaren bekräftar innan steg sparas
## 9) Projektstruktur

- `src/lib/supabase.ts` – klientinitiering för Supabase
- `src/context/MomentumContext.tsx` – email auth + realtime tasks + actions
- `src/app/api/ai/split-task/route.ts` – Gemini textanalys
- `src/app/api/ai/vision-mode/route.ts` – Gemini bildanalys
- `supabase/schema.sql` – teammodell + tabeller + RLS + bootstrap-funktion
## 10) Redo för senare Google Play

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

## Felsökning

### "stack depth limit exceeded" efter inloggning

Orsak: RLS-recursion i äldre SQL-version.

Lösning:

1. Öppna Supabase → SQL Editor.
2. Kör filen:

   `supabase/fixes/2026-03-01-stack-depth-hotfix.sql`

3. Ladda om appen.
