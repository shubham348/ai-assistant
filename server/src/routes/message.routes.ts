
import { Router } from "express";
import { pipeUIMessageStreamToResponse } from "ai";

import {
  streamAssistantReply,
  getConfiguredModels,
} from "../services/ai.service.js";

import { createAIStreamFromGenerator } from "../services/ai-sdk-adapter.js";
import { validateConversation } from "../validators/conversation.validator.js";
import { selectContextMessages } from "../services/context-manager.js";
import { AI_CONFIG } from "../config/ai.config.js";
import { getConversationById } from "../database/conversation.repository.js";
import {
  createMessage,
  getMessagesByConversationId,
} from "../database/message.repository.js";

const router = Router();

/**
 * GET /models
 *
 * Returns the currently configured AI models.
 */
router.get("/models", (_req, res) => {
  try {
    const models = getConfiguredModels();

    return res.json(models);
  } catch (error) {
    console.error("Model configuration error:", error);

    return res.status(500).json({
      error: "Model configuration is missing or invalid",
    });
  }
});

/**
 * POST /message
 *
 * Processes a user message and streams the AI response.
 */
router.post("/message", async (req, res) => {
  const { conversationId, messages, isRetry = false } = req.body ?? {};

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

  // Ensure the latest message is from the user.
  const latestMessage = incomingMessages[incomingMessages.length - 1];

  if (!latestMessage || latestMessage.role !== "user") {
    return res.status(400).json({
      error: "The latest message must be from the user",
    });
  }

  if (typeof isRetry !== "boolean") {
    return res.status(400).json({
      error: "isRetry must be a boolean",
    });
  }

  try {
    // Retrieve conversation.
    const conversation: any = getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        error: "Conversation not found",
      });
    }

    // Retrieve configured models.
    const config = getConfiguredModels();

    const storedModel = conversation.model;

    const configuredModel = config.models.find(
      (item) => item.id === storedModel
    );

    if (!configuredModel) {
      return res.status(400).json({
        error: "The conversation model is no longer configured",
      });
    }

    const selectedModel = configuredModel.id;

    // Retrieve persisted conversation history.
    const storedMessages: any[] =
      getMessagesByConversationId(conversationId);

    let conversationHistory = storedMessages.map((message: any) => ({
      role: message.role as "user" | "assistant",
      content: message.content as string,
      status: message.status,
    }));

    let messagesForAI;

    if (isRetry) {
      // Retry must refer to an already persisted user message.
      const lastStoredUserMessage = [...storedMessages]
        .reverse()
        .find((message: any) => message.role === "user");

      if (
        !lastStoredUserMessage ||
        lastStoredUserMessage.content !== latestMessage.content
      ) {
        return res.status(400).json({
          error: "The message to retry was not found in the conversation",
        });
      }

      // Remove the previous incomplete assistant response from AI context.
      const lastStoredMessage = conversationHistory.at(-1);

      if (
        lastStoredMessage?.role === "assistant" &&
        lastStoredMessage.status !== "completed"
      ) {
        conversationHistory.pop();
      }

      // The user message is already persisted.
      messagesForAI = conversationHistory.map(({ role, content }) => ({
        role,
        content,
      }));
    } else {
      // Normal message: append the new user message.
      messagesForAI = [
        ...conversationHistory.map(({ role, content }) => ({
          role,
          content,
        })),
        {
          role: "user" as const,
          content: latestMessage.content,
        },
      ];
    }

    // Apply context management for the configured Ollama model.
    if (
      configuredModel.provider === "ollama" &&
      configuredModel.model === "qwen2.5:3b"
    ) {
      const contextResult = await selectContextMessages(messagesForAI, {
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
    }

    // Persist the user message only for a normal request.
    if (!isRetry) {
      createMessage(conversationId, "user", latestMessage.content);
    }

    // Abort controller.
    const controller = new AbortController();

    res.on("close", () => {
      // A normal completed response shouldn't cancel the generation.
      // A disconnected client should.
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    const generator = streamAssistantReply(
      messagesForAI,
      selectedModel,
      controller.signal
    );

    // Convert custom generator into AI SDK stream.
    const stream = createAIStreamFromGenerator(
      generator,
      async (assistantReply, streamStatus) => {
        if (!assistantReply.trim()) {
          return;
        }

        console.log(`Persisting assistant response: ${streamStatus}`);

        createMessage(
          conversationId,
          "assistant",
          assistantReply,
          streamStatus
        );
      },
      controller.signal
    );

    // Response to client.
    await pipeUIMessageStreamToResponse({
      response: res,
      stream,
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Streaming/persistence error:", error);

    if (res.destroyed || res.writableEnded) {
      return;
    }

    if (res.headersSent) {
      res.end();
      return;
    }

    return res.status(502).json({
      error: "Failed to process the conversation",
    });
  }
});

export default router;
