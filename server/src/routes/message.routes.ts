
import { Router } from "express";
import {
  streamAssistantReply,
  getConfiguredModels,
} from "../services/ai.service.js";
import { validateConversation } from "../validators/conversation.validator.js";
import { selectContextMessages } from "../services/context-manager.js";
import { AI_CONFIG } from "../config/ai.config.js";
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
  const { model, messages } = req.body;

  const validation = validateConversation(messages);

  if (!validation.success) {
    res.status(400).json({
      error: validation.error,
    });
    return;
  }

  const conversationMessages = validation.messages;

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

    // This tokenizer currently supports Qwen only.
    if (selectedModel !== "qwen2.5:3b") {
      res.status(400).json({
        error: "Context management is not yet supported for this model.",
      });
      return;
    }

    const contextResult = await selectContextMessages(
      conversationMessages,
      {
        numCtx: AI_CONFIG.context.numCtx,
        numPredict: AI_CONFIG.context.numPredict,
        safetyMargin: AI_CONFIG.context.safetyMargin,
      }
    );

    if (!contextResult.success) {
      res.status(400).json({
        error: contextResult.error,
      });
      return;
    }

    console.log("Context selection:", {
      originalMessages: conversationMessages.length,
      selectedMessages: contextResult.messages.length,
      tokenCount: contextResult.tokenCount,
      inputBudget: contextResult.inputBudget,
      droppedTurns: contextResult.droppedTurns,
    });

    for await (const chunk of streamAssistantReply(
      contextResult.messages,
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
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
});


export default router;
