import type { Logger as PinoLogger } from "pino";
import type { TelegramMessage } from "~/server/types/telegram";
import AIManager from "./ai/AIManager";
import type { ChatMessage } from "./ai/types";
import { sendMessage, setBotCommands } from "./telegramService";
import { STANDARD_COMMANDS } from "./constants";
import {
  getBotByToken,
  getUserByTelegramId,
  getUserBotPrompt,
  setUserBotPrompt,
} from "./botUserService";
import { getSession, updateHistory, setSessionState } from "./sessionService";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

export async function handleTextMessage(
  botToken: string,
  message: TelegramMessage,
  logger: PinoLogger
) {
  const chatId = message.chat.id;
  const telegramUserId = message.from?.id;
  const text = message.text;
  const messageLogger = logger.child({ handler: "handleTextMessage", chatId });

  if (!telegramUserId || !text) {
    messageLogger.warn("Cannot handle message: missing user ID or text.");
    return;
  }

  try {
    // Fetch user and bot details first, as they are required for session and prompts
    const [user, bot] = await Promise.all([
      getUserByTelegramId(telegramUserId),
      getBotByToken(botToken),
    ]);

    // A user and bot must exist in the database to proceed.
    // The /start command should have created the user.
    if (!user || !bot) {
      messageLogger.error(
        { foundUser: !!user, foundBot: !!bot },
        "Critical: User or Bot not found in DB. Cannot process message."
      );
      await sendMessage(
        botToken,
        chatId,
        "An error occurred. Please try using the /start command first."
      );
      return;
    }

    // Check session state first
    const session = await getSession(chatId);

    // Handle awaiting_prompt state
    if (session?.state === "awaiting_prompt") {
      const now = new Date();
      const expiresAt = session.state_expires_at
        ? new Date(session.state_expires_at)
        : null;

      if (expiresAt && now > expiresAt) {
        // State has expired, reset to idle and process as normal message
        await setSessionState(chatId, "idle");
        // Restore standard menu commands
        await setBotCommands(botToken, STANDARD_COMMANDS);
        await sendMessage(
          botToken,
          chatId,
          "⏰ Prompt input mode has expired. Processing your message normally."
        );
      } else {
        // State is still valid, save the prompt
        await setUserBotPrompt(user.id, bot.id, text);
        await setSessionState(chatId, "idle");

        // Restore standard menu commands
        await setBotCommands(botToken, STANDARD_COMMANDS);

        await sendMessage(
          botToken,
          chatId,
          "✅ Prompt successfully updated! Your bot will now behave according to your instructions."
        );

        messageLogger.info(
          { userId: user.id, botId: bot.id },
          "User prompt updated successfully via stateful command."
        );
        return; // Don't process as regular message
      }
    }

    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    const customPrompt = await getUserBotPrompt(user.id, bot.id);
    if (customPrompt) {
      systemPrompt = customPrompt;
      messageLogger.info(
        { userId: user.id, botId: bot.id },
        "Using custom user prompt."
      );
    }

    const conversationHistory = session ? session.history : [];

    const userMessage: ChatMessage = { role: "user", content: text };

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      userMessage,
    ];

    const aiResponseText = await AIManager.generateTextResponse(messages);

    await sendMessage(botToken, chatId, aiResponseText);
    messageLogger.info("Successfully sent AI response.");

    // After successfully sending the message, update the history
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: aiResponseText,
    };
    await updateHistory(chatId, user.id, bot.id, userMessage, assistantMessage);
    messageLogger.info("Conversation history updated.");
  } catch (error) {
    const err = error as Error;
    messageLogger.error({ err }, "Error processing text message.");
    await sendMessage(
      botToken,
      chatId,
      "Sorry, I encountered an error while processing your message."
    );
  }
}
