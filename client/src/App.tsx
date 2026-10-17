
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

    setMessages((previous) => [
      ...previous,
      { role: "user", content: userMessage },
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to get an AI response");
      }

      const assistantReply =
        typeof data.reply === "string"
          ? data.reply
          : typeof data.message === "string"
            ? data.message
            : null;

      if (!assistantReply) {
        throw new Error("The backend returned an unexpected response format");
      }

      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: assistantReply },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
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
