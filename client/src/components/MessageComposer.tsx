
import { useRef, useState } from "react";
import ModelSelector from "./ModelSelector";

type MessageComposerProps = {
  isSending: boolean;
  onSend: (message: string, model: string) => Promise<void>;
  selectedModel: string;
  onModelChange: (model: string) => void;
};

function MessageComposer({ isSending, onSend, selectedModel, onModelChange }: MessageComposerProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleInputChange(
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) {
    setInput(event.target.value);

    const textarea = event.currentTarget;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();

    if (!message || isSending) return;

    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await onSend(message, selectedModel);
  }


  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer-main">
        <textarea
          ref={textareaRef}
          id="message-input"
          aria-label="Your message"
          value={input}
          onChange={handleInputChange}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask anything"
          rows={1}
          disabled={isSending}
        />
      </div>

      <div className="composer-footer">
        <span className="composer-hint">+</span>

        <div className="composer-actions">
          <ModelSelector
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            disabled={isSending}
          />

          <button
          className={`send-button ${isSending ? "is-generating" : ""}`}
            type="submit"
            disabled={!input.trim() || isSending}
            aria-label="Send message"
          >
            <span aria-hidden="true">{isSending ? "…" : "↑"}</span>
          </button>
        </div>
      </div>
    </form>
  );

}

export default MessageComposer;
