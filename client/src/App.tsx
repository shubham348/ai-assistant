
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
