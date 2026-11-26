import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

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

function getMessageText(message: {
  parts?: Array<{ type: string; text?: string }>;
}): string {
  return (
    message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("") ?? ""
  );
}

function App() {
  const [connectionMessage, setConnectionMessage] = useState(
    "Connecting to backend..."
  );

  const [error, setError] = useState("");

  const [selectedModel, setSelectedModel] = useState("");

  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null);

  const [isLoadingConversations, setIsLoadingConversations] =
    useState(false);

  const conversationIdRef = useRef<string | null>(null);

  const transport = useRef(
    new DefaultChatTransport({
      api: `${API_URL}/message`,

      prepareSendMessagesRequest: ({ messages }) => {
        const lastUserMessage = [...messages]
          .reverse()
          .find((message) => message.role === "user");

        const content = lastUserMessage?.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("")
          .trim();

        return {
          body: {
            conversationId: conversationIdRef.current,
            messages: [
              {
                role: "user",
                content,
              },
            ],
          },
        };
      },
    })
  );

  const {
    messages: sdkMessages,
    sendMessage,
    setMessages,
    stop,
    status,
  } = useChat({
    transport: transport.current,
  });

  const isSending = status === "streaming" || status === "submitted";

  // Convert SDK messages into the format used by existing components.
  const messages: ChatMessageData[] = sdkMessages.map((message) => ({
    id: message.id,
    role: message.role as "user" | "assistant",
    content: getMessageText(message),
    status: isSending && message.role === "assistant"
      ? "streaming"
      : "complete",
  }));

  // Load conversations from SQLite.
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

  // Initialize application.
  useEffect(() => {
    async function initializeApp() {
      try {
        const response = await fetch(`${API_URL}/api/health`);

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();

        setConnectionMessage(data.message);

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

    conversationIdRef.current = null;

    setActiveConversationId(null);
    setMessages([]);
    setError("");
  }

  // Select an existing conversation.
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

      const loadedMessages = data.messages.map(
        (item: {
          id: string;
          role: "user" | "assistant";
          content: string;
        }) => ({
          id: item.id,
          role: item.role,
          parts: [
            {
              type: "text" as const,
              text: item.content,
            },
          ],
        })
      );

      conversationIdRef.current = data.conversation.id;

      setActiveConversationId(data.conversation.id);
      setMessages(loadedMessages);
      setSelectedModel(data.conversation.model);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to open conversation"
      );
    }
  }

  // Delete a conversation.
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
        conversationIdRef.current = null;

        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete conversation"
      );
    }
  }

  // Send a message using the AI SDK.
  async function handleSend(
    userMessage: string,
    model: string
  ): Promise<void> {
    setError("");

    try {
      let conversationId = conversationIdRef.current;

      // Create a conversation if this is a new chat.
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
          }
        );

        if (!createResponse.ok) {
          const data = await createResponse.json().catch(() => null);

          throw new Error(
            data?.error || "Failed to create conversation"
          );
        }

        const created = await createResponse.json();

        conversationId = created.id;

        conversationIdRef.current = conversationId;

        setActiveConversationId(conversationId);
        setSelectedModel(created.model);
      }

      await sendMessage({
        text: userMessage.trim(),
      });

      await loadConversations();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      const errorMessage =
        err instanceof Error
          ? err.message
          : "Something went wrong";

      setError(errorMessage);

      await loadConversations();
    }
  }

  return (
    <main className="app">
      <Header
        connectionMessage={connectionMessage}
        error={error}
      />

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
            onStop={stop}
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