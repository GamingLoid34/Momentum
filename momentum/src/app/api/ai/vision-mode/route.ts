import { NextResponse } from "next/server";
import { requestGeminiJson } from "@/lib/gemini";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

type VisionModeRequest = {
  imageDataUrl?: string;
  goal?: string;
};

type VisionModeResponse = {
  result?: {
    firstAction: string;
    microSteps: string[];
    encouragement: string;
  };
  error?: string;
};

const IMAGE_DATA_URL_REGEX = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/;
const MAX_BASE64_SIZE = 7_500_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

function sanitizeMicroSteps(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((step) => (typeof step === "string" ? step.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
}

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateLimit = enforceRateLimit(
      `vision-mode:${clientIp}`,
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_WINDOW_MS
    );
    if (!rateLimit.allowed) {
      return NextResponse.json<VisionModeResponse>(
        {
          error: "Too many requests. Please wait a few minutes and try again.",
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": Math.ceil(
              rateLimit.resetAt / 1000
            ).toString(),
          },
        }
      );
    }

    const body = (await req.json()) as VisionModeRequest;
    const rawImage = body.imageDataUrl?.trim() ?? "";
    const goal = body.goal?.trim();

    const match = rawImage.match(IMAGE_DATA_URL_REGEX);
    if (!match) {
      return NextResponse.json<VisionModeResponse>(
        {
          error: "Invalid image format. Provide a base64 data URL.",
        },
        { status: 400 }
      );
    }

    const mimeType = match[1];
    const imageBase64 = match[2];
    if (imageBase64.length > MAX_BASE64_SIZE) {
      return NextResponse.json<VisionModeResponse>(
        {
          error: "Image is too large. Please upload a smaller photo.",
        },
        { status: 400 }
      );
    }

    const prompt = `
You are Momentum Vision Mode.
Analyze the photo of a potentially messy workspace and identify the easiest first action.

GOAL CONTEXT:
${goal && goal.length > 0 ? goal : "No explicit goal provided."}

RULES:
- Be practical and specific.
- Focus on reducing activation energy.
- Reply in Swedish.

Return strict JSON with exactly this shape:
{
  "firstAction": "one short imperative sentence",
  "microSteps": ["step 1", "step 2", "step 3"],
  "encouragement": "short motivational sentence"
}
`;

    const aiPayload = await requestGeminiJson<{
      firstAction?: string;
      microSteps?: unknown;
      encouragement?: string;
    }>({
      prompt,
      imageBase64,
      imageMimeType: mimeType,
    });

    const firstAction = aiPayload.firstAction?.trim() ?? "";
    const encouragement = aiPayload.encouragement?.trim() ?? "";
    const microSteps = sanitizeMicroSteps(aiPayload.microSteps);

    if (!firstAction || microSteps.length === 0 || !encouragement) {
      return NextResponse.json<VisionModeResponse>(
        {
          error: "Vision analysis was incomplete. Please try another photo.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json<VisionModeResponse>(
      {
        result: {
          firstAction,
          microSteps,
          encouragement,
        },
      },
      {
        headers: {
          "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Reset": Math.ceil(rateLimit.resetAt / 1000).toString(),
        },
      }
    );
  } catch (error) {
    console.error("[vision-mode]", error);
    return NextResponse.json<VisionModeResponse>(
      {
        error: "Vision Mode is temporarily unavailable.",
      },
      { status: 500 }
    );
  }
}
