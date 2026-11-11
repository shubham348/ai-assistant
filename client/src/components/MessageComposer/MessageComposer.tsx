
import { useRef, useState } from "react";
import { Square ,SendHorizontal} from "lucide-react";

import ModelSelector from "../ModelSelector/ModelSelector";
import "./messageComposer.scss";

type MessageComposerProps = {
  isSending: boolean;
  onSend: (message: string, model: string) => Promise<void>;
  onStop: () => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
};

function MessageComposer({
  isSending,
  onSend,
  onStop,
  selectedModel,
  onModelChange,
}: MessageComposerProps) {
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
        />
      </div>

      <div className="composer-footer">
        <div className="composer-actions">
          <ModelSelector
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            disabled={isSending}
          />

          <button
            className={`send-button ${isSending ? "is-generating" : ""}`}
            type={isSending ? "button" : "submit"}
            onClick={isSending ? onStop : undefined}
            disabled={!isSending && !input.trim()}
            aria-label={isSending ? "Stop generating" : "Send message"}
            title={isSending ? "Stop generating" : "Send message"}
          >
            {isSending ? (
              <Square className="stop-icon" aria-hidden="true" />
            ) : (
               <SendHorizontal  aria-hidden="true"/>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

export default MessageComposer;
