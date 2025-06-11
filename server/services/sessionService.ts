import { getQuery, runQuery } from "~/server/db";
import type { ChatMessage } from "./ai/types";
import logger from "../utils/logger";

const MAX_HISTORY_MESSAGES = 1000;

export interface ChatSession {
  chat_id: number;
  user_id: number;
  bot_id: number;
  state: "idle" | "awaiting_prompt";
  state_expires_at: string | null;
  history: ChatMessage[];
  updated_at: string;
}

/**
 * Retrieves a session for a given chat ID.
 * Parses the history from JSON into a ChatMessage array.
 * Returns null if no session is found.
 */
export async function getSession(chatId: number): Promise<ChatSession | null> {
  const row = await getQuery<{
    history: string | null;
    chat_id: number;
    user_id: number;
    bot_id: number;
    state: "idle" | "awaiting_prompt";
    state_expires_at: string | null;
    updated_at: string;
  }>("SELECT * FROM chat_sessions WHERE chat_id = ?", [chatId]);

  if (!row) {
    return null;
  }

  let history: ChatMessage[] = [];
  if (row.history) {
    try {
      history = JSON.parse(row.history);
    } catch (error) {
      logger.error({ err: error, chatId }, "Failed to parse session history");
      // Return empty history on parse failure
      history = [];
    }
  }

  return { ...row, history };
}

/**
 * Updates the history for a chat session, creating one if it doesn't exist.
 * The history is trimmed to the maximum allowed length.
 * @param chatId - The ID of the chat.
 * @param userId - The internal DB ID of the user.
 * @param botId - The internal DB ID of the bot.
 * @param userMessage - The new message from the user.
 * @param assistantMessage - The new message from the assistant.
 */
export async function updateHistory(
  chatId: number,
  userId: number,
  botId: number,
  userMessage: ChatMessage,
  assistantMessage: ChatMessage
): Promise<void> {
  const session = await getSession(chatId);
  const currentHistory = session ? session.history : [];

  const newHistory: ChatMessage[] = [
    ...currentHistory,
    userMessage,
    assistantMessage,
  ].slice(-MAX_HISTORY_MESSAGES); // Trim history to the last 10 messages

  const historyJson = JSON.stringify(newHistory);

  await runQuery(
    `INSERT INTO chat_sessions (chat_id, user_id, bot_id, history)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
     history = excluded.history,
     updated_at = CURRENT_TIMESTAMP`,
    [chatId, userId, botId, historyJson]
  );
}

/**
 * Sets the state of a chat session.
 * @param chatId - The ID of the chat.
 * @param state - The new state to set.
 * @param expiresInMinutes - How many minutes until the state expires (optional).
 */
export async function setSessionState(
  chatId: number,
  state: "idle" | "awaiting_prompt",
  expiresInMinutes?: number
): Promise<void> {
  let expiresAt: string | null = null;
  if (expiresInMinutes && expiresInMinutes > 0) {
    const expirationDate = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    expiresAt = expirationDate.toISOString();
  }

  await runQuery(
    `INSERT INTO chat_sessions (chat_id, user_id, bot_id, state, state_expires_at)
     VALUES (?, 0, 0, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
     state = excluded.state,
     state_expires_at = excluded.state_expires_at,
     updated_at = CURRENT_TIMESTAMP`,
    [chatId, state, expiresAt]
  );
}
