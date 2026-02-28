import { NextResponse } from "next/server";
import { requestGeminiJson } from "@/lib/gemini";

export const runtime = "nodejs";

type SplitTaskRequest = {
  task?: string;
  preferredStepMinutes?: number;
};

type SplitTaskResponse = {
  steps?: Array<{
    title: string;
    minutes: number;
    motivation: string;
  }>;
  error?: string;
};

const MIN_TASK_LENGTH = 3;
const MAX_TASK_LENGTH = 200;

function normalizeMinutes(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 10;
  }

  return Math.min(15, Math.max(5, Math.round(value)));
}

function sanitizeSteps(payload: unknown) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("steps" in payload) ||
    !Array.isArray(payload.steps)
  ) {
    return [];
  }

  return payload.steps
    .map((step) => {
      if (!step || typeof step !== "object") {
        return null;
      }

      const title =
        "title" in step && typeof step.title === "string"
          ? step.title.trim()
          : "";
      const minutes =
        "minutes" in step && typeof step.minutes === "number"
          ? normalizeMinutes(step.minutes)
          : 10;
      const motivation =
        "motivation" in step && typeof step.motivation === "string"
          ? step.motivation.trim()
          : "Bra start - ett steg i taget bygger momentum.";

      if (!title) {
        return null;
      }

      return {
        title,
        minutes,
        motivation,
      };
    })
    .filter(
      (
        step
      ): step is { title: string; minutes: number; motivation: string } =>
        step !== null
    )
    .slice(0, 12);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SplitTaskRequest;
    const task = body.task?.trim() ?? "";
    if (task.length < MIN_TASK_LENGTH || task.length > MAX_TASK_LENGTH) {
      return NextResponse.json<SplitTaskResponse>(
        {
          error: "Task must be between 3 and 200 characters.",
        },
        { status: 400 }
      );
    }

    const preferredStepMinutes = normalizeMinutes(body.preferredStepMinutes);
    const prompt = `
You are Momentum, an AI productivity coach focused on reducing procrastination.
Break this task into concrete, actionable micro-steps.

TASK:
${task}

RULES:
- 5-15 minutes per step (target around ${preferredStepMinutes} minutes).
- Return 4 to 8 steps.
- Each step should start with a clear verb.
- Keep each step concise.
- Write in Swedish.

Output strict JSON with this exact structure and no additional keys:
{
  "steps": [
    {
      "title": "string",
      "minutes": 10,
      "motivation": "short supportive sentence in Swedish"
    }
  ]
}
`;

    const aiPayload = await requestGeminiJson<{
      steps: Array<{
        title: string;
        minutes: number;
        motivation?: string;
      }>;
    }>({ prompt });

    const steps = sanitizeSteps(aiPayload);
    if (steps.length === 0) {
      return NextResponse.json<SplitTaskResponse>(
        {
          error: "AI returned no usable steps.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json<SplitTaskResponse>({ steps });
  } catch (error) {
    console.error("[split-task]", error);
    return NextResponse.json<SplitTaskResponse>(
      {
        error: "Could not generate micro-steps right now. Try again shortly.",
      },
      { status: 500 }
    );
  }
}
