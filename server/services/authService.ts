import { getQuery, runQuery } from "../db";
import type { TelegramUser } from "../types/telegram";
import logger from "../utils/logger";

export interface User {
  id: number; // Internal DB ID
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  language_code: string | null;
  is_bot: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Retrieves a user by their Telegram ID. If the user doesn't exist,
 * creates a new one.
 * @param telegramUser The user object from the Telegram message.
 * @returns The full user object from the database.
 */
export async function findOrCreateUser(
  telegramUser: TelegramUser
): Promise<User> {
  const {
    id: telegram_id,
    first_name,
    last_name,
    username,
    language_code,
    is_bot,
  } = telegramUser;

  let user = await getQuery<User>("SELECT * FROM users WHERE telegram_id = ?", [
    telegram_id,
  ]);

  if (!user) {
    logger.info(
      { telegram_id, username },
      `User not found. Creating new user.`
    );
    await runQuery(
      `INSERT INTO users (telegram_id, first_name, last_name, username, language_code, is_bot) VALUES (?, ?, ?, ?, ?, ?)`,
      [telegram_id, first_name, last_name, username, language_code, is_bot]
    );
    user = await getQuery<User>("SELECT * FROM users WHERE telegram_id = ?", [
      telegram_id,
    ]);
    if (!user) {
      // This should not happen
      throw new Error("Failed to create or find user after insertion.");
    }
    logger.info({ userId: user.id, telegram_id }, "New user created.");
  }

  return user;
}
