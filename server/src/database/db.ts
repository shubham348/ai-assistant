

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Resolve the database path from the server's working directory.
const databasePath = resolve(process.cwd(), "data", "assistant.db");

// Create the data directory if it doesn't exist.
mkdirSync(dirname(databasePath), { recursive: true });

// Open or create the SQLite database.
export const db = new Database(databasePath);

// Enable write-ahead logging.
db.pragma("journal_mode = WAL");

console.log("SQLite database connected:", databasePath);



db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New conversation',
    model TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log("Conversations table ready.");

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (conversation_id)
      REFERENCES conversations(id)
      ON DELETE CASCADE
  );
`);

console.log("Messages table ready.");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON messages(conversation_id);
`);