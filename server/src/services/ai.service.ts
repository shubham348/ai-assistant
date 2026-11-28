
import { AI_CONFIG } from "../config/ai.config";

const OLLAMA_URL = "http://localhost:11434";
const REQUEST_TIMEOUT_MS = 30_000;
const STREAM_INACTIVITY_TIMEOUT_MS = 45_000;
const GEMINI_MAX_RETRIES = 2;
const GEMINI_RETRY_BASE_DELAY_MS = 1_000;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Generation was cancelled");
  }
}

function createRequestSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  return signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;
}

async function readWithTimeout<T>(
  read: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  throwIfAborted(signal);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Stream inactive for ${STREAM_INACTIVITY_TIMEOUT_MS / 1000} seconds`
        )
      );
    }, STREAM_INACTIVITY_TIMEOUT_MS);

    if (signal) {
      abortListener = () => {
        reject(new Error("Generation was cancelled"));
      };

      signal.addEventListener("abort", abortListener, {
        once: true,
      });
    }
  });

  try {
    return await Promise.race([read(), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (signal && abortListener) {
      signal.removeEventListener("abort", abortListener);
    }
  }
}

function createRetryDelay(
  delayMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    function onAbort() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Generation was cancelled"));
    }

    signal?.addEventListener("abort", onAbort, {
      once: true,
    });
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

function getRetryDelay(attempt: number): number {
  return GEMINI_RETRY_BASE_DELAY_MS * 2 ** attempt;
}

function throwProviderError(
  provider: string,
  status: number,
  details: string
): never {
  throw new Error(`${provider} returned HTTP ${status}: ${details}`);
}

// ---------------------------------------------
// Basic Ollama functions
// ---------------------------------------------

export async function createAssistantReply(
  message: string
): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "deepseek-r1:8b",
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const reply = data.message?.content;

  if (typeof reply !== "string") {
    throw new Error("Ollama returned an invalid response");
  }

  return reply;
}

export async function checkOllama(): Promise<unknown> {
  const response = await fetch(`${OLLAMA_URL}/api/tags`);

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }

  return response.json();
}

// ---------------------------------------------
// Model configuration
// ---------------------------------------------

export type ConfiguredModel = {
  id: string;
  provider: string;
  model: string;
};

export function getConfiguredModels() {
  const models = (process.env.AI_MODELS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");

      if (separatorIndex === -1) {
        throw new Error(`Invalid model configuration: ${entry}`);
      }

      const provider = entry.slice(0, separatorIndex);
      const model = entry.slice(separatorIndex + 1);

      if (!provider || !model) {
        throw new Error(`Invalid model configuration: ${entry}`);
      }

      return {
        id: entry,
        provider,
        model,
      };
    });

  const uniqueModels = [
    ...new Map(models.map((item) => [item.id, item])).values(),
  ];

  if (uniqueModels.length === 0) {
    throw new Error("AI_MODELS is not configured");
  }

  const defaultModel =
    process.env.AI_DEFAULT_MODEL?.trim() || uniqueModels[0].id;

  if (!uniqueModels.some((item) => item.id === defaultModel)) {
    throw new Error("AI_DEFAULT_MODEL is not in AI_MODELS");
  }

  return {
    models: uniqueModels,
    defaultModel,
  };
}

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

// ---------------------------------------------
// SSE parsing utilities
// ---------------------------------------------

function extractSSEData(event: string): string | null {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  return data || null;
}

function parseSSEJSON(data: string): any {
  try {
    return JSON.parse(data);
  } catch {
    throw new Error("Provider returned malformed streaming data");
  }
}


async function* streamGeminiReply(
  messages: ConversationMessage[],
  model: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const geminiModel = model.replace(/^gemini:/, "");

  let response: Response | undefined;

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    throwIfAborted(signal);

    const requestSignal = createRequestSignal(
      signal,
      REQUEST_TIMEOUT_MS
    );

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: messages.map((message) => ({
              role: message.role === "assistant" ? "model" : "user",
              parts: [{ text: message.content }],
            })),
            generationConfig: {
              maxOutputTokens: AI_CONFIG.context.numPredict,
            },
          }),
          signal: requestSignal,
        }
      );
    } catch (error) {
      if (signal?.aborted) {
        throw new Error("Gemini request was cancelled");
      }

      if (attempt === GEMINI_MAX_RETRIES) {
        throw new Error(
          "Gemini could not be reached or the request timed out."
        );
      }

      const delay = getRetryDelay(attempt);

      console.warn(
        `Gemini request failed. Retrying in ${delay}ms (${attempt + 1}/${GEMINI_MAX_RETRIES}).`
      );

      await createRetryDelay(delay, signal);
      continue;
    }

    if (response.ok) {
      break;
    }

    const retryable = isRetryableStatus(response.status);

    if (!retryable || attempt === GEMINI_MAX_RETRIES) {
      const details = await response.text();

      throwProviderError("Gemini", response.status, details);
    }

    const delay = getRetryDelay(attempt);

    console.warn(
      `Gemini returned HTTP ${response.status}. Retrying in ${delay}ms (${attempt + 1}/${GEMINI_MAX_RETRIES}).`
    );

    await response.body?.cancel().catch(() => undefined);

    await createRetryDelay(delay, signal);
  }

  if (!response?.ok) {
    throw new Error("Gemini request failed");
  }

  if (!response.body) {
    throw new Error("Gemini returned an empty response stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await readWithTimeout(
        () => reader.read(),
        signal
      );

      buffer += decoder.decode(value, { stream: !done });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        const data = extractSSEData(event);

        if (!data || data === "[DONE]") continue;

        const chunk = parseSSEJSON(data);

        if (chunk.error) {
          throw new Error(
            chunk.error.message || "Gemini streaming failed"
          );
        }

        const candidate = chunk.candidates?.[0];

        if (candidate?.finishReason === "SAFETY") {
          throw new Error(
            "Gemini stopped generating because of a safety restriction."
          );
        }

        const parts = candidate?.content?.parts ?? [];

        for (const part of parts) {
          if (typeof part.text === "string" && part.text.length > 0) {
            yield part.text;
          }
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      const data = extractSSEData(buffer);

      if (data && data !== "[DONE]") {
        const chunk = parseSSEJSON(data);

        if (chunk.error) {
          throw new Error(
            chunk.error.message || "Gemini streaming failed"
          );
        }

        const parts =
          chunk.candidates?.[0]?.content?.parts ?? [];

        for (const part of parts) {
          if (typeof part.text === "string" && part.text.length > 0) {
            yield part.text;
          }
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Gemini generation was cancelled");
    }

    throw error;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

// ---------------------------------------------
// Groq
// ---------------------------------------------

async function* streamGroqReply(
  messages: ConversationMessage[],
  model: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const groqModel = model.replace(/^groq:/, "");

  const requestSignal = createRequestSignal(
    signal,
    REQUEST_TIMEOUT_MS
  );

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: groqModel,
        messages,
        stream: true,
        max_tokens: AI_CONFIG.context.numPredict,
      }),
      signal: requestSignal,
    }
  );

  if (!response.ok) {
    const details = await response.text();

    throwProviderError("Groq", response.status, details);
  }

  if (!response.body) {
    throw new Error("Groq returned an empty response stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function processEvent(event: string): string[] {
    const data = extractSSEData(event);
    if (!data || data === "[DONE]") return [];

    const chunk = parseSSEJSON(data);

    if (chunk.error) {
      throw new Error(
        chunk.error.message || "Groq generation failed"
      );
    }

    const content = chunk.choices?.[0]?.delta?.content;

    return typeof content === "string" && content.length > 0
      ? [content]
      : [];
  }

  try {
    while (true) {
      const { value, done } = await readWithTimeout(
        () => reader.read(),
        signal
      );

      buffer += decoder.decode(value, { stream: !done });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const text of processEvent(event)) {
          yield text;
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      for (const text of processEvent(buffer)) {
        yield text;
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Groq generation was cancelled");
    }

    throw error;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

// ---------------------------------------------
// Ollama
// ---------------------------------------------

async function* streamOllamaReply(
  messages: ConversationMessage[],
  model: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const requestSignal = createRequestSignal(
    signal,
    REQUEST_TIMEOUT_MS
  );

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: {
        num_ctx: AI_CONFIG.context.numCtx,
        num_predict: AI_CONFIG.context.numPredict,
      },
    }),
    signal: requestSignal,
  });

  if (!response.ok) {
    const errorDetails = await response.text();

    throwProviderError("Ollama", response.status, errorDetails);
  }

  if (!response.body) {
    throw new Error("Ollama returned an empty response stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  function processLine(line: string): string[] {
    if (!line.trim()) return [];

    const chunk = parseSSEJSON(line);

    if (chunk.error) {
      throw new Error(
        typeof chunk.error === "string"
          ? chunk.error
          : chunk.error.message || "Ollama generation failed"
      );
    }

    const content = chunk.message?.content;

    if (chunk.done) {
      receivedDone = true;
    }

    return typeof content === "string" && content.length > 0
      ? [content]
      : [];
  }

  try {
    while (true) {
      const { value, done } = await readWithTimeout(
        () => reader.read(),
        signal
      );

      buffer += decoder.decode(value, { stream: !done });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        for (const text of processLine(line)) {
          yield text;
        }

        if (receivedDone) return;
      }

      if (done) break;
    }

    if (buffer.trim()) {
      for (const text of processLine(buffer)) {
        yield text;
      }
    }

    if (!receivedDone) {
      throw new Error(
        "Ollama stream ended before generation completed"
      );
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Ollama generation was cancelled");
    }

    throw error;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

// ---------------------------------------------
// Provider dispatch
// ---------------------------------------------

export async function* streamAssistantReply(
  messages: ConversationMessage[],
  model: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  throwIfAborted(signal);

  if (model.startsWith("gemini:")) {
    yield* streamGeminiReply(messages, model, signal);
    return;
  }

  if (model.startsWith("ollama:")) {
    const ollamaModel = model.slice("ollama:".length);

    yield* streamOllamaReply(messages, ollamaModel, signal);
    return;
  }

  if (model.startsWith("groq:")) {
    yield* streamGroqReply(messages, model, signal);
    return;
  }

  throw new Error(`Unsupported AI provider: ${model}`);
}
