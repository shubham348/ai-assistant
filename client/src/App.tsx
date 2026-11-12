
import { useEffect, useState } from "react";
import "./App.scss";

import Header from "./components/Header/Header";
import Welcome from "./components/Welcome/Welcome";
import ChatWindow from "./components/ChatWindow/ChatWindow";
import MessageComposer from "./components/MessageComposer/MessageComposer";
import ConversationSidebar, {
  type Conversation,
} from "./components/ConversationSidebar/ConversationSidebar";

import type { ChatMessageData } from "./components/ChatMessage/ChatMessage";

const API_URL = "http://localhost:3000";

function createMessageId(): string {
  return crypto.randomUUID();
}

function App() {
  const [message, setMessage] = useState("Connecting to backend...");
  const [error, setError] = useState("");

  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null);

  const [isSending, setIsSending] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] =
    useState(false);

  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  // Load all conversations from SQLite.
  async function loadConversations() {
    setIsLoadingConversations(true);

    try {
      const response = await fetch(`${API_URL}/api/conversations`);

      if (!response.ok) {
        throw new Error("Failed to load conversations");
      }

      const data = await response.json();

      setConversations(data.conversations);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load conversations"
      );
    } finally {
      setIsLoadingConversations(false);
    }
  }

  // Check backend and load saved conversations.
  useEffect(() => {
    async function initializeApp() {
      try {
        const response = await fetch(`${API_URL}/api/health`);

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        setMessage(data.message);

        await loadConversations();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong"
        );
      }
    }

    initializeApp();
  }, []);

  function handleNewChat() {
    if (isSending) return;

    setActiveConversationId(null);
    setMessages([]);
    setError("");
  }

  async function handleSelectConversation(id: string) {
    if (isSending) return;

    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/conversations/${id}`
      );

      if (!response.ok) {
        throw new Error("Failed to open conversation");
      }

      const data = await response.json();

      const loadedMessages: ChatMessageData[] = data.messages.map(
        (item: {
          id: string;
          role: "user" | "assistant";
          content: string;
        }) => ({
          id: item.id,
          role: item.role,
          content: item.content,
          status: "complete",
        })
      );

      setActiveConversationId(data.conversation.id);
      setMessages(loadedMessages);
      setSelectedModel(data.conversation.model);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to open conversation"
      );
    }
  }

  async function handleDeleteConversation(id: string) {
    if (isSending) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this conversation?"
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_URL}/api/conversations/${id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to delete conversation");
      }

      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== id)
      );

      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete conversation"
      );
    }
  }

  async function handleSend(
    userMessage: string,
    model: string
  ): Promise<void> {
    setError("");

    const controller = new AbortController();
    setAbortController(controller);

    const userId = createMessageId();
    const assistantId = createMessageId();

    setMessages((previous) => [
      ...previous,
      {
        id: userId,
        role: "user",
        content: userMessage,
        status: "complete",
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        status: "streaming",
      },
    ]);

    setIsSending(true);

    try {
      let conversationId = activeConversationId;

      if (!conversationId) {
        const createResponse = await fetch(
          `${API_URL}/api/conversations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              title: userMessage.slice(0, 60),
            }),
            signal: controller.signal,
          }
        );

        if (!createResponse.ok) {
          const data = await createResponse.json().catch(() => null);
          throw new Error(data?.error || "Failed to create conversation");
        }

        const created = await createResponse.json();

        conversationId = created.id;
        setActiveConversationId(conversationId);
        setSelectedModel(created.model);
      }

      const response = await fetch(`${API_URL}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
           Accept: "text/event-stream",
        },
        body: JSON.stringify({
          conversationId,
          messages: [
            {
              role: "user",
              content: userMessage.trim(),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to get an AI response");
      }

      const contentType = response.headers.get("content-type");

      if (!contentType?.includes("text/event-stream")) {
        throw new Error("The server did not return an SSE response");
      }

      if (!response.body) {
        throw new Error("The browser did not receive a response stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let assistantContent = "";
      let receivedDone = false;

      function processSseEvent(eventBlock: string) {
        let eventType = "message";
        const dataLines: string[] = [];

        for (const line of eventBlock.split(/\r?\n/)) {
          if (line.startsWith(":")) continue;

          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        if (dataLines.length === 0) return;

        const payload = JSON.parse(dataLines.join("\n"));

        if (eventType === "token") {
          if (typeof payload.content !== "string") {
            throw new Error("Invalid token event received from the server");
          }

          assistantContent += payload.content;

          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    content: item.content + payload.content,
                  }
                : item
            )
          );
        } else if (eventType === "done") {
          if (payload.completed !== true) {
            throw new Error(
              "The server did not confirm successful completion"
            );
          }

          receivedDone = true;
        } else if (eventType === "error") {
          throw new Error(
            payload.message || "The AI response could not be completed"
          );
        }
      }

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split(/\r?\n\r?\n/);

        buffer = events.pop() ?? "";

        for (const eventBlock of events) {
          if (eventBlock.trim()) {
            processSseEvent(eventBlock);
          }
        }
      }

      // Flush any remaining bytes from the decoder.
      buffer += decoder.decode();

      // Process a final event if one remains.
      if (buffer.trim()) {
        processSseEvent(buffer);
      }

      // A closed connection without a done event is incomplete.
      if (!receivedDone) {
        throw new Error(
          "The AI stream ended unexpectedly before completion."
        );
      }

      if (!assistantContent.trim()) {
        throw new Error(
          "The AI returned an empty response. Please try again."
        );
      }

      setMessages((previous) =>
        previous.map((item) =>
          item.id === assistantId
            ? { ...item, status: "complete" }
            : item
        )
      );

      await loadConversations();
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

      await loadConversations();
    } finally {
      setAbortController(null);
      setIsSending(false);
    }
  }

  return (
    <main className="app">
      <Header connectionMessage={message} error={error} />

      <div className="app-body">
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          isLoading={isLoadingConversations}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
        />

        <section className="workspace">
          {messages.length === 0 && <Welcome />}

          <ChatWindow
            messages={messages}
            isSending={isSending}
          />

          <MessageComposer
            isSending={isSending}
            onSend={handleSend}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onStop={() => abortController?.abort()}
          />

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>

      <footer className="footer">
        Built with React, TypeScript and Ollama
      </footer>
    </main>
  );
}

export default App;
