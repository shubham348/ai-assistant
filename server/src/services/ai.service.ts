
const OLLAMA_URL = "http://localhost:11434";

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


export function getConfiguredModels() {
  const models = (process.env.OLLAMA_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  const uniqueModels = [...new Set(models)];

  if (uniqueModels.length === 0) {
    throw new Error("OLLAMA_MODELS is not configured");
  }

  const configuredDefault =
    process.env.OLLAMA_DEFAULT_MODEL?.trim();

  const defaultModel =
    configuredDefault && uniqueModels.includes(configuredDefault)
      ? configuredDefault
      : uniqueModels[0];

  return {
    models: uniqueModels,
    defaultModel,
  };
}


export async function* streamAssistantReply(
  message: string,
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
      messages: [{ role: "user", content: message }],
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Ollama returned an empty response stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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

        if (chunk.done) return;
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
    }
  } finally {
    reader.releaseLock();
  }
}
