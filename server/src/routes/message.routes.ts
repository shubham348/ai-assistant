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
  const { conversationId, messages } = req.body ?? {};

  // 1. Validate conversation ID
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return res.status(400).json({
      error: "A valid conversationId is required",
    });
  }

  // 2. Validate incoming messages
  console.log("Incoming request body:", JSON.stringify(req.body, null, 2));
  const validation = validateConversation(messages);
  console.log("Validated data:", validation);
  if (!validation.success) {
    return res.status(400).json({
      error: validation.error,
    });
  }

  const incomingMessages = validation.messages;

  // 3. Ensure the latest message is from the user
  const latestMessage = incomingMessages[incomingMessages.length - 1];
  console.log("Latest user message:", latestMessage);
  if (!latestMessage || latestMessage.role !== "user") {
    return res.status(400).json({
      error: "The latest message must be from the user",
    });
  }

  try {
    // 4. Retrieve conversation
    const conversation:any = getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        error: "Conversation not found",
      });
    }

    // 5. Retrieve configured models
    const config = getConfiguredModels();

    const storedModel = conversation?.model;

    const configuredModel = config.models.find(
      (item) => item.id === storedModel
    );

    if (!configuredModel) {
      return res.status(400).json({
        error: "The conversation model is no longer configured",
      });
    }

    const selectedModel = configuredModel.id;

    // 6. Retrieve persisted conversation history
    const storedMessages = getMessagesByConversationId(conversationId);

    const conversationHistory = storedMessages.map((message:any) => ({
      role: message.role as "user" | "assistant",
      content: message.content as string,
    }));

    // 7. Append the latest user message to the history
    const updatedHistory = [
      ...conversationHistory,
      {
        role: "user" as const,
        content: latestMessage.content,
      },
    ];

    let messagesForAI = updatedHistory;

    // 8. Apply context management for the configured Ollama model
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

    // 9. Persist the user message
    createMessage(conversationId, "user", latestMessage.content);

    // 10. Create abort controller
    const controller = new AbortController();

    // Abort generation if the client disconnects before the response completes
    res.on("close", () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    // 11. Generate AI response
    const generator = streamAssistantReply(
      messagesForAI,
      selectedModel,
      controller.signal
    );

    // 12. Convert custom generator into AI SDK stream
    const stream = createAIStreamFromGenerator(
      generator,
      async (assistantReply) => {
        // Persist only completed responses when generation wasn't aborted
        if (!controller.signal.aborted) {
          createMessage(
            conversationId,
            "assistant",
            assistantReply
          );
        }
      }
    );

    // 13. Stream response to client
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

    // Client may have disconnected
    if (res.destroyed || res.writableEnded) {
      return;
    }

    // Headers were already sent; we can't send a JSON error response
    if (res.headersSent) {
      res.end();
      return;
    }

    // Failure before streaming begins
    return res.status(502).json({
      error: "Failed to process the conversation",
    });
  }
});

export default router;