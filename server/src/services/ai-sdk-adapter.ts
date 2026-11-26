import { createUIMessageStream } from "ai";

type OnCompleteCallback = (assistantReply: string) => Promise<void> | void;

export function createAIStreamFromGenerator(
  generator: AsyncGenerator<string, void, unknown>,
  onComplete?: OnCompleteCallback
) {
  return createUIMessageStream({
    execute: async ({ writer }) => {
      const textId = crypto.randomUUID();
      let assistantReply = "";

      writer.write({
        type: "text-start",
        id: textId,
      });

      try {
        for await (const chunk of generator) {
          assistantReply += chunk;

          writer.write({
            type: "text-delta",
            id: textId,
            delta: chunk,
          });
        }

        writer.write({
          type: "text-end",
          id: textId,
        });

        // Invoke persistence callback after generation completes
        if (onComplete) {
          await onComplete(assistantReply);
        }
      } finally {
        await generator.return?.(undefined);
      }
    },
  });
}