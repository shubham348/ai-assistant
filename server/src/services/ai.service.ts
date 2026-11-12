
import { AI_CONFIG } from "../config/ai.config";

const OLLAMA_URL = "http://localhost:11434";

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
  const maxRetries = 3;

  let response: Response | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new Error("Gemini request was cancelled");
    }

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
        signal,
      }
    );

    if (response.ok) {
      break;
    }

    const retryable = response.status === 503 || response.status === 429;

    if (!retryable || attempt === maxRetries) {
      const details = await response.text();
      throw new Error(
        `Gemini returned HTTP ${response.status}: ${details}`
      );
    }

    const delay = 1000 * 2 ** attempt;

    console.log(
      `Gemini returned HTTP ${response.status}. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}).`
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, delay);

      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          reject(new Error("Gemini request was cancelled"));
        },
        { once: true }
      );
    });
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

  function* extractText(event: string): Generator<string> {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!data || data === "[DONE]") return;

    const chunk = JSON.parse(data);
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      if (typeof part.text === "string" && part.text.length > 0) {
        yield part.text;
      }
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      buffer += decoder.decode(value, { stream: !done });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const text of extractText(event)) {
          yield text;
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      for (const text of extractText(buffer)) {
        yield text;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

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
      signal,
    }
  );

  if (!response.ok) {
    const details = await response.text();

    throw new Error(
      `Groq returned HTTP ${response.status}: ${details}`
    );
  }

  if (!response.body) {
    throw new Error("Groq returned an empty response stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();

      buffer += decoder.decode(value, { stream: !done });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");

        if (!data || data === "[DONE]") continue;

        const chunk = JSON.parse(data);
        const content = chunk.choices?.[0]?.delta?.content;

        if (typeof content === "string" && content.length > 0) {
          yield content;
        }

        if (chunk.error) {
          throw new Error(chunk.error.message || "Groq generation failed");
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      const data = buffer
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (data && data !== "[DONE]") {
        const chunk = JSON.parse(data);
        const content = chunk.choices?.[0]?.delta?.content;

        if (typeof content === "string" && content.length > 0) {
          yield content;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* streamOllamaReply(
  messages: ConversationMessage[],
  model: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
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
    signal,
  });

  if (!response.ok) {
    const errorDetails = await response.text();

    throw new Error(
      `Ollama returned HTTP ${response.status}: ${errorDetails}`
    );
  }

  if (!response.body) {
    throw new Error("Ollama returned an empty response stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  try {
    while (true) {
      const { value, done } = await reader.read();

      buffer += decoder.decode(value, { stream: !done });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const chunk = JSON.parse(line);
        const content = chunk.message?.content;

        if (typeof content === "string" && content.length > 0) {
          yield content;
        }

        if (chunk.error) {
          throw new Error(chunk.error);
        }

        if (chunk.done) {
          receivedDone = true;
          return;
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      const chunk = JSON.parse(buffer);

      if (chunk.error) {
        throw new Error(chunk.error);
      }

      const content = chunk.message?.content;

      if (typeof content === "string" && content.length > 0) {
        yield content;
      }

      if (chunk.done) {
        receivedDone = true;
      }
    }

    if (!receivedDone) {
      throw new Error(
        "Ollama stream ended before generation completed"
      );
    }
  } finally {
    reader.releaseLock();
  }
}


export async function* streamAssistantReply(
  messages: ConversationMessage[],
  model: string,
  signal?: AbortSignal
): AsyncGenerator<string> {


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
