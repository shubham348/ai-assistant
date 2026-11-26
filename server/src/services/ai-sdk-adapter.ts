
import { createUIMessageStream } from "ai";

export type AssistantStreamStatus =
  | "completed"
  | "interrupted"
  | "error";

type OnCompleteCallback = (
  assistantReply: string,
  status: AssistantStreamStatus
) => Promise<void> | void;

export function createAIStreamFromGenerator(
  generator: AsyncGenerator<string, void, unknown>,
  onComplete?: OnCompleteCallback,
  signal?: AbortSignal
) {
  return createUIMessageStream({
    execute: async ({ writer }) => {
      const textId = crypto.randomUUID();
      let assistantReply = "";
      let streamStatus: AssistantStreamStatus = "completed";

      writer.write({
        type: "text-start",
        id: textId,
      });

      try {
        for await (const chunk of generator) {
          if (signal?.aborted) {
            streamStatus = "interrupted";
            break;
          }

          assistantReply += chunk;

          writer.write({
            type: "text-delta",
            id: textId,
            delta: chunk,
          });
        }

        if (signal?.aborted) {
          streamStatus = "interrupted";
        }

        writer.write({
          type: "text-end",
          id: textId,
        });
      } catch (error) {
        streamStatus = signal?.aborted
          ? "interrupted"
          : "error";

        throw error;
      } finally {
        try {
          // Save only meaningful assistant output.
          if (assistantReply.trim() && onComplete) {
            await onComplete(assistantReply, streamStatus);
          }
        } finally {
          await generator.return?.(undefined);
        }
      }
    },
  });
}
