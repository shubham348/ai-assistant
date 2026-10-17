
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
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
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
