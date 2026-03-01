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
export type WorkTaskStatus = "todo" | "in_progress" | "done";

export type WorkTask = {
  id: string;
  title: string;
  description: string;
  status: WorkTaskStatus;
  source: string;
  startDate: string | null;
  deadline: string | null;
  completedAt: string | null;
  createdAt: string;
  subtaskTotal: number;
  subtaskCompleted: number;
  mainAssigneeUserId: string | null;
};

export type MicroTask = {
  id: string;
  title: string;
  parentTaskId: string;
  parentTaskTitle: string;
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

export type SplitTaskStep = {
  title: string;
  minutes: number;
  motivation?: string;
};

type MomentumContextValue = {
  user: User | null;
  workTasks: WorkTask[];
  tasks: MicroTask[];
  loading: boolean;
  supabaseReady: boolean;
  emailAuthEnabled: boolean;
  error: string | null;
  visionFeedback: VisionFeedback | null;
  momentumScore: number;
  flowByHour: number[];
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  createTask: (title: string, estimatedMinutes?: number) => Promise<void>;
  updateWorkTaskStatus: (taskId: string, status: WorkTaskStatus) => Promise<void>;
  splitTaskWithAI: (task: string) => Promise<SplitTaskStep[]>;
  saveSplitTask: (taskTitle: string, steps: SplitTaskStep[]) => Promise<void>;
  toggleTaskCompletion: (
    subtaskId: string,
    parentTaskId: string,
    complete: boolean
  ) => Promise<void>;
  removeTask: (subtaskId: string, parentTaskId: string) => Promise<void>;
  analyzeWithVisionMode: (
    imageDataUrl: string,
    goal?: string
  ) => Promise<VisionFeedback | null>;
  clearError: () => void;
};

type SupabaseTaskRow = {
  id: string;
  title: string;
  team_id: string;
  description: string | null;
  status: WorkTaskStatus | null;
  source: string | null;
  start_date: string | null;
  deadline: string | null;
  completed_at: string | null;
  created_at: string;
};

type SupabaseSubtaskRow = {
  id: string;
  task_id: string;
  title: string;
  estimated_minutes: number | null;
  is_completed: boolean | null;
  ai_motivation: string | null;
  created_at: string;
  completed_at: string | null;
};

type SupabaseMainAssigneeRow = {
  task_id: string;
  user_id: string;
  is_main: boolean;
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
  const supabaseReady = !hasSupabaseConfigIssue;
  const emailAuthEnabled = true;

  const [user, setUser] = useState<User | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [workTasks, setWorkTasks] = useState<WorkTask[]>([]);
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
      setUser(sessionUser);

      if (!sessionUser) {
        setTeamId(null);
        setWorkTasks([]);
        setTasks([]);
        setLoading(false);
      } else {
        setLoading(true);
      }
    };

    void bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        setTeamId(null);
        setWorkTasks([]);
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
    const bootstrapTeam = async () => {
      setLoading(true);

      const preferredDisplayName = user.email?.split("@")[0] ?? null;
      const { data, error: bootstrapError } = await supabase.rpc(
        "ensure_user_bootstrap",
        {
          input_display_name: preferredDisplayName,
        }
      );

      if (!isSubscribed) {
        return;
      }

      if (bootstrapError) {
        setError(bootstrapError.message);
        setLoading(false);
        return;
      }

      if (!data || typeof data !== "string") {
        setError(
          "Kunde inte hitta team för användaren. Kontrollera Supabase SQL-setup."
        );
        setLoading(false);
        return;
      }

      setTeamId(data);
    };

    void bootstrapTeam();

    return () => {
      isSubscribed = false;
    };
  }, [supabase, supabaseReady, user]);

  useEffect(() => {
    if (!supabaseReady || !supabase || !teamId) {
      return;
    }

    let isSubscribed = true;

    const fetchTasks = async () => {
      const { data: taskRows, error: taskError } = await supabase
        .from("tasks")
        .select(
          "id, title, team_id, description, status, source, start_date, deadline, completed_at, created_at"
        )
        .eq("team_id", teamId)
        .order("created_at", { ascending: true });

      if (!isSubscribed) {
        return;
      }

      if (taskError) {
        setError(taskError.message);
        setLoading(false);
        return;
      }

      const typedTaskRows = (taskRows ?? []) as SupabaseTaskRow[];
      if (typedTaskRows.length === 0) {
        setWorkTasks([]);
        setTasks([]);
        setLoading(false);
        return;
      }

      const taskIds = typedTaskRows.map((taskRow) => taskRow.id);
      const taskNameById = new Map(typedTaskRows.map((row) => [row.id, row.title]));

      const { data: assigneeRows, error: assigneeError } = await supabase
        .from("task_assignees")
        .select("task_id, user_id, is_main")
        .in("task_id", taskIds)
        .eq("is_main", true);

      if (!isSubscribed) {
        return;
      }

      if (assigneeError) {
        setError(assigneeError.message);
        setLoading(false);
        return;
      }

      const mainAssigneeByTaskId = new Map(
        ((assigneeRows ?? []) as SupabaseMainAssigneeRow[]).map((row) => [
          row.task_id,
          row.user_id,
        ])
      );

      const { data: subtaskRows, error: subtaskError } = await supabase
        .from("subtasks")
        .select(
          "id, task_id, title, estimated_minutes, is_completed, ai_motivation, created_at, completed_at"
        )
        .in("task_id", taskIds)
        .order("created_at", { ascending: true });

      if (!isSubscribed) {
        return;
      }

      if (subtaskError) {
        setError(subtaskError.message);
        setLoading(false);
        return;
      }

      const subtaskStatsByTaskId = new Map<
        string,
        {
          total: number;
          completed: number;
        }
      >();

      ((subtaskRows ?? []) as SupabaseSubtaskRow[]).forEach((row) => {
        const existing = subtaskStatsByTaskId.get(row.task_id) ?? {
          total: 0,
          completed: 0,
        };
        existing.total += 1;
        if (row.is_completed) {
          existing.completed += 1;
        }
        subtaskStatsByTaskId.set(row.task_id, existing);
      });

      const nextWorkTasks = typedTaskRows.map(
        (row) =>
          ({
            id: row.id,
            title: row.title ?? "Uppgift utan rubrik",
            description: row.description ?? "",
            status: row.status ?? "todo",
            source: row.source ?? "app",
            startDate: row.start_date,
            deadline: row.deadline,
            completedAt: row.completed_at,
            createdAt: row.created_at,
            subtaskTotal: subtaskStatsByTaskId.get(row.id)?.total ?? 0,
            subtaskCompleted:
              subtaskStatsByTaskId.get(row.id)?.completed ?? 0,
            mainAssigneeUserId: mainAssigneeByTaskId.get(row.id) ?? null,
          }) satisfies WorkTask
      );

      const nextTasks = ((subtaskRows ?? []) as SupabaseSubtaskRow[]).map(
        (row) =>
          ({
            id: row.id,
            title: row.title ?? "Untitled step",
            parentTaskId: row.task_id,
            parentTaskTitle:
              taskNameById.get(row.task_id) ?? "Uppgift utan rubrik",
            estimatedMinutes: normalizeMinutes(row.estimated_minutes ?? 10),
            status: row.is_completed ? "done" : "todo",
            aiMotivation: row.ai_motivation,
            createdAt: row.created_at,
            completedAt: row.completed_at,
          }) satisfies MicroTask
      );

      setWorkTasks(nextWorkTasks);
      setTasks(nextTasks);
      setLoading(false);
    };

    void fetchTasks();

    const channel = supabase
      .channel(`team-${teamId}-tasks`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          void fetchTasks();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subtasks",
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
  }, [supabase, supabaseReady, teamId]);

  const guardOperational = useCallback(() => {
    if (!supabaseReady || !supabase || !user || !teamId) {
      throw new Error(
        "Momentum är inte redo ännu. Vänta tills Supabase-synken är igång."
      );
    }

    return {
      supabase,
      userId: user.id,
      teamId,
    };
  }, [supabase, supabaseReady, teamId, user]);

  const syncParentTaskStatus = useCallback(
    async (parentTaskId: string) => {
      const { supabase: activeSupabase } = guardOperational();
      const { data: childRows, error: childError } = await activeSupabase
        .from("subtasks")
        .select("id, is_completed")
        .eq("task_id", parentTaskId);

      if (childError) {
        throw new Error(childError.message);
      }

      const rows = childRows ?? [];
      if (rows.length === 0) {
        return;
      }

      const completedCount = rows.filter((row) => row.is_completed).length;
      const allDone = completedCount === rows.length;
      const anyDone = completedCount > 0;

      const { error: updateTaskError } = await activeSupabase
        .from("tasks")
        .update({
          status: allDone ? "done" : anyDone ? "in_progress" : "todo",
          completed_at: allDone ? new Date().toISOString() : null,
        })
        .eq("id", parentTaskId);

      if (updateTaskError) {
        throw new Error(updateTaskError.message);
      }
    },
    [guardOperational]
  );

  const sendMagicLink = useCallback(
    async (email: string) => {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        throw new Error("Ange en giltig e-postadress.");
      }

      if (!supabaseReady || !supabase) {
        throw new Error("Supabase är inte redo ännu.");
      }

      const emailRedirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo },
      });

      if (otpError) {
        throw new Error(otpError.message);
      }
    },
    [supabase, supabaseReady]
  );

  const signOut = useCallback(async () => {
    if (!supabaseReady || !supabase) {
      return;
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      throw new Error(signOutError.message);
    }

    setWorkTasks([]);
    setTasks([]);
    setTeamId(null);
  }, [supabase, supabaseReady]);

  const updateWorkTaskStatus = useCallback(
    async (taskId: string, status: WorkTaskStatus) => {
      const { supabase: activeSupabase } = guardOperational();

      const { error: updateError } = await activeSupabase
        .from("tasks")
        .update({
          status,
          completed_at: status === "done" ? new Date().toISOString() : null,
        })
        .eq("id", taskId);

      if (updateError) {
        throw new Error(updateError.message);
      }
    },
    [guardOperational]
  );

  const createTask = useCallback(
    async (title: string, estimatedMinutes = DEFAULT_STEP_MINUTES) => {
      const sanitizedTitle = title.trim();
      if (!sanitizedTitle) {
        throw new Error("Task title cannot be empty.");
      }

      const { supabase: activeSupabase, userId, teamId: activeTeamId } =
        guardOperational();

      const { data: createdTask, error: taskInsertError } = await activeSupabase
        .from("tasks")
        .insert({
          team_id: activeTeamId,
          title: sanitizedTitle,
          description: "",
          created_by: userId,
          source: "app",
          status: "todo",
        })
        .select("id")
        .single();

      if (taskInsertError || !createdTask?.id) {
        throw new Error(taskInsertError?.message ?? "Kunde inte skapa uppgift.");
      }

      const parentTaskId = createdTask.id as string;

      const { error: assignError } = await activeSupabase
        .from("task_assignees")
        .insert({
          task_id: parentTaskId,
          user_id: userId,
          is_main: true,
        });
      if (assignError) {
        throw new Error(assignError.message);
      }

      const { error: stepInsertError } = await activeSupabase
        .from("subtasks")
        .insert({
          task_id: parentTaskId,
          title: sanitizedTitle,
          estimated_minutes: normalizeMinutes(estimatedMinutes),
          is_completed: false,
          ai_motivation: null,
          sort_order: 0,
        });
      if (stepInsertError) {
        throw new Error(stepInsertError.message);
      }
    },
    [guardOperational]
  );

  const splitTaskWithAI = useCallback(
    async (task: string) => {
      guardOperational();
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

      return steps.map((step) => ({
        title: step.title.trim(),
        minutes: normalizeMinutes(step.minutes),
        motivation: step.motivation?.trim() ?? undefined,
      }));
    },
    [guardOperational]
  );

  const saveSplitTask = useCallback(
    async (taskTitle: string, steps: SplitTaskStep[]) => {
      const normalizedTitle = taskTitle.trim();
      if (!normalizedTitle) {
        throw new Error("Uppgiften behöver en rubrik.");
      }
      if (steps.length === 0) {
        throw new Error("Det finns inga AI-steg att spara.");
      }

      const { supabase: activeSupabase, userId, teamId: activeTeamId } =
        guardOperational();

      const { data: createdTask, error: taskInsertError } = await activeSupabase
        .from("tasks")
        .insert({
          team_id: activeTeamId,
          title: normalizedTitle,
          description: "",
          created_by: userId,
          source: "ai",
          status: "todo",
        })
        .select("id")
        .single();

      if (taskInsertError || !createdTask?.id) {
        throw new Error(taskInsertError?.message ?? "Kunde inte skapa AI-uppgift.");
      }

      const parentTaskId = createdTask.id as string;

      const { error: assignError } = await activeSupabase
        .from("task_assignees")
        .insert({
          task_id: parentTaskId,
          user_id: userId,
          is_main: true,
        });
      if (assignError) {
        throw new Error(assignError.message);
      }

      const rows = steps.map((step, index) => ({
        task_id: parentTaskId,
        title: step.title.trim(),
        estimated_minutes: normalizeMinutes(step.minutes),
        is_completed: false,
        ai_motivation: step.motivation?.trim() ?? null,
        sort_order: index,
      }));

      const { error: subtasksInsertError } = await activeSupabase
        .from("subtasks")
        .insert(rows);
      if (subtasksInsertError) {
        throw new Error(subtasksInsertError.message);
      }
    },
    [guardOperational]
  );

  const toggleTaskCompletion = useCallback(
    async (subtaskId: string, parentTaskId: string, complete: boolean) => {
      const { supabase: activeSupabase } = guardOperational();
      const { error: updateError } = await activeSupabase
        .from("subtasks")
        .update({
          is_completed: complete,
          completed_at: complete ? new Date().toISOString() : null,
        })
        .eq("id", subtaskId)
        .eq("task_id", parentTaskId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await syncParentTaskStatus(parentTaskId);
    },
    [guardOperational, syncParentTaskStatus]
  );

  const removeTask = useCallback(
    async (subtaskId: string, parentTaskId: string) => {
      const { supabase: activeSupabase } = guardOperational();
      const { error: deleteError } = await activeSupabase
        .from("subtasks")
        .delete()
        .eq("id", subtaskId)
        .eq("task_id", parentTaskId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      const { count, error: countError } = await activeSupabase
        .from("subtasks")
        .select("id", { count: "exact", head: true })
        .eq("task_id", parentTaskId);
      if (countError) {
        throw new Error(countError.message);
      }

      if ((count ?? 0) === 0) {
        const { error: parentDeleteError } = await activeSupabase
          .from("tasks")
          .delete()
          .eq("id", parentTaskId);
        if (parentDeleteError) {
          throw new Error(parentDeleteError.message);
        }
        return;
      }

      await syncParentTaskStatus(parentTaskId);
    },
    [guardOperational, syncParentTaskStatus]
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
    }),
    [
      analyzeWithVisionMode,
      clearError,
      createTask,
      emailAuthEnabled,
      error,
      flowByHour,
      loading,
      momentumScore,
      updateWorkTaskStatus,
      removeTask,
      saveSplitTask,
      sendMagicLink,
      signOut,
      splitTaskWithAI,
      supabaseReady,
      tasks,
      workTasks,
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
