import {
  selectContextMessages,
} from "./context-manager.js";

import type {
  ConversationMessage,
} from "./ai.service.js";

const messages: ConversationMessage[] = [
  { role: "user", content: "Question 1" },
  { role: "assistant", content: "Answer 1" },

  { role: "user", content: "Question 2" },
  { role: "assistant", content: "Answer 2" },

  { role: "user", content: "Question 3" },
  { role: "assistant", content: "Answer 3" },

  { role: "user", content: "Question 4" },
];

async function main() {
  const result = await selectContextMessages(messages, {
    numCtx: 100,
    numPredict: 20,
    safetyMargin: 10,
  });

  console.log(result);
}

main().catch(console.error);