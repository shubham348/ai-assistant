import { useEffect, useRef } from "react";

import ChatMessage, { type ChatMessageData } from "../ChatMessage/ChatMessage";
import "./chatWindow.scss";

type ChatWindowProps = {
  messages: ChatMessageData[];
  isSending: boolean;
  onRetry?: () => void;
};

function ChatWindow({
  messages,
  isSending,
  onRetry,
}: ChatWindowProps) {
  const chatContainerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = chatContainerRef.current;

    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  const isEmpty = messages.length === 0 && !isSending;

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  const canRetry =
    !isSending &&
    !!onRetry &&
    (lastAssistantMessage?.status === "interrupted" ||
      lastAssistantMessage?.status === "error");

  return (
    <section
      ref={chatContainerRef}
      className={`chat ${isEmpty ? "chat-empty" : ""}`}
      aria-label="Conversation"
      aria-live="polite"
    >
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onRetry={
            canRetry && message.id === lastAssistantMessage?.id
              ? onRetry
              : undefined
          }
        />
      ))}

      {isSending && (
        <article className="chat-message assistant">
          <p className="thinking">Generating...</p>
        </article>
      )}
    </section>
  );
}

export default ChatWindow;