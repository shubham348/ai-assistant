import { useState } from "react";
import { Copy, Check, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
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
  onRetry?: () => void;
};

function ChatMessage({ message, onRetry }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [copiedCodeBlock, setCopiedCodeBlock] = useState<number | null>(null);

  if (message.content.trim() === "" && message.status !== "cancelled") {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);

      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy message:", error);
    }
  };

  const handleCopyCode = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeBlock(index);

      setTimeout(() => setCopiedCodeBlock(null), 2000);
    } catch (error) {
      console.error("Failed to copy code:", error);
    }
  };

  let codeBlockIndex = 0;

  return (
    <article className={`chat-message ${message.role}`}>
      <span className="message-role">
        {isUser ? "You" : "AI Assistant"}
      </span>

      <div className="markdown-content">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre({ children }) {
                const index = codeBlockIndex++;

                const codeElement = children as React.ReactElement<{
                  className?: string;
                  children?: ReactNode;
                }>;

                const code =
                  typeof codeElement.props.children === "string"
                    ? codeElement.props.children
                    : "";

                const language =
                  codeElement.props.className?.replace("language-", "") || "code";

                const isCopied = copiedCodeBlock === index;

                return (
                  <div className="code-block-container">
                    <div className="code-block-header">
                      <span className="code-block-language">
                        {language}
                      </span>

                      <button
                        type="button"
                        className="code-copy-button"
                        onClick={() => handleCopyCode(code, index)}
                        aria-label={
                          isCopied ? "Code copied" : "Copy code"
                        }
                        title={isCopied ? "Copied!" : "Copy code"}
                      >
                        {isCopied ? (
                          <>
                            <Check size={14} />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    <pre>{children}</pre>
                  </div>
                );
              },
            }}
          >
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

          {onRetry && (
            <button
              type="button"
              className="message-action-button"
              onClick={onRetry}
              aria-label="Retry response"
              title="Retry response"
            >
              <RotateCcw size={16} />
            </button>
          )}
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