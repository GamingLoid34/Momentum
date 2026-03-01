"use client";

import { FormEvent, useMemo, useState } from "react";
import { InstallPwaButton } from "@/components/pwa/InstallPwaButton";
import {
  SplitTaskStep,
  WorkTask,
  WorkTaskStatus,
  useMomentum,
} from "@/context/MomentumContext";

type PendingAction =
  | "idle"
  | "auth"
  | "creating"
  | "movingTask"
  | "splitting"
  | "savingSplit"
  | "vision";

const KANBAN_COLUMNS: Array<{
  status: WorkTaskStatus;
  title: string;
  accentClass: string;
}> = [
  {
    status: "todo",
    title: "Att göra",
    accentClass: "text-sky-300 border-sky-700/40 bg-sky-900/20",
  },
  {
    status: "in_progress",
    title: "Pågående",
    accentClass: "text-amber-300 border-amber-700/40 bg-amber-900/20",
  },
  {
    status: "done",
    title: "Klart",
    accentClass: "text-emerald-300 border-emerald-700/40 bg-emerald-900/20",
  },
];

function formatDate(isoDate: string | null) {
  if (!isoDate) {
    return "—";
  }

  const date = new Date(isoDate);
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

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
    workTasks,
    tasks,
    loading,
    supabaseReady,
    emailAuthEnabled,
    error,
    visionFeedback,
    momentumScore,
    flowByHour,
    sendMagicLink,
    signOut,
    createTask,
    updateWorkTaskStatus,
    splitTaskWithAI,
    saveSplitTask,
    toggleTaskCompletion,
    removeTask,
    analyzeWithVisionMode,
    clearError,
  } = useMomentum();

  const [authEmail, setAuthEmail] = useState("");
  const [manualTask, setManualTask] = useState("");
  const [aiTask, setAiTask] = useState("");
  const [visionGoal, setVisionGoal] = useState("");
  const [visionFile, setVisionFile] = useState<File | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>("idle");
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<{
    taskTitle: string;
    steps: SplitTaskStep[];
  } | null>(null);

  const maxFlowValue = useMemo(() => {
    const highest = Math.max(...flowByHour, 0);
    return highest > 0 ? highest : 1;
  }, [flowByHour]);

  const completedCount = useMemo(
    () => tasks.filter((task) => task.status === "done").length,
    [tasks]
  );

  const tasksByStatus = useMemo<Record<WorkTaskStatus, WorkTask[]>>(() => {
    const buckets: Record<WorkTaskStatus, WorkTask[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };

    workTasks.forEach((task) => {
      buckets[task.status].push(task);
    });

    return buckets;
  }, [workTasks]);

  async function handleSendMagicLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalMessage(null);
    setPendingAction("auth");
    try {
      await sendMagicLink(authEmail);
      setLocalMessage(
        "Magic link skickad. Öppna mejlet och klicka på länken för att logga in."
      );
    } catch (authError) {
      setLocalMessage(
        authError instanceof Error ? authError.message : "Kunde inte skicka login-länk."
      );
    } finally {
      setPendingAction("idle");
    }
  }

  async function handleCreateTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalMessage(null);
    setPendingAction("creating");
    try {
      await createTask(manualTask);
      setManualTask("");
      setLocalMessage("Uppgift skapad med ett första mikro-steg.");
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
      const steps = await splitTaskWithAI(aiTask);
      setAiPreview({
        taskTitle: aiTask.trim(),
        steps,
      });
      setLocalMessage(
        "AI-förslag klart. Granska stegen och spara när du är nöjd."
      );
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

  async function handleSaveSplit() {
    if (!aiPreview) {
      return;
    }

    setLocalMessage(null);
    setPendingAction("savingSplit");
    try {
      await saveSplitTask(aiPreview.taskTitle, aiPreview.steps);
      setAiTask("");
      setAiPreview(null);
      setLocalMessage("AI-stegen sparades till din planering.");
    } catch (saveError) {
      setLocalMessage(
        saveError instanceof Error
          ? saveError.message
          : "Kunde inte spara AI-stegen."
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

  async function handleMoveWorkTask(taskId: string, status: WorkTaskStatus) {
    setLocalMessage(null);
    setPendingAction("movingTask");
    try {
      await updateWorkTaskStatus(taskId, status);
      setLocalMessage("Uppgiftens kolumn uppdaterades.");
    } catch (moveError) {
      setLocalMessage(
        moveError instanceof Error
          ? moveError.message
          : "Kunde inte flytta uppgiften."
      );
    } finally {
      setPendingAction("idle");
    }
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-lg shadow-black/20">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300">
            Momentum + Koll
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-100">
            Logga in med e-post
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            Vi kör magic link utan lösenord. Du får en länk via mejl och kommer
            direkt in i appen.
          </p>
          <InstallPwaButton />
        </header>

        {!supabaseReady && (
          <section className="rounded-2xl border border-amber-600/30 bg-amber-900/20 p-4 text-sm text-amber-100">
            Supabase är inte konfigurerat ännu. Lägg in värden i{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5">
              .env.local
            </code>{" "}
            enligt{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5">
              .env.example
            </code>
            .
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

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
          <h2 className="text-lg font-medium text-zinc-100">
            Fortsätt med e-post
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {emailAuthEnabled
              ? "Skriv in din e-post så skickar vi en säker inloggningslänk."
              : "E-postinloggning är inte aktiverad ännu."}
          </p>

          <form onSubmit={handleSendMagicLink} className="mt-4 space-y-3">
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="du@foretag.se"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-violet-500"
              required
            />
            <button
              type="submit"
              disabled={pendingAction !== "idle"}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === "auth"
                ? "Skickar länk..."
                : "Skicka magic link"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-lg shadow-black/20">
        <p className="text-xs uppercase tracking-[0.2em] text-violet-300">
          Momentum + Koll
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-100">
          Planera och gör jobbet i samma app
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-zinc-400">
          Planera uppgifter med tydliga deadlines och bryt sedan ner dem till
          mikro-steg med AI. Spara först efter granskning.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <InstallPwaButton />
          <button
            type="button"
            onClick={() => {
              void signOut().catch((signOutError) =>
                setLocalMessage(
                  signOutError instanceof Error
                    ? signOutError.message
                    : "Kunde inte logga ut."
                )
              );
            }}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            Logga ut
          </button>
        </div>
      </header>

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

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-zinc-100">
            Koll-board (Kanban)
          </h2>
          <p className="text-xs text-zinc-400">
            Totala uppgifter: {workTasks.length}
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {KANBAN_COLUMNS.map((column) => (
            <article
              key={column.status}
              className={`rounded-xl border p-3 ${column.accentClass}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{column.title}</h3>
                <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-zinc-100">
                  {tasksByStatus[column.status].length}
                </span>
              </div>

              {tasksByStatus[column.status].length === 0 ? (
                <p className="text-xs text-zinc-300/80">Inga uppgifter här.</p>
              ) : (
                <ul className="space-y-2">
                  {tasksByStatus[column.status].map((task) => {
                    const progressPct =
                      task.subtaskTotal > 0
                        ? Math.round(
                            (task.subtaskCompleted / task.subtaskTotal) * 100
                          )
                        : 0;

                    return (
                      <li
                        key={task.id}
                        className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3 text-zinc-100"
                      >
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          Deadline: {formatDate(task.deadline)}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Delsteg klara: {task.subtaskCompleted}/{task.subtaskTotal}
                        </p>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
                          <div
                            className="h-full rounded bg-violet-500"
                            style={{ width: `${Math.min(100, progressPct)}%` }}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {task.status !== "todo" && (
                            <button
                              type="button"
                              disabled={pendingAction !== "idle"}
                              onClick={() => {
                                void handleMoveWorkTask(task.id, "todo");
                              }}
                              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Till att göra
                            </button>
                          )}
                          {task.status !== "in_progress" && (
                            <button
                              type="button"
                              disabled={pendingAction !== "idle"}
                              onClick={() => {
                                void handleMoveWorkTask(task.id, "in_progress");
                              }}
                              className="rounded-md border border-amber-400/40 px-2 py-1 text-xs text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Till pågående
                            </button>
                          )}
                          {task.status !== "done" && (
                            <button
                              type="button"
                              disabled={pendingAction !== "idle"}
                              onClick={() => {
                                void handleMoveWorkTask(task.id, "done");
                              }}
                              className="rounded-md border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Markera klar
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h2 className="text-lg font-medium text-zinc-100">
              Snabbstart: skapa uppgift
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Vi skapar en huvuduppgift och ett första delsteg direkt.
            </p>
            <form onSubmit={handleCreateTask} className="mt-4 space-y-3">
              <input
                value={manualTask}
                onChange={(e) => setManualTask(e.target.value)}
                placeholder="Ex: Förbered veckans kundmöte"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-violet-500"
                maxLength={140}
                required
              />
              <button
                type="submit"
                disabled={pendingAction !== "idle"}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "creating" ? "Skapar..." : "Skapa uppgift"}
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h2 className="text-lg font-medium text-zinc-100">
              AI Task Splitting
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              AI föreslår steg, men du bestämmer när de ska sparas.
            </p>
            <form onSubmit={handleSplitTask} className="mt-4 space-y-3">
              <textarea
                value={aiTask}
                onChange={(e) => setAiTask(e.target.value)}
                placeholder='Ex: "Planera och genomför teammöte för nästa sprint"'
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
                  ? "Tar fram förslag..."
                  : "Generera AI-steg"}
              </button>
            </form>

            {aiPreview && (
              <div className="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
                <p className="text-sm font-semibold text-emerald-200">
                  Förslag för: {aiPreview.taskTitle}
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-emerald-100/90">
                  {aiPreview.steps.map((step, index) => (
                    <li key={`${step.title}-${index}`}>
                      {step.title} ({step.minutes} min)
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveSplit();
                    }}
                    disabled={pendingAction !== "idle"}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "savingSplit"
                      ? "Sparar..."
                      : "Spara i planeringen"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiPreview(null)}
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
                  >
                    Förkasta förslag
                  </button>
                </div>
              </div>
            )}
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
                <dd className="truncate text-zinc-400">
                  {user.email ?? user.id ?? "Ingen"}
                </dd>
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
        <h2 className="text-lg font-medium text-zinc-100">
          Dina mikro-uppgifter
        </h2>
        {tasks.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            Inga steg ännu. Skapa en uppgift eller använd AI Task Splitting.
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
                      toggleTaskCompletion(
                        task.id,
                        task.parentTaskId,
                        e.target.checked
                      ).catch((err) =>
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
                    <span className="mb-1 block truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
                      {task.parentTaskTitle}
                    </span>
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
                    removeTask(task.id, task.parentTaskId).catch((err) =>
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
