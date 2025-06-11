import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";

let db: Database | null = null;

// Function to initialize the database connection for tests
export async function initializeTestDatabase(dbFileName: string = ":memory:") {
  if (db) {
    return db;
  }

  try {
    // Open the database
    db = await open({
      filename: dbFileName,
      driver: sqlite3.Database,
    });

    // Create tables if they don't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS bots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        name TEXT,
        username TEXT,
        telegram_id INTEGER UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL UNIQUE,
        first_name TEXT,
        last_name TEXT,
        username TEXT,
        language_code TEXT,
        is_bot BOOLEAN,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_bots (
        user_id INTEGER,
        bot_id INTEGER,
        prompt TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, bot_id),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (bot_id) REFERENCES bots (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chat_sessions (
        chat_id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        bot_id INTEGER NOT NULL,
        state TEXT DEFAULT 'idle',
        state_expires_at DATETIME,
        history TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (bot_id) REFERENCES bots (id) ON DELETE CASCADE
      );

      CREATE TRIGGER IF NOT EXISTS update_users_updated_at
      AFTER UPDATE ON users FOR EACH ROW
      BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_bots_updated_at
      AFTER UPDATE ON bots FOR EACH ROW
      BEGIN
        UPDATE bots SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
      
      CREATE TRIGGER IF NOT EXISTS update_user_bots_updated_at
      AFTER UPDATE ON user_bots FOR EACH ROW
      BEGIN
        UPDATE user_bots SET updated_at = CURRENT_TIMESTAMP WHERE user_id = OLD.user_id AND bot_id = OLD.bot_id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_chat_sessions_updated_at
      AFTER UPDATE ON chat_sessions FOR EACH ROW
      BEGIN
        UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE chat_id = OLD.chat_id;
      END;
    `);

    return db;
  } catch (err: unknown) {
    const error = err as Error;
    throw error;
  }
}

// Function to get the database instance
export function getTestDB(): Database {
  if (!db) {
    throw new Error(
      "Test database not initialized. Call and await initializeTestDatabase() first."
    );
  }
  return db;
}

// Helper function for running queries with promises
export async function runTestQuery(
  query: string,
  params: unknown[] = []
): Promise<void> {
  const instance = getTestDB();
  await instance.run(query, params);
}

export async function getTestQuery<T_ROW>(
  query: string,
  params: unknown[] = []
): Promise<T_ROW | undefined> {
  const instance = getTestDB();
  return instance.get<T_ROW>(query, params);
}

export async function allTestQuery<T_ROW>(
  query: string,
  params: unknown[] = []
): Promise<T_ROW[]> {
  const instance = getTestDB();
  return instance.all<T_ROW[]>(query, params);
}

export async function closeTestDb() {
  if (db) {
    try {
      await db.close();
    } catch {
      // Ignore errors if database is already closed
    } finally {
      db = null;
    }
  }
}
