import type { ConversationMessage } from "../services/ai.service";

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 10_000;
const MAX_TOTAL_CHARACTERS = 50_000;

type ValidationResult =
    | {
        success: true;
        messages: ConversationMessage[];
    }
    | {
        success: false;
        error: string;
    };

export function validateConversation(
    input: unknown
): ValidationResult {
    if (!Array.isArray(input)) {
        return {
            success: false,
            error: "Messages must be an array.",
        };
    }

    if (input.length === 0) {
        return {
            success: false,
            error: "Conversation cannot be empty.",
        };
    }

    if (input.length > MAX_MESSAGES) {
        return {
            success: false,
            error: `Conversation cannot contain more than ${MAX_MESSAGES} messages.`,
        };
    }

    const messages: ConversationMessage[] = [];
    let totalCharacters = 0;

    for (const item of input) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
            return {
                success: false,
                error: "Each message must be an object.",
            };
        }

        const message = item as Record<string, unknown>;

        if (
            message.role !== "user" &&
            message.role !== "assistant"
        ) {
            return {
                success: false,
                error: "Message role must be user or assistant.",
            };
        }

        if (typeof message.content !== "string") {
            return {
                success: false,
                error: "Message content must be a string.",
            };
        }

        const content = message.content.trim();

        if (!content) {
            return {
                success: false,
                error: "Message content cannot be empty.",
            };
        }

        if (content.length > MAX_MESSAGE_LENGTH) {
            return {
                success: false,
                error: `A message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
            };
        }

        totalCharacters += content.length;

        if (totalCharacters > MAX_TOTAL_CHARACTERS) {
            return {
                success: false,
                error: `Conversation cannot exceed ${MAX_TOTAL_CHARACTERS} characters.`,
            };
        }

        messages.push({
            role: message.role,
            content,
        });
    }

    return {
        success: true,
        messages,
    };
}