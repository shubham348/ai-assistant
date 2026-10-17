
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ChatMessageData = {
  role: "user" | "assistant";
  content: string;
};

type ChatMessageProps = {
  message: ChatMessageData;
};

function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

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
    </article>
  );
}

export default ChatMessage;
