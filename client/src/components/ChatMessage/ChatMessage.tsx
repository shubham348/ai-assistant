import { useState } from "react";
import { Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./chatMessage.scss";

export type ChatMessageData = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "complete" | "error" | "cancelled";
};


type ChatMessageProps = {
  message: ChatMessageData;
};


function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  if (message.content.trim() === "" && message.status !== "cancelled") {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy message:", error);
    }
  };

  return (
    <article className={`chat-message ${message.role}`}>
      <span className="message-role">
        {isUser ? "You" : "AI Assistant"}
      </span>

      <div className="markdown-content">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        )}
      </div>

      {!isUser && (
        <div className="message-actions">
          <button
            type="button"
            className="message-action-button"
            onClick={handleCopy}
            aria-label={copied ? "Response copied" : "Copy response"}
            title={copied ? "Copied!" : "Copy response"}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      )}

      {message.status === "cancelled" && (
        <span className="message-status">
          Generation stopped
        </span>
      )}
    </article>
  );
}

export default ChatMessage;