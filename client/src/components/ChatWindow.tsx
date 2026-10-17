
import { useEffect, useRef } from "react";
import ChatMessage, { type ChatMessageData } from "./ChatMessage";

type ChatWindowProps = {
  messages: ChatMessageData[];
  isSending: boolean;
};

function ChatWindow({ messages, isSending }: ChatWindowProps) {
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

  return (
    <section
      ref={chatContainerRef}
      className={`chat ${isEmpty ? "chat-empty" : ""}`}
      aria-label="Conversation"
      aria-live="polite"
    >
      {messages.map((message, index) => (
        <ChatMessage
          key={`${message.role}-${index}`}
          message={message}
        />
      ))}

      {isSending && (
        <article className="chat-message assistant">
          <span className="message-role">AI Assistant</span>
          <p className="thinking">Thinking…</p>
        </article>
      )}
    </section>
  );
}

export default ChatWindow;
