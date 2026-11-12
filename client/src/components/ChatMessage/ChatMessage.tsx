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

  if (message.content.trim() === "" && message.status !== "cancelled") {
    return null;
  }

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
      {message.status === "cancelled" && (
        <span className="message-status">
          Generation stopped
        </span>
      )}
    </article>
  );
}

export default ChatMessage;
