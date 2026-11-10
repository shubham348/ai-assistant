import { AutoTokenizer } from "@huggingface/transformers";
import type { ConversationMessage } from "./ai.service.js";

const TOKENIZER_ID = "Qwen/Qwen2.5-3B-Instruct";

let tokenizerPromise:
  | ReturnType<typeof AutoTokenizer.from_pretrained>
  | undefined;

async function getTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = AutoTokenizer.from_pretrained(TOKENIZER_ID);
  }

  return tokenizerPromise;
}

export async function countQwenMessageTokens(
  messages: ConversationMessage[]
): Promise<number> {
  const tokenizer = await getTokenizer();

  const tokenIds = tokenizer.apply_chat_template(messages, {
    tokenize: true,
    add_generation_prompt: true,
    return_tensor: false,
    return_dict: false,
  });

  return tokenIds.length;
}
