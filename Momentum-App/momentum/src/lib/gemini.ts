const GEMINI_MODEL = "gemini-1.5-flash";

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

type GeminiJsonRequest = {
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
  model?: string;
};

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY server environment variable.");
  }

  return apiKey;
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Gemini returned an empty response.");
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return objectMatch[0];
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    return arrayMatch[0];
  }

  return trimmed;
}

export async function requestGeminiJson<T>({
  prompt,
  imageBase64,
  imageMimeType = "image/jpeg",
  model = GEMINI_MODEL,
}: GeminiJsonRequest): Promise<T> {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts: GeminiPart[] = [{ text: prompt }];
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: imageMimeType,
        data: imageBase64,
      },
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned no text output.");
  }

  const jsonText = extractJsonPayload(text);
  return JSON.parse(jsonText) as T;
}
