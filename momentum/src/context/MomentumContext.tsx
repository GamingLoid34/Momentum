"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { User } from "@supabase/supabase-js";
import { getSupabaseServices } from "@/lib/supabase";

export type TaskStatus = "todo" | "done";

export type MicroTask = {
  id: string;
  title: string;
  estimatedMinutes: number;
  status: TaskStatus;
  aiMotivation: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type VisionFeedback = {
  firstAction: string;
  microSteps: string[];
  encouragement: string;
};

type SplitTaskStep = {
  title: string;
  minutes: number;
  motivation?: string;
};

type MomentumContextValue = {
  user: User | null;
  tasks: MicroTask[];
  loading: boolean;
  supabaseReady: boolean;
  error: string | null;
  visionFeedback: VisionFeedback | null;
  momentumScore: number;
  flowByHour: number[];
  createTask: (title: string, estimatedMinutes?: number) => Promise<void>;
  splitTaskWithAI: (task: string) => Promise<void>;
  toggleTaskCompletion: (taskId: string, complete: boolean) => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;
  analyzeWithVisionMode: (
    imageDataUrl: string,
    goal?: string
  ) => Promise<VisionFeedback | null>;
  clearError: () => void;
};

type SupabaseMicroTaskRow = {
  id: string;
  user_id: string;
  title: string;
  estimated_minutes: number | null;
  status: TaskStatus | null;
  ai_motivation: string | null;
  created_at: string;
  completed_at: string | null;
};

const DEFAULT_STEP_MINUTES = 10;
const MIN_STEP_MINUTES = 5;
const MAX_STEP_MINUTES = 15;

const MomentumContext = createContext<MomentumContextValue | undefined>(
  undefined
);

function normalizeMinutes(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_STEP_MINUTES;
  }

  return Math.min(
    MAX_STEP_MINUTES,
    Math.max(MIN_STEP_MINUTES, Math.round(value))
  );
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function MomentumProvider({ children }: { children: React.ReactNode }) {
  const services = useMemo(() => getSupabaseServices(), []);
  const { client: supabase, missingConfig } = services;
  const hasSupabaseConfigIssue = missingConfig.length > 0 || !supabase;

  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<MicroTask[]>([]);
  const [loading, setLoading] = useState(!hasSupabaseConfigIssue);
  const [error, setError] = useState<string | null>(
    hasSupabaseConfigIssue
      ? "Supabase är inte korrekt konfigurerat. Kontrollera .env.local och följ README."
      : null
  );
  const [visionFeedback, setVisionFeedback] = useState<VisionFeedback | null>(
    null
  );
  const supabaseReady = !hasSupabaseConfigIssue;

  useEffect(() => {
    if (!supabaseReady || !supabase) {
      return;
    }

    let isSubscribed = true;
    const bootstrapAuth = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!isSubscribed) {
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      const sessionUser = data.session?.user ?? null;
      if (sessionUser) {
        setUser(sessionUser);
        setLoading(true);
        return;
      }

      const { data: anonData, error: anonError } =
        await supabase.auth.signInAnonymously();
      if (!isSubscribed) {
        return;
      }

      if (anonError) {
        setError(
          anonError.message ||
            "Kunde inte logga in anonymt i Supabase. Kontrollera Auth-inställningarna."
        );
        setLoading(false);
        return;
      }

      setUser(anonData.user ?? null);
      setLoading(true);
    };

    void bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setTasks([]);
        setLoading(false);
        return;
      }

      setLoading(true);
    });

    return () => {
      isSubscribed = false;
      subscription.unsubscribe();
    };
  }, [supabase, supabaseReady]);

  useEffect(() => {
    if (!supabaseReady || !supabase || !user) {
      return;
    }

    let isSubscribed = true;
    const fetchTasks = async () => {
      const { data, error: fetchError } = await supabase
        .from("micro_tasks")
        .select(
          "id, user_id, title, estimated_minutes, status, ai_motivation, created_at, completed_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (!isSubscribed) {
        return;
      }

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const nextTasks = (data ?? []).map((task) => {
        const row = task as SupabaseMicroTaskRow;
        return {
          id: row.id,
          title: row.title ?? "Untitled task",
          estimatedMinutes: normalizeMinutes(row.estimated_minutes ?? 10),
          status: row.status === "done" ? "done" : "todo",
          aiMotivation: row.ai_motivation,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        } satisfies MicroTask;
      });

      setTasks(nextTasks);
      setLoading(false);
    };

    void fetchTasks();

    const channel = supabase
      .channel(`micro-tasks-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "micro_tasks",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchTasks();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setError("Realtime-anslutning till Supabase misslyckades.");
        }
      });

    return () => {
      isSubscribed = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, supabaseReady, user]);

  const guardOperational = useCallback(() => {
    if (!supabaseReady || !supabase || !user) {
      throw new Error(
        "Momentum är inte redo ännu. Vänta tills Supabase-synken är igång."
      );
    }

    return {
      supabase,
      userId: user.id,
    };
  }, [supabase, supabaseReady, user]);

  const createTask = useCallback(
    async (title: string, estimatedMinutes = DEFAULT_STEP_MINUTES) => {
      const sanitizedTitle = title.trim();
      if (!sanitizedTitle) {
        throw new Error("Task title cannot be empty.");
      }

      const { supabase: activeSupabase, userId } = guardOperational();
      const { error: insertError } = await activeSupabase
        .from("micro_tasks")
        .insert({
          user_id: userId,
          title: sanitizedTitle,
          estimated_minutes: normalizeMinutes(estimatedMinutes),
          status: "todo",
          ai_motivation: null,
        });

      if (insertError) {
        throw new Error(insertError.message);
      }
    },
    [guardOperational]
  );

  const splitTaskWithAI = useCallback(
    async (task: string) => {
      const { supabase: activeSupabase, userId } = guardOperational();
      const taskTitle = task.trim();

      if (taskTitle.length < 3) {
        throw new Error("Beskriv uppgiften med minst 3 tecken.");
      }

      const response = await fetch("/api/ai/split-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task: taskTitle,
          preferredStepMinutes: DEFAULT_STEP_MINUTES,
        }),
      });

      const payload = (await response.json()) as {
        steps?: SplitTaskStep[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "AI Task Splitting misslyckades.");
      }

      const steps = payload.steps ?? [];
      if (steps.length === 0) {
        throw new Error("AI returnerade inga steg.");
      }

      const rows = steps.map((step) => ({
        user_id: userId,
        title: step.title.trim(),
        estimated_minutes: normalizeMinutes(step.minutes),
        status: "todo",
        ai_motivation: step.motivation?.trim() ?? null,
      }));

      const { error: insertError } = await activeSupabase
        .from("micro_tasks")
        .insert(rows);
      if (insertError) {
        throw new Error(insertError.message);
      }
    },
    [guardOperational]
  );

  const toggleTaskCompletion = useCallback(
    async (taskId: string, complete: boolean) => {
      const { supabase: activeSupabase, userId } = guardOperational();
      const { error: updateError } = await activeSupabase
        .from("micro_tasks")
        .update({
          status: complete ? "done" : "todo",
          completed_at: complete ? new Date().toISOString() : null,
        })
        .eq("id", taskId)
        .eq("user_id", userId);

      if (updateError) {
        throw new Error(updateError.message);
      }
    },
    [guardOperational]
  );

  const removeTask = useCallback(
    async (taskId: string) => {
      const { supabase: activeSupabase, userId } = guardOperational();
      const { error: deleteError } = await activeSupabase
        .from("micro_tasks")
        .delete()
        .eq("id", taskId)
        .eq("user_id", userId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    },
    [guardOperational]
  );

  const analyzeWithVisionMode = useCallback(
    async (imageDataUrl: string, goal?: string) => {
      guardOperational();

      const response = await fetch("/api/ai/vision-mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageDataUrl, goal }),
      });

      const payload = (await response.json()) as {
        result?: VisionFeedback;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Vision Mode misslyckades.");
      }

      if (!payload.result) {
        throw new Error("Vision Mode returnerade inget resultat.");
      }

      setVisionFeedback(payload.result);
      return payload.result;
    },
    [guardOperational]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const momentumScore = useMemo(() => {
    const now = new Date();
    return tasks.reduce((score, task) => {
      if (!task.completedAt) {
        return score;
      }

      const completedAtDate = new Date(task.completedAt);
      return isSameDay(now, completedAtDate) ? score + 1 : score;
    }, 0);
  }, [tasks]);

  const flowByHour = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => 0);
    tasks.forEach((task) => {
      if (!task.completedAt) {
        return;
      }

      const hour = new Date(task.completedAt).getHours();
      buckets[hour] += 1;
    });
    return buckets;
  }, [tasks]);

  const value = useMemo<MomentumContextValue>(
    () => ({
      user,
      tasks,
      loading,
      supabaseReady,
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
    }),
    [
      analyzeWithVisionMode,
      clearError,
      createTask,
      error,
      flowByHour,
      loading,
      momentumScore,
      removeTask,
      splitTaskWithAI,
      supabaseReady,
      tasks,
      toggleTaskCompletion,
      user,
      visionFeedback,
    ]
  );

  return (
    <MomentumContext.Provider value={value}>{children}</MomentumContext.Provider>
  );
}

export function useMomentum() {
  const ctx = useContext(MomentumContext);
  if (!ctx) {
    throw new Error("useMomentum must be used within MomentumProvider.");
  }

  return ctx;
}
