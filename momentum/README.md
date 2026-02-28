# Momentum

Momentum är en AI-driven produktivitetsapp byggd för att sänka tröskeln till handling:

- **AI Task Splitting** med Gemini
- **Vision Mode** (bildanalys för "var börjar jag?")
- **Dynamisk momentum-graf**
- **Realtidssynk med Firebase Auth + Firestore**

## Tech stack

- Next.js 16 (App Router)
- TypeScript + Tailwind CSS
- Firebase Web SDK (Auth, Firestore)
- Gemini 1.5 Flash via server-side API routes

## 1) Kom igång lokalt

```bash
cd momentum
npm install
cp .env.example .env.local
```

Fyll sedan i `.env.local`.

## 2) Säker nyckelhantering

### Firebase-nycklar (`NEXT_PUBLIC_FIREBASE_*`)

De här värdena är klientkonfig, inte "hemliga lösenord". De kan ligga i frontend, **men**:

1. Aktivera endast de Firebase-tjänster du behöver.
2. Lås ner Firestore Rules.
3. Lås ner Auth-flöden (inga osäkra providers).
4. Lägg domänbegränsningar/refererbegränsningar där det stöds.

### Gemini-nyckel (`GEMINI_API_KEY`)

Denna är **hemlig** och får aldrig exponeras i klienten:

- Lägg den endast i servermiljö (`.env.local`, Vercel project env, etc.)
- Prefixa aldrig med `NEXT_PUBLIC_`
- Anrop sker via:
  - `POST /api/ai/split-task`
  - `POST /api/ai/vision-mode`

## 3) Firebase setup (rekommenderad)

1. Skapa Firebase-projekt.
2. Aktivera **Authentication** (för bootstrap används anonym inloggning).
3. Aktivera **Cloud Firestore**.
4. Lägg in web-appens konfig i `.env.local`.

Exempel på minimala Firestore rules för denna struktur:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/microTasks/{taskId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 4) Starta appen

```bash
npm run dev
```

Öppna `http://localhost:3000`.

## 5) Projektstruktur

- `src/firebase/index.ts` – robust Firebase-initiering
- `src/context/MomentumContext.tsx` – realtime state + actions
- `src/app/api/ai/split-task/route.ts` – Gemini textanalys
- `src/app/api/ai/vision-mode/route.ts` – Gemini bildanalys
- `src/components/momentum/MomentumDashboard.tsx` – UI bootstrap

## 6) Redo för senare Google Play

För publicering via Google Play senare rekommenderas:

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
