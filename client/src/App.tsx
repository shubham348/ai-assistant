
import { useEffect, useState } from "react";
import "./App.css";

import Header from "./components/Header";
import Welcome from "./components/Welcome";
import ChatWindow from "./components/ChatWindow";
import MessageComposer from "./components/MessageComposer";
import type { ChatMessageData } from "./components/ChatMessage";

function App() {
  const [message, setMessage] = useState("Connecting to backend...");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isSending, setIsSending] = useState(false);

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

async function handleSend(userMessage: string): Promise<void> {
  setError("");

  const assistantMessageIndex = messages.length + 1;

  setMessages((previous) => [
    ...previous,
    { role: "user", content: userMessage },
    { role: "assistant", content: "" },
  ]);

  setIsSending(true);

  try {
    const response = await fetch("http://localhost:3000/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: userMessage }),
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

      setMessages((previous) =>
        previous.map((item, index) =>
          index === assistantMessageIndex
            ? { ...item, content: item.content + chunk }
            : item
        )
      );
    }

    const remaining = decoder.decode();

    if (remaining) {
      setMessages((previous) =>
        previous.map((item, index) =>
          index === assistantMessageIndex
            ? { ...item, content: item.content + remaining }
            : item
        )
      );
    }
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Something went wrong"
    );

    setMessages((previous) =>
      previous.filter(
        (_, index) => index !== assistantMessageIndex
      )
    );
  } finally {
    setIsSending(false);
  }
}

  return (
    <main className="app">
      <Header connectionMessage={message} error={error} />

      <section className="workspace">
        {messages.length === 0 && <Welcome />}

        <ChatWindow messages={messages} isSending={isSending} />

        <MessageComposer
          isSending={isSending}
          onSend={handleSend}
        />

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
