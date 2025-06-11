import { findOrCreateUser } from "~/server/services/authService";
import { sendMessage, setBotCommands } from "~/server/services/telegramService";
import { STANDARD_COMMANDS } from "~/server/services/constants";
import type { TelegramMessage } from "~/server/types/telegram";
import type { User } from "~/server/services/authService";
import type { Logger as PinoLogger } from "pino";

interface StartCommandResult {
  status: "ok" | "error";
  message: string;
  user?: User;
}

export async function handleStartCommand(
  botToken: string,
  message: TelegramMessage,
  logger: PinoLogger
): Promise<StartCommandResult> {
  const chatId = message.chat.id;
  const telegramUser = message.from;
  const firstName = telegramUser?.first_name || "User";

  const commandLogger = logger.child({
    command: "/start",
    userId: telegramUser?.id,
    chatId,
  });

  if (!telegramUser) {
    commandLogger.warn("User object not found in message for /start command");
    return {
      status: "error",
      message: "User details missing in /start command",
    };
  }

  try {
    commandLogger.info("Processing /start command");
    const user = await findOrCreateUser(telegramUser);
    const welcomeMessage = `Hello, ${firstName}! Welcome to the bot. You can now use commands like /bots and /setprompt.`;

    await sendMessage(botToken, chatId, welcomeMessage);

    // Set bot commands menu
    await setBotCommands(botToken, STANDARD_COMMANDS);

    commandLogger.info(
      "Successfully processed /start and sent welcome message."
    );
    return {
      status: "ok",
      message: "Start command processed successfully",
      user,
    };
  } catch (error: unknown) {
    const err = error as Error;
    commandLogger.error(
      { err, stack: err.stack },
      "Error processing /start command"
    );
    await sendMessage(
      botToken,
      chatId,
      "An error occurred. Please try again later."
    );
    return {
      status: "error",
      message: "Failed to process /start command",
    };
  }
}
