
import { Router } from "express";
import {
    createConversation,
    getAllConversations,
    getConversationById,
    deleteConversation,
} from "../database/conversation.repository";
import { getMessagesByConversationId } from "../database/message.repository";
import { getConfiguredModels } from "../services/ai.service";

const router = Router();

// Create a conversation
router.post("/api/conversations", (req, res) => {
    try {
        const { model, title } = req.body ?? {};

        const config = getConfiguredModels();

        const selectedModel =
            typeof model === "string" && model.trim()
                ? model.trim()
                : config.defaultModel;

        if (!config.models.includes(selectedModel)) {
            return res.status(400).json({
                error: "Invalid model selected",
            });
        }

        const conversationTitle =
            typeof title === "string" && title.trim()
                ? title.trim()
                : "New conversation";

        const id = createConversation(selectedModel, conversationTitle);

        return res.status(201).json({
            id,
            title: conversationTitle,
            model: selectedModel,
        });
    } catch (error) {
        console.error("Failed to create conversation:", error);

        return res.status(500).json({
            error: "Failed to create conversation",
        });
    }
});

// Get all conversations
router.get("/api/conversations", (_req, res) => {
    try {
        const conversations = getAllConversations();

        return res.json({
            conversations,
        });
    } catch (error) {
        console.error("Failed to fetch conversations:", error);

        return res.status(500).json({
            error: "Failed to fetch conversations",
        });
    }
});

// Get one conversation with its messages
router.get("/api/conversations/:id", (req, res) => {
    try {
        const { id } = req.params;

        const conversation = getConversationById(id);

        if (!conversation) {
            return res.status(404).json({
                error: "Conversation not found",
            });
        }

        const messages = getMessagesByConversationId(id);

        return res.json({
            conversation,
            messages,
        });
    } catch (error) {
        console.error("Failed to fetch conversation:", error);

        return res.status(500).json({
            error: "Failed to fetch conversation",
        });
    }
});

// Delete one conversation
router.delete("/api/conversations/:id", (req, res) => {
    try {
        const { id } = req.params;

        const deleted = deleteConversation(id);

        if (!deleted) {
            return res.status(404).json({
                error: "Conversation not found",
            });
        }

        return res.json({
            message: "Conversation deleted successfully",
            id,
        });
    } catch (error) {
        console.error("Failed to delete conversation:", error);

        return res.status(500).json({
            error: "Failed to delete conversation",
        });
    }
});

export default router;
