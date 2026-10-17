
import { useEffect, useState } from "react";
import "./App.css";

import Header from "./components/Header";
import Welcome from "./components/Welcome";
import ChatWindow from "./components/ChatWindow";
import MessageComposer from "./components/MessageComposer";
import type { ChatMessageData } from "./components/ChatMessage";

function createMessageId(): string {
  return crypto.randomUUID();
}

function App() {
  const [message, setMessage] = useState("Connecting to backend...");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  useEffect(() => {
    async function checkBackend() {
      try {
        const response = await fetch("http://localhost:3000/api/health");

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        setMessage(data.message);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong"
        );
      }
    }

    checkBackend();
  }, []);


  async function handleSend(userMessage: string, model: string): Promise<void> {
    setError("");
    const controller = new AbortController();
    setAbortController(controller);

    const userId = createMessageId();
    const assistantId = createMessageId();

    setMessages((previous) => [
      ...previous,
      { id: userId, role: "user", content: userMessage, status: "complete" },
      { id: assistantId, role: "assistant", content: "", status: "streaming" },
    ]);

    setIsSending(true);

    try {
      const response = await fetch("http://localhost:3000/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, model: model }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to get an AI response");
      }

      if (!response.body) {
        throw new Error("The browser did not receive a response stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        if (chunk) {
          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantId
                ? { ...item, content: item.content + chunk }
                : item
            )
          );
        }
      }

      const remaining = decoder.decode();

      setMessages((previous) =>
        previous.map((item) =>
          item.id === assistantId
            ? {
              ...item,
              content: item.content + remaining,
              status: "complete",
            }
            : item
        )
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setMessages((previous) =>
          previous.map((item) =>
            item.id === assistantId
              ? { ...item, status: "cancelled" }
              : item
          )
        );
      } else {
        const errorMessage =
          err instanceof Error ? err.message : "Something went wrong";

        setError(errorMessage);

        setMessages((previous) =>
          previous.map((item) =>
            item.id === assistantId
              ? { ...item, status: "error" }
              : item
          )
        );
      }
    } finally {
      setAbortController(null);
      setIsSending(false);
    }
  }


  return (
    <main className="app">
      <Header connectionMessage={message} error={error} />

      <section className="workspace">
        {messages.length === 0 && <Welcome />}

        <ChatWindow messages={messages} isSending={isSending} />

        <MessageComposer isSending={isSending} onSend={handleSend} selectedModel={selectedModel}
          onModelChange={setSelectedModel} />

        {isSending && (
          <button
            type="button"
            onClick={() => abortController?.abort()}
            className="stop-button"
          >
            Stop generating
          </button>
        )}

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}


      </section>

      <footer className="footer">
        Built with React, TypeScript and Ollama
      </footer>
    </main>
  );
}

export default App;
