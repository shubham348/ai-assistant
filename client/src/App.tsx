
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

// Normalize technical errors into user-friendly messages.
function getUserFriendlyError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Something went wrong. Please try again.";
  }

  const message = error.message.toLowerCase();

  if (
    message.includes("failed to fetch") ||
    message.includes("network error") ||
    message.includes("networkerror") ||
    message.includes("fetch failed")
  ) {
    return "Couldn't connect to the server. Check your connection and try again.";
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return "The request took too long. Please try again.";
  }

  if (message.includes("429") || message.includes("rate limit")) {
    return "The AI service is busy right now. Please wait a moment and try again.";
  }

  if (
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  ) {
    return "The server is temporarily unavailable. Please try again shortly.";
  }

  return "Something went wrong while processing your request. Please try again.";
}

function App() {
  const [connectionMessage, setConnectionMessage] = useState(
    "Connecting to backend..."
  );

  const [messageStatuses, setMessageStatuses] = useState<
    Record<string, ChatMessageData["status"]>
  >({});

  const [error, setError] = useState("");

  const [selectedModel, setSelectedModel] = useState("");

  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null);

  const [isLoadingConversations, setIsLoadingConversations] =
    useState(false);

  const conversationIdRef = useRef<string | null>(null);

  // Marks the next request as a retry.
  const retryRef = useRef(false);

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

        // Consume the retry flag for this request.
        const isRetry = retryRef.current;
        retryRef.current = false;

        return {
          body: {
            conversationId: conversationIdRef.current,
            isRetry,
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
    regenerate,
    setMessages,
    stop,
    status,
    error: chatError,
    clearError,
  } = useChat({
    transport: transport.current,
  });

  const isSending = status === "streaming" || status === "submitted";

  // Convert SDK messages into the format used by existing components.
  const messages: ChatMessageData[] = sdkMessages.map((message) => ({
    id: message.id,
    role: message.role as "user" | "assistant",
    content: getMessageText(message),
    status:
      messageStatuses[message.id] ??
      (isSending && message.role === "assistant"
        ? "streaming"
        : "complete"),
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
      setError(getUserFriendlyError(err));
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
        setError(getUserFriendlyError(err));
      }
    }

    initializeApp();
  }, []);

  function handleNewChat() {
    if (isSending) return;

    conversationIdRef.current = null;
    retryRef.current = false;

    setActiveConversationId(null);
    setMessages([]);
    setError("");
    clearError();
  }

  // Select an existing conversation.
  async function handleSelectConversation(id: string) {
    if (isSending) return;

    setError("");
    clearError();
    retryRef.current = false;

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
          status?: string;
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

      setMessageStatuses(
        Object.fromEntries(
          data.messages.map((item: { id: string; status?: string }) => [
            item.id,
            item.status === "interrupted" || item.status === "error"
              ? item.status
              : "complete",
          ])
        )
      );

      conversationIdRef.current = data.conversation.id;

      setActiveConversationId(data.conversation.id);
      setMessages(loadedMessages);
      setSelectedModel(data.conversation.model);
    } catch (err) {
      setError(getUserFriendlyError(err));
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
        clearError();
      }
    } catch (err) {
      setError(getUserFriendlyError(err));
    }
  }

  // Send a normal message using the AI SDK.
  async function handleSend(
    userMessage: string,
    model: string
  ): Promise<void> {
    setError("");
    clearError();
    retryRef.current = false;

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

      setError(getUserFriendlyError(err));

      await loadConversations();
    }
  }

  // Retry the last assistant response.
  async function handleRetry(): Promise<void> {
    if (isSending || !conversationIdRef.current) return;

    setError("");
    clearError();

    retryRef.current = true;

    try {
      await regenerate();

      await loadConversations();
    } catch (err) {
      retryRef.current = false;

      setError(getUserFriendlyError(err));

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
            onRetry={handleRetry}
          />

          <MessageComposer
            isSending={isSending}
            onSend={handleSend}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onStop={stop}
          />

          {(error || chatError) && (
            <p className="error-message" role="alert">
              {error ||
                "The response couldn't be generated. Please try again."}
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
