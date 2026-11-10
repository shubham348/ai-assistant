import type { ConversationMessage } from "./ai.service.js";
import { countQwenMessageTokens } from "./tokenizer.service.js";

type ContextConfig = {
  numCtx: number;
  numPredict: number;
  safetyMargin: number;
};

type ContextSelectionResult =
  | {
      success: true;
      messages: ConversationMessage[];
      tokenCount: number;
      inputBudget: number;
      droppedTurns: number;
    }
  | {
      success: false;
      error: string;
    };

export function calculateInputBudget(
  config: ContextConfig
): number {
  const { numCtx, numPredict, safetyMargin } = config;

  const availableTokens =
    numCtx - numPredict - safetyMargin;

  if (availableTokens <= 0) {
    throw new Error("Invalid context configuration");
  }

  return availableTokens;
}


export function groupConversationTurns(
  messages: ConversationMessage[]
): ConversationMessage[][] {
  const turns: ConversationMessage[][] = [];

  let currentTurn: ConversationMessage[] = [];

  for (const message of messages) {
    if (message.role === "user" && currentTurn.length > 0) {
      turns.push(currentTurn);
      currentTurn = [];
    }

    currentTurn.push(message);
  }

  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  return turns;
}

export async function countConversationTokens(
  messages: ConversationMessage[]
): Promise<number> {
  return countQwenMessageTokens(messages);
}

export async function selectContextMessages(
  messages: ConversationMessage[],
  config: ContextConfig
): Promise<ContextSelectionResult> {
  if (messages.length === 0) {
    return {
      success: false,
      error: "Conversation cannot be empty.",
    };
  }

  const inputBudget = calculateInputBudget(config);
  const turns = groupConversationTurns(messages);

  const latestTurn = turns[turns.length - 1];

  if (!latestTurn.some((message) => message.role === "user")) {
    return {
      success: false,
      error: "The latest conversation turn must contain a user message.",
    };
  }

  let selectedTurns: ConversationMessage[][] = [];
  let selectedTokenCount = 0;

  for (let i = turns.length - 1; i >= 0; i--) {
    const candidateTurns = [
      turns[i],
      ...selectedTurns,
    ];

    const candidateMessages = candidateTurns.flat();

    const candidateTokenCount =
      await countConversationTokens(candidateMessages);

    if (candidateTokenCount > inputBudget) {
      if (selectedTurns.length === 0) {
        return {
          success: false,
          error: "The latest conversation turn exceeds the available context budget.",
        };
      }

      break;
    }

    selectedTurns = candidateTurns;
    selectedTokenCount = candidateTokenCount;
  }

  return {
    success: true,
    messages: selectedTurns.flat(),
    tokenCount: selectedTokenCount,
    inputBudget,
    droppedTurns: turns.length - selectedTurns.length,
  };
}