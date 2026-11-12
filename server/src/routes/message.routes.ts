
import { Router, type Response } from "express";
import {
  streamAssistantReply,
  getConfiguredModels,
} from "../services/ai.service.js";
import { validateConversation } from "../validators/conversation.validator.js";
import { selectContextMessages } from "../services/context-manager.js";
import { AI_CONFIG } from "../config/ai.config.js";
import { getConversationById } from "../database/conversation.repository.js";
import {
  createMessage,
  getMessagesByConversationId,
} from "../database/message.repository.js";

const router = Router();

function sendSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

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

  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return res.status(400).json({
      error: "A valid conversationId is required",
    });
  }

  const validation = validateConversation(messages);

  if (!validation.success) {
    return res.status(400).json({ error: validation.error });
  }

  const incomingMessages = validation.messages;
  const latestMessage = incomingMessages[incomingMessages.length - 1];

  if (!latestMessage || latestMessage.role !== "user") {
    return res.status(400).json({
      error: "The latest message must be from the user",
    });
  }

  try {
    const conversation = getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        error: "Conversation not found",
      });
    }

    const config = getConfiguredModels();
    const storedModel = conversation.model as string;

    const configuredModel = config.models.find(
      (item) => item.id === storedModel
    );

    if (!configuredModel) {
      return res.status(400).json({
        error: "The conversation model is no longer configured",
      });
    }

    const selectedModel = configuredModel.id;

    const storedMessages = getMessagesByConversationId(conversationId);

    const conversationHistory = storedMessages.map((message: any) => ({
      role: message.role as "user" | "assistant",
      content: message.content as string,
    }));

    const updatedHistory = [
      ...conversationHistory,
      {
        role: "user" as const,
        content: latestMessage.content,
      },
    ];

    let messagesForAI = updatedHistory;

    if (
      configuredModel.provider === "ollama" &&
      configuredModel.model === "qwen2.5:3b"
    ) {
      const contextResult = await selectContextMessages(updatedHistory, {
        numCtx: AI_CONFIG.context.numCtx,
        numPredict: AI_CONFIG.context.numPredict,
        safetyMargin: AI_CONFIG.context.safetyMargin,
      });

      if (!contextResult.success) {
        return res.status(400).json({
          error: contextResult.error,
        });
      }

      messagesForAI = contextResult.messages;

      console.log("Context selection:", {
        originalMessages: updatedHistory.length,
        selectedMessages: contextResult.messages.length,
        tokenCount: contextResult.tokenCount,
        inputBudget: contextResult.inputBudget,
        droppedTurns: contextResult.droppedTurns,
      });
    }

    createMessage(conversationId, "user", latestMessage.content);

    const controller = new AbortController();

    res.on("close", () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Accel-Buffering", "no");

    res.flushHeaders();

    let assistantReply = "";

    for await (const chunk of streamAssistantReply(
      messagesForAI,
      selectedModel,
      controller.signal
    )) {
      if (res.destroyed || controller.signal.aborted) {
        break;
      }

      assistantReply += chunk;

      sendSse(res, "token", { content: chunk });
    }

    if (res.destroyed || controller.signal.aborted) {
      return;
    }

    if (!assistantReply.trim()) {
      sendSse(res, "error", {
        message: "The AI returned an empty response.",
      });

      res.end();
      return;
    }

    createMessage(conversationId, "assistant", assistantReply);

    sendSse(res, "done", {
      completed: true,
    });

    res.end();
  } catch (error) {
    console.error("Streaming/persistence error:", error);

    if (res.destroyed || res.writableEnded) {
      return;
    }

    if (res.headersSent) {
      sendSse(res, "error", {
        message: "The AI response could not be completed.",
      });

      res.end();
      return;
    }

    res.status(502).json({
      error: "Failed to process the conversation",
    });
  }
});

export default router;
