
import { Router } from "express";
import { streamAssistantReply } from "../services/ai.service.js";

const router = Router();

router.post("/message", async (req, res) => {
  const { message } = req.body;

  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({
      error: "Message must be a non-empty string",
    });
    return;
  }

  const controller = new AbortController();

  res.on("close", () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Content-Type-Options", "nosniff");

    for await (const chunk of streamAssistantReply(
      message.trim(),
      controller.signal
    )) {
      if (res.destroyed) break;
      res.write(chunk);
    }

    if (!res.destroyed) {
      res.end();
    }
  } catch (error) {
    console.error("Streaming error:", error);

    if (!res.headersSent) {
      res.status(502).json({
        error: "Failed to generate an AI response",
      });
    } else if (!res.destroyed) {
      // The stream has already started, so an HTTP error
      // status can no longer be sent reliably.
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
});

export default router;
