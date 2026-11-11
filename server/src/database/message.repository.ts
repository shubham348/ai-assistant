
import { randomUUID } from "node:crypto";
import { db } from "./db.js";

type MessageRole = "user" | "assistant";

export function createMessage(
  conversationId: string,
  role: MessageRole,
  content: string
) {
  const id = randomUUID();

  const saveMessage = db.transaction(() => {
    const statement = db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, ?, ?)
    `);

    statement.run(id, conversationId, role, content);

    db.prepare(`
      UPDATE conversations
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(conversationId);
  });

  saveMessage();

  return id;
}

export function getMessagesByConversationId(conversationId: string) {
  const statement = db.prepare(`
    SELECT id, conversation_id, role, content, created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY rowid ASC
  `);

  return statement.all(conversationId);
}
