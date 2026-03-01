import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="rounded-full border border-zinc-700 bg-zinc-900/70 px-4 py-1 text-xs uppercase tracking-[0.18em] text-violet-300">
        Offline-läge
      </p>
      <h1 className="text-3xl font-semibold text-zinc-100">Du är offline just nu</h1>
      <p className="max-w-xl text-sm text-zinc-400">
        Momentum försöker ansluta igen automatiskt. När internet är tillbaka kan du
        fortsätta med AI Task Splitting och Vision Mode.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
      >
        Försök igen
      </Link>
    </main>
  );
}
