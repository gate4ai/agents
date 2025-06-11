import { $fetch } from "ofetch";
import logger from "../utils/logger";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const TELEGRAM_FILE_BASE = "https://api.telegram.org/file/bot";

export interface BotCommand {
  command: string;
  description: string;
}

/**
 * Sends a message to a Telegram user via a specific bot.
 * @param botToken The token of the bot sending the message.
 * @param chatId The ID of the chat to send the message to (user_id).
 * @param text The text of the message to send.
 */
export async function sendMessage(
  botToken: string,
  chatId: number,
  text: string
  // logger: PinoLogger // Optional: consider passing logger if more context is needed from caller
): Promise<void> {
  const serviceLogger = logger.child({
    service: "telegramService",
    botToken: botToken ? botToken.substring(0, 10) + "..." : undefined,
    chatId,
  });

  if (!botToken) {
    serviceLogger.error("sendMessage error: botToken is missing");
    return;
  }
  const url = `${TELEGRAM_API_BASE}${botToken}/sendMessage`;
  try {
    await $fetch(url, {
      method: "POST",
      body: {
        chat_id: chatId,
        text: text,
      },
    });
    serviceLogger.info(`Message sent successfully`); // Removed text from log for brevity/security
  } catch (error: unknown) {
    const err = error as Error;
    // It's good practice to include the error object for full details if the logger supports it.
    serviceLogger.error(
      { err, stack: err.stack },
      "Error sending Telegram message"
    );
  }
}

/**
 * Sets the list of bot commands that appear in the Telegram menu.
 * @param botToken The token of the bot.
 * @param commands Array of commands with their descriptions.
 */
export async function setBotCommands(
  botToken: string,
  commands: BotCommand[]
): Promise<void> {
  const serviceLogger = logger.child({
    service: "telegramService",
    botToken: botToken ? botToken.substring(0, 10) + "..." : undefined,
  });

  if (!botToken) {
    serviceLogger.error("setBotCommands error: botToken is missing");
    return;
  }

  const url = `${TELEGRAM_API_BASE}${botToken}/setMyCommands`;
  try {
    await $fetch(url, {
      method: "POST",
      body: {
        commands: commands,
      },
    });
    serviceLogger.info(`Bot commands set successfully`);
  } catch (error: unknown) {
    const err = error as Error;
    serviceLogger.error(
      { err, stack: err.stack },
      "Error setting bot commands"
    );
  }
}

/**
 * Gets information about a file (including file_path) by its ID.
 * @param botToken The bot token.
 * @param fileId The file ID.
 * @returns Promise that resolves to file info or null if error.
 */
export async function getFileInfo(
  botToken: string,
  fileId: string
): Promise<{ file_path: string } | null> {
  const serviceLogger = logger.child({
    service: "telegramService",
    botToken: botToken ? botToken.substring(0, 10) + "..." : undefined,
    fileId,
  });

  if (!botToken) {
    serviceLogger.error("getFileInfo error: botToken is missing");
    return null;
  }

  const url = `${TELEGRAM_API_BASE}${botToken}/getFile`;
  try {
    const response = await $fetch<{
      ok: boolean;
      result: { file_path: string };
    }>(url, {
      method: "POST",
      body: { file_id: fileId },
    });
    serviceLogger.info("File info retrieved successfully");
    return response.result;
  } catch (error: unknown) {
    const err = error as Error;
    serviceLogger.error(
      { err, stack: err.stack },
      "Error getting file info from Telegram"
    );
    return null;
  }
}

/**
 * Downloads a file from Telegram servers by its file_path.
 * @param botToken The bot token.
 * @param filePath The file path obtained from getFileInfo.
 * @returns Promise that resolves to Buffer with file content.
 */
export async function downloadFile(
  botToken: string,
  filePath: string
): Promise<Buffer> {
  const serviceLogger = logger.child({
    service: "telegramService",
    botToken: botToken ? botToken.substring(0, 10) + "..." : undefined,
    filePath,
  });

  const url = `${TELEGRAM_FILE_BASE}${botToken}/${filePath}`;
  try {
    const buffer = await $fetch(url, { responseType: "arrayBuffer" });
    serviceLogger.info("File downloaded successfully");
    return Buffer.from(buffer);
  } catch (error: unknown) {
    const err = error as Error;
    serviceLogger.error(
      { err, stack: err.stack },
      "Error downloading file from Telegram"
    );
    throw new Error(`Failed to download file: ${err.message}`);
  }
}
