import { getQuery, runQuery, allQuery } from "~/server/db";
import type { User } from "./authService";

export interface Bot {
  id: number;
  token: string;
  name: string | null;
  username: string | null;
  telegram_id: number | null;
}

export interface UserBot {
  user_id: number;
  bot_id: number;
  prompt: string | null;
  is_active: boolean;
}

/**
 * Retrieves a bot from the database by its token.
 */
export async function getBotByToken(token: string): Promise<Bot | undefined> {
  return getQuery<Bot>("SELECT * FROM bots WHERE token = ?", [token]);
}

/**
 * Retrieves a user from the database by their Telegram ID.
 */
export async function getUserByTelegramId(
  telegramId: number
): Promise<User | undefined> {
  return getQuery<User>("SELECT * FROM users WHERE telegram_id = ?", [
    telegramId,
  ]);
}

/**
 * Creates or updates the settings (e.g., prompt) for a user-bot relationship.
 */
export async function setUserBotPrompt(
  userId: number,
  botId: number,
  prompt: string
): Promise<void> {
  await runQuery(
    `INSERT INTO user_bots (user_id, bot_id, prompt) VALUES (?, ?, ?) 
     ON CONFLICT(user_id, bot_id) DO UPDATE SET 
     prompt = excluded.prompt, 
     updated_at = CURRENT_TIMESTAMP`,
    [userId, botId, prompt]
  );
}

/**
 * Retrieves the custom prompt for a specific user and bot.
 */
export async function getUserBotPrompt(
  userId: number,
  botId: number
): Promise<string | null> {
  const result = await getQuery<{ prompt: string }>(
    "SELECT prompt FROM user_bots WHERE user_id = ? AND bot_id = ?",
    [userId, botId]
  );
  return result?.prompt || null;
}

/**
 * Retrieves all bots from the database.
 */
export async function getAllBots(): Promise<Bot[]> {
  return allQuery<Bot>(
    "SELECT id, name, username FROM bots WHERE is_active = 1"
  );
}

/**
 * Retrieves all bot settings for a specific user.
 */
export async function getUserBots(userId: number): Promise<UserBot[]> {
  return allQuery<UserBot>(
    "SELECT bot_id, prompt FROM user_bots WHERE user_id = ?",
    [userId]
  );
}
