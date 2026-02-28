"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMomentum } from "@/context/MomentumContext";

type PendingAction = "idle" | "creating" | "splitting" | "vision";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("Could not read selected file."));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function MomentumDashboard() {
  const {
    user,
    tasks,
    loading,
    firebaseReady,
    error,
    visionFeedback,
    momentumScore,
    flowByHour,
    createTask,
    splitTaskWithAI,
    toggleTaskCompletion,
    removeTask,
    analyzeWithVisionMode,
    clearError,
  } = useMomentum();

  const [manualTask, setManualTask] = useState("");
  const [aiTask, setAiTask] = useState("");
  const [visionGoal, setVisionGoal] = useState("");
  const [visionFile, setVisionFile] = useState<File | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>("idle");
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const maxFlowValue = useMemo(() => {
    const highest = Math.max(...flowByHour, 0);
    return highest > 0 ? highest : 1;
  }, [flowByHour]);

  const completedCount = useMemo(
    () => tasks.filter((task) => task.status === "done").length,
    [tasks]
  );

  async function handleCreateTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalMessage(null);
    setPendingAction("creating");
    try {
      await createTask(manualTask);
      setManualTask("");
      setLocalMessage("Mikro-uppgift skapad.");
    } catch (createError) {
      setLocalMessage(
        createError instanceof Error
          ? createError.message
          : "Kunde inte skapa uppgift."
      );
    } finally {
      setPendingAction("idle");
    }
  }

  async function handleSplitTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalMessage(null);
    setPendingAction("splitting");
    try {
      await splitTaskWithAI(aiTask);
      setAiTask("");
      setLocalMessage("AI bröt ner uppgiften till mikro-steg.");
    } catch (splitError) {
      setLocalMessage(
        splitError instanceof Error
          ? splitError.message
          : "Kunde inte dela upp uppgiften."
      );
    } finally {
      setPendingAction("idle");
    }
  }

  async function handleVisionMode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!visionFile) {
      setLocalMessage("Välj en bild först.");
      return;
    }

    setLocalMessage(null);
    setPendingAction("vision");
    try {
      const imageDataUrl = await readFileAsDataUrl(visionFile);
      await analyzeWithVisionMode(imageDataUrl, visionGoal);
      setLocalMessage("Vision Mode analyserade bilden.");
    } catch (visionError) {
      setLocalMessage(
        visionError instanceof Error
          ? visionError.message
          : "Vision Mode misslyckades."
      );
    } finally {
      setPendingAction("idle");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-lg shadow-black/20">
        <p className="text-xs uppercase tracking-[0.2em] text-violet-300">
          Momentum
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-100">
          Din AI-coach mot prokrastinering
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-zinc-400">
          Bryt ned motståndet med mikro-steg, AI-analys och realtidssynk. Målet
          är enkelt: börja med minsta möjliga steg och bygg momentum därifrån.
        </p>
      </header>

      {!firebaseReady && (
        <section className="rounded-2xl border border-amber-600/30 bg-amber-900/20 p-4 text-sm text-amber-100">
          Firebase är inte konfigurerat ännu. Lägg in värden i{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5">.env.local</code>{" "}
          enligt <code className="rounded bg-black/40 px-1.5 py-0.5">.env.example</code>.
        </section>
      )}

      {error && (
        <section className="flex items-start justify-between gap-4 rounded-2xl border border-rose-600/30 bg-rose-900/20 p-4 text-sm text-rose-100">
          <p>{error}</p>
          <button
            type="button"
            onClick={clearError}
            className="rounded-lg border border-rose-300/20 px-3 py-1 text-xs hover:bg-rose-500/20"
          >
            Stäng
          </button>
        </section>
      )}

      {localMessage && (
        <section className="rounded-2xl border border-violet-500/30 bg-violet-900/20 p-3 text-sm text-violet-100">
          {localMessage}
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h2 className="text-lg font-medium text-zinc-100">
              Snabbstart: skapa en mikro-uppgift
            </h2>
            <form onSubmit={handleCreateTask} className="mt-4 space-y-3">
              <input
                value={manualTask}
                onChange={(e) => setManualTask(e.target.value)}
                placeholder="Ex: Öppna rapporten och skriv rubriken"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-violet-500"
                maxLength={140}
                required
              />
              <button
                type="submit"
                disabled={pendingAction !== "idle"}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "creating" ? "Skapar..." : "Lägg till steg"}
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h2 className="text-lg font-medium text-zinc-100">AI Task Splitting</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Skriv in en överväldigande uppgift så bryter AI ner den i hanterbara
              5-15 minuterssteg.
            </p>
            <form onSubmit={handleSplitTask} className="mt-4 space-y-3">
              <textarea
                value={aiTask}
                onChange={(e) => setAiTask(e.target.value)}
                placeholder='Ex: "Skriv klart rapporten om Q1-resultat"'
                className="min-h-24 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-violet-500"
                maxLength={200}
                required
              />
              <button
                type="submit"
                disabled={pendingAction !== "idle"}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "splitting"
                  ? "Bryter ner..."
                  : "Bryt ned till mikro-steg"}
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h2 className="text-lg font-medium text-zinc-100">Vision Mode</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Ladda upp en bild av din miljö så föreslår AI var du ska börja.
            </p>
            <form onSubmit={handleVisionMode} className="mt-4 space-y-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setVisionFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-zinc-200 hover:file:bg-zinc-700"
              />
              <input
                value={visionGoal}
                onChange={(e) => setVisionGoal(e.target.value)}
                placeholder="Valfritt mål, ex: Rensa skrivbordet för 30 min fokus"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-violet-500"
                maxLength={140}
              />
              <button
                type="submit"
                disabled={pendingAction !== "idle"}
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "vision" ? "Analyserar..." : "Analysera bild"}
              </button>
            </form>
            {visionFeedback && (
              <div className="mt-4 space-y-3 rounded-xl border border-sky-700/40 bg-sky-900/20 p-4 text-sm">
                <p>
                  <span className="font-semibold text-sky-200">Börja här:</span>{" "}
                  {visionFeedback.firstAction}
                </p>
                <ul className="list-inside list-disc space-y-1 text-sky-100/90">
                  {visionFeedback.microSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
                <p className="text-sky-200">{visionFeedback.encouragement}</p>
              </div>
            )}
          </article>
        </div>

        <aside className="space-y-6">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h2 className="text-base font-medium text-zinc-100">Momentum-graf</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Klara steg idag:{" "}
              <span className="font-semibold text-violet-300">{momentumScore}</span>
            </p>
            <div className="mt-4 flex h-24 items-end gap-1.5">
              {flowByHour.map((value, hour) => {
                const height = `${Math.max(8, (value / maxFlowValue) * 100)}%`;
                return (
                  <div
                    key={hour}
                    title={`Kl ${hour.toString().padStart(2, "0")}:00 — ${value} klara`}
                    className="flex-1 rounded-t bg-violet-500/70 transition hover:bg-violet-400"
                    style={{ height }}
                  />
                );
              })}
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h2 className="text-base font-medium text-zinc-100">Status</h2>
            <dl className="mt-3 space-y-2 text-sm text-zinc-300">
              <div className="flex justify-between">
                <dt>Aktiv användare</dt>
                <dd className="truncate text-zinc-400">{user?.uid ?? "Ingen"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Totala steg</dt>
                <dd>{tasks.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Klara steg</dt>
                <dd>{completedCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Laddar</dt>
                <dd>{loading ? "Ja" : "Nej"}</dd>
              </div>
            </dl>
          </article>
        </aside>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
        <h2 className="text-lg font-medium text-zinc-100">Dina mikro-uppgifter</h2>
        {tasks.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            Inga uppgifter ännu. Lägg till ett steg eller använd AI Task Splitting.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    onChange={(e) =>
                      toggleTaskCompletion(task.id, e.target.checked).catch((err) =>
                        setLocalMessage(
                          err instanceof Error
                            ? err.message
                            : "Kunde inte uppdatera uppgiften."
                        )
                      )
                    }
                    className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-violet-500"
                  />
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-sm ${
                        task.status === "done"
                          ? "text-zinc-500 line-through"
                          : "text-zinc-100"
                      }`}
                    >
                      {task.title}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {task.estimatedMinutes} min
                    </span>
                    {task.aiMotivation && (
                      <span className="mt-1 block text-xs text-violet-200/80">
                        {task.aiMotivation}
                      </span>
                    )}
                  </span>
                </label>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  onClick={() =>
                    removeTask(task.id).catch((err) =>
                      setLocalMessage(
                        err instanceof Error
                          ? err.message
                          : "Kunde inte radera uppgiften."
                      )
                    )
                  }
                >
                  Ta bort
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
