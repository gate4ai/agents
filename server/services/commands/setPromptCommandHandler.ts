import type { Logger as PinoLogger } from "pino";
import type { TelegramMessage } from "~/server/types/telegram";
import { sendMessage, setBotCommands } from "../telegramService";
import { CONTEXTUAL_COMMANDS } from "../constants";
import { getBotByToken, getUserByTelegramId } from "../botUserService";
import { setSessionState } from "../sessionService";

export async function handleSetPromptCommand(
  botToken: string,
  message: TelegramMessage,
  logger: PinoLogger
) {
  const chatId = message.chat.id;
  const telegramUserId = message.from?.id;

  const commandLogger = logger.child({ command: "/setprompt", chatId });

  if (!telegramUserId) {
    commandLogger.warn(
      "Cannot execute /setprompt: telegram user ID is missing."
    );
    return;
  }

  try {
    const [user, bot] = await Promise.all([
      getUserByTelegramId(telegramUserId),
      getBotByToken(botToken),
    ]);

    if (!user) {
      await sendMessage(
        botToken,
        chatId,
        "I can't find your user profile. Please type /start first."
      );
      return;
    }
    if (!bot) {
      commandLogger.error({ botToken }, "Critical: Bot not found in database.");
      await sendMessage(botToken, chatId, "Error: This bot is not registered.");
      return;
    }

    // Set session state to await prompt input
    await setSessionState(chatId, "awaiting_prompt", 5);

    // Change bot commands to contextual menu (only cancel)
    await setBotCommands(botToken, CONTEXTUAL_COMMANDS);

    await sendMessage(
      botToken,
      chatId,
      "🤖 Please enter your new system prompt for this bot.\n\n" +
        "This will define how the bot behaves and responds to your messages.\n\n" +
        '💡 *Example:* "You are a helpful coding assistant who explains concepts clearly."\n\n' +
        "To cancel, send /cancel"
    );

    commandLogger.info(
      { userId: user.id, botId: bot.id },
      "Session state set to awaiting_prompt and contextual menu activated."
    );
  } catch (error) {
    const err = error as Error;
    commandLogger.error({ err }, "Error processing /setprompt command.");
    await sendMessage(
      botToken,
      chatId,
      "Sorry, an error occurred while processing your request."
    );
  }
}
