"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { User, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseServices } from "@/firebase";

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
  firebaseReady: boolean;
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

type FirestoreMicroTask = {
  title?: string;
  estimatedMinutes?: number;
  status?: TaskStatus;
  aiMotivation?: string;
  createdAt?: Timestamp;
  completedAt?: Timestamp | null;
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

  return Math.min(MAX_STEP_MINUTES, Math.max(MIN_STEP_MINUTES, Math.round(value)));
}

function timestampToIso(value?: Timestamp | null) {
  if (!value) {
    return null;
  }

  return value.toDate().toISOString();
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function MomentumProvider({ children }: { children: React.ReactNode }) {
  const services = useMemo(() => getFirebaseServices(), []);
  const { auth, db, missingConfig } = services;
  const hasFirebaseConfigIssue = missingConfig.length > 0 || !auth || !db;

  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<MicroTask[]>([]);
  const [loading, setLoading] = useState(!hasFirebaseConfigIssue);
  const [error, setError] = useState<string | null>(
    hasFirebaseConfigIssue
      ? "Firebase är inte korrekt konfigurerat. Kontrollera .env.local och följ README."
      : null
  );
  const [visionFeedback, setVisionFeedback] = useState<VisionFeedback | null>(
    null
  );
  const firebaseReady = !hasFirebaseConfigIssue;

  useEffect(() => {
    if (!firebaseReady || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (!authUser) {
        setTasks([]);
        setLoading(false);
        return;
      }

      setLoading(true);
    });

    if (!auth.currentUser) {
      signInAnonymously(auth).catch((authError) => {
        setError(
          authError instanceof Error
            ? authError.message
            : "Kunde inte logga in anonymt i Firebase."
        );
      });
    }

    return unsubscribe;
  }, [auth, firebaseReady]);

  useEffect(() => {
    if (!firebaseReady || !db || !user) {
      return;
    }

    const tasksRef = collection(db, "users", user.uid, "microTasks");
    const tasksQuery = query(tasksRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        const nextTasks = snapshot.docs.map((taskDoc) => {
          const data = taskDoc.data() as FirestoreMicroTask;

          return {
            id: taskDoc.id,
            title: data.title ?? "Untitled task",
            estimatedMinutes: normalizeMinutes(data.estimatedMinutes),
            status: data.status === "done" ? "done" : "todo",
            aiMotivation: data.aiMotivation ?? null,
            createdAt:
              timestampToIso(data.createdAt) ?? new Date().toISOString(),
            completedAt: timestampToIso(data.completedAt),
          } satisfies MicroTask;
        });

        setTasks(nextTasks);
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [db, firebaseReady, user]);

  const guardOperational = useCallback(() => {
    if (!firebaseReady || !db || !user) {
      throw new Error(
        "Momentum är inte redo ännu. Vänta tills Firebase-synken är igång."
      );
    }

    return {
      db,
      uid: user.uid,
    };
  }, [db, firebaseReady, user]);

  const createTask = useCallback(
    async (title: string, estimatedMinutes = DEFAULT_STEP_MINUTES) => {
      const sanitizedTitle = title.trim();
      if (!sanitizedTitle) {
        throw new Error("Task title cannot be empty.");
      }

      const { db: activeDb, uid } = guardOperational();
      await addDoc(collection(activeDb, "users", uid, "microTasks"), {
        title: sanitizedTitle,
        estimatedMinutes: normalizeMinutes(estimatedMinutes),
        status: "todo",
        aiMotivation: null,
        createdAt: serverTimestamp(),
        completedAt: null,
      });
    },
    [guardOperational]
  );

  const splitTaskWithAI = useCallback(
    async (task: string) => {
      const { db: activeDb, uid } = guardOperational();
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

      const batch = writeBatch(activeDb);
      const userTasksCollection = collection(activeDb, "users", uid, "microTasks");

      steps.forEach((step) => {
        const taskRef = doc(userTasksCollection);
        batch.set(taskRef, {
          title: step.title.trim(),
          estimatedMinutes: normalizeMinutes(step.minutes),
          status: "todo",
          aiMotivation: step.motivation?.trim() ?? null,
          createdAt: serverTimestamp(),
          completedAt: null,
        });
      });

      await batch.commit();
    },
    [guardOperational]
  );

  const toggleTaskCompletion = useCallback(
    async (taskId: string, complete: boolean) => {
      const { db: activeDb, uid } = guardOperational();
      await updateDoc(doc(activeDb, "users", uid, "microTasks", taskId), {
        status: complete ? "done" : "todo",
        completedAt: complete ? serverTimestamp() : null,
      });
    },
    [guardOperational]
  );

  const removeTask = useCallback(
    async (taskId: string) => {
      const { db: activeDb, uid } = guardOperational();
      await deleteDoc(doc(activeDb, "users", uid, "microTasks", taskId));
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
    }),
    [
      analyzeWithVisionMode,
      clearError,
      createTask,
      error,
      firebaseReady,
      flowByHour,
      loading,
      momentumScore,
      removeTask,
      splitTaskWithAI,
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
