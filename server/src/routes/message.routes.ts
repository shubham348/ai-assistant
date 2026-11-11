
import { Router } from "express";
import {
  streamAssistantReply,
  getConfiguredModels,
} from "../services/ai.service.js";
import { validateConversation } from "../validators/conversation.validator.js";
import {
  selectContextMessages,
} from "../services/context-manager.js";
import { AI_CONFIG } from "../config/ai.config.js";

import {
  getConversationById,
} from "../database/conversation.repository.js";

import {
  createMessage,
  getMessagesByConversationId,
} from "../database/message.repository.js";

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
  const { conversationId, messages } = req.body ?? {};

  // Validate conversation ID.
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return res.status(400).json({
      error: "A valid conversationId is required",
    });
  }

  // Validate incoming messages.
  const validation = validateConversation(messages);

  if (!validation.success) {
    return res.status(400).json({
      error: validation.error,
    });
  }

  const incomingMessages = validation.messages;
  const latestMessage = incomingMessages[incomingMessages.length - 1];

  // Each request must end with a new user message.
  if (!latestMessage || latestMessage.role !== "user") {
    return res.status(400).json({
      error: "The latest message must be from the user",
    });
  }

  try {
    // Find the conversation in SQLite.
    const conversation = getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        error: "Conversation not found",
      });
    }

    const config = getConfiguredModels();

    // The model saved when the conversation was created is authoritative.
    const selectedModel = conversation?.model as string;

    if (!config.models.includes(selectedModel)) {
      return res.status(400).json({
        error: "The conversation model is no longer configured",
      });
    }

    // Load previous messages from SQLite.
    const storedMessages = getMessagesByConversationId(conversationId);

    const conversationHistory = storedMessages.map((message: any) => ({
      role: message.role as "user" | "assistant",
      content: message.content as string,
    }));

    // Add only the latest user message.
    const updatedHistory = [
      ...conversationHistory,
      {
        role: "user" as const,
        content: latestMessage.content,
      },
    ];

    // Apply the existing context-window management.
    if (selectedModel !== "qwen2.5:3b") {
      return res.status(400).json({
        error: "Context management is not yet supported for this model.",
      });
    }

    const contextResult = await selectContextMessages(
      updatedHistory,
      {
        numCtx: AI_CONFIG.context.numCtx,
        numPredict: AI_CONFIG.context.numPredict,
        safetyMargin: AI_CONFIG.context.safetyMargin,
      }
    );

    if (!contextResult.success) {
      return res.status(400).json({
        error: contextResult.error,
      });
    }

    console.log("Context selection:", {
      originalMessages: updatedHistory.length,
      selectedMessages: contextResult.messages.length,
      tokenCount: contextResult.tokenCount,
      inputBudget: contextResult.inputBudget,
      droppedTurns: contextResult.droppedTurns,
    });

    // Save the user message before generation.
    createMessage(
      conversationId,
      "user",
      latestMessage.content
    );

    const controller = new AbortController();

    res.on("close", () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Content-Type-Options", "nosniff");

    let assistantReply = "";

    // Stream the response and collect the complete answer.
    for await (const chunk of streamAssistantReply(
      contextResult.messages,
      selectedModel,
      controller.signal
    )) {
      if (res.destroyed) break;

      assistantReply += chunk;
      res.write(chunk);
    }

    // Save only a completed, non-empty assistant response.
    if (!res.destroyed && !controller.signal.aborted && assistantReply) {
      createMessage(
        conversationId,
        "assistant",
        assistantReply
      );

      res.end();
    }
  } catch (error) {
    console.error("Streaming/persistence error:", error);

    if (!res.headersSent) {
      res.status(502).json({
        error: "Failed to process the conversation",
      });
    } else if (!res.destroyed) {
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
});

export default router;
