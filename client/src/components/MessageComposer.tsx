
import { useState } from "react";

type MessageComposerProps = {
  isSending: boolean;
  onSend: (message: string) => Promise<void>;
};

function MessageComposer({ isSending, onSend }: MessageComposerProps) {
  const [input, setInput] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();

    if (!message || isSending) return;

    setInput("");
    await onSend(message);
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer-main">
        <textarea
          id="message-input"
          aria-label="Your message"
          value={input}
          onChange={(event) => setInput(event.target.value)}
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

        <button
          className="send-button"
          type="submit"
          disabled={!input.trim() || isSending}
          aria-label="Send message"
        >
          <span aria-hidden="true">{isSending ? "…" : "↑"}</span>
        </button>
      </div>
    </form>
  );
}

export default MessageComposer;
