
import { randomUUID } from "node:crypto";
import { db } from "./db.js";

export function createConversation(model: string, title = "New conversation") {
  const id = randomUUID();

  const statement = db.prepare(`
    INSERT INTO conversations (id, title, model)
    VALUES (?, ?, ?)
  `);

  statement.run(id, title, model);

  return id;
}

export function getAllConversations() {
  const statement = db.prepare(`
    SELECT id, title, model, created_at, updated_at
    FROM conversations
    ORDER BY updated_at DESC
  `);

  return statement.all();
}

export function getConversationById(id: string) {
  const statement = db.prepare(`
    SELECT id, title, model, created_at, updated_at
    FROM conversations
    WHERE id = ?
  `);

  return statement.get(id);
}

export function deleteConversation(id: string) {
  const statement = db.prepare(`
    DELETE FROM conversations
    WHERE id = ?
  `);

  return statement.run(id).changes > 0;
}
