
import { Router } from "express";
import { streamAssistantReply } from "../services/ai.service.js";
import { getConfiguredModels } from "../services/ai.service.js";
const router = Router();

router.get("/models", (_req, res) => {
  try {
    res.json(getConfiguredModels());
  } catch (error) {
    console.error("Model configuration error:", error);
    res.status(500).json({
      error: "Model configuration is missing or invalid",
    });
  }
});

router.post("/message", async (req, res) => {
  const { model, message } = req.body;

  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({
      error: "Message must be a non-empty string",
    });
    return;
  }
  const config = getConfiguredModels();

  const selectedModel =
    typeof model === "string" && model.trim()
      ? model.trim()
      : config.defaultModel;

  if (!config.models.includes(selectedModel)) {
    res.status(400).json({
      error: "The selected model is not allowed",
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
      selectedModel,
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
