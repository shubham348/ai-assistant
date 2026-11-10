import { AutoTokenizer } from "@huggingface/transformers";

async function main() {
  console.log("Loading Qwen tokenizer...");

  const tokenizer = await AutoTokenizer.from_pretrained(
    "Qwen/Qwen2.5-3B-Instruct"
  );

  console.log("Tokenizer loaded successfully!");

  // Test 1: Plain text tokenization
  const text = "Hello, how are you today?";
  const textTokens = tokenizer.encode(text);

  console.log("\nPlain text:");
  console.log("Text:", text);
  console.log("Token count:", textTokens.length);
  console.log("Token IDs:", textTokens);

  // Test 2: Conversation tokenization
  const messages = [
    {
      role: "user",
      content: "Explain React reconciliation.",
    },
    {
      role: "assistant",
      content: "React compares the previous and next UI trees.",
    },
    {
      role: "user",
      content: "Why does it use keys?",
    },
  ];
  const formattedText = tokenizer.apply_chat_template(messages, {
    tokenize: false,
    add_generation_prompt: true,
  });

  console.log("\nFormatted conversation:");
  console.log(formattedText);
  const chatTokens = tokenizer.apply_chat_template(messages, {
    tokenize: true,
    add_generation_prompt: true,
    return_tensor: false,
    return_dict: false,
  });

  console.log("\nFormatted conversation:");
  console.log("Token count:", chatTokens.length);
  console.log("Token IDs:", chatTokens);
}

main().catch((error) => {
  console.error("Tokenizer test failed:", error);
  process.exitCode = 1;
});