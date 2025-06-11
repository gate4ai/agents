import type { Logger as PinoLogger } from "pino";
import type { TelegramMessage } from "~/server/types/telegram";
import { sendMessage } from "../telegramService";
import {
  getAllBots,
  getUserBots,
  getUserByTelegramId,
} from "../botUserService";

export async function handleBotsCommand(
  botToken: string,
  message: TelegramMessage,
  logger: PinoLogger
) {
  const chatId = message.chat.id;
  const telegramUserId = message.from?.id;

  const commandLogger = logger.child({ command: "/bots", chatId });

  if (!telegramUserId) {
    commandLogger.warn("Cannot execute /bots: telegram user ID is missing.");
    return;
  }

  try {
    const user = await getUserByTelegramId(telegramUserId);
    if (!user) {
      await sendMessage(
        botToken,
        chatId,
        "I can't find your user profile. Please type /start first."
      );
      return;
    }

    const allBots = await getAllBots();
    if (allBots.length === 0) {
      await sendMessage(
        botToken,
        chatId,
        "There are no bots available currently."
      );
      return;
    }

    const userBotSettings = await getUserBots(user.id);
    const userBotMap = new Map(
      userBotSettings.map((setting) => [setting.bot_id, setting.prompt])
    );

    // Separate bots into configured and available
    const configuredBots = allBots.filter((bot) => userBotMap.has(bot.id));
    const availableBots = allBots.filter((bot) => !userBotMap.has(bot.id));

    let responseText = "🤖 **Your Bots**\n\n";

    // Show configured bots first
    if (configuredBots.length > 0) {
      responseText += "**✅ Configured Bots:**\n";
      for (const bot of configuredBots) {
        const botName = bot.name || `Bot ID ${bot.id}`;
        const botLink = bot.username
          ? `[${botName}](https://t.me/${bot.username})`
          : botName;
        const customPrompt = userBotMap.get(bot.id);
        responseText += `🤖 ${botLink}\n`;
        responseText += `   *Prompt:* \`${customPrompt}\`\n\n`;
      }
    }

    // Show available bots
    if (availableBots.length > 0) {
      responseText += "**📋 Available Bots:**\n";
      for (const bot of availableBots) {
        const botName = bot.name || `Bot ID ${bot.id}`;
        const botLink = bot.username
          ? `[${botName}](https://t.me/${bot.username})`
          : botName;
        responseText += `🤖 ${botLink}\n`;
        responseText += `   *Status:* Using default prompt\n\n`;
      }
    }

    responseText +=
      "💡 *Tip:* Use `/setprompt` to customize any bot's behavior!";

    await sendMessage(botToken, chatId, responseText);
    commandLogger.info("Successfully listed bots for the user.");
  } catch (error) {
    const err = error as Error;
    commandLogger.error({ err }, "Error processing /bots command.");
    await sendMessage(
      botToken,
      chatId,
      "Sorry, an error occurred while fetching the bot list."
    );
  }
}
