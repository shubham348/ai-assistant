
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
