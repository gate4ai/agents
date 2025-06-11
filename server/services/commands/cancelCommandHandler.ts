import type { Logger as PinoLogger } from "pino";
import type { TelegramMessage } from "~/server/types/telegram";
import { sendMessage, setBotCommands } from "../telegramService";
import { setSessionState } from "../sessionService";
import { STANDARD_COMMANDS } from "../constants";

export async function handleCancelCommand(
  botToken: string,
  message: TelegramMessage,
  logger: PinoLogger
) {
  const chatId = message.chat.id;
  const commandLogger = logger.child({ command: "/cancel", chatId });

  try {
    // Reset session state to idle
    await setSessionState(chatId, "idle");

    // Restore standard menu commands
    await setBotCommands(botToken, STANDARD_COMMANDS);

    await sendMessage(
      botToken,
      chatId,
      "❌ Operation cancelled. You can start a new command anytime."
    );

    commandLogger.info("Session state reset to idle and menu restored.");
  } catch (error) {
    const err = error as Error;
    commandLogger.error({ err }, "Error processing /cancel command.");
    await sendMessage(
      botToken,
      chatId,
      "Sorry, an error occurred while cancelling the operation."
    );
  }
}
