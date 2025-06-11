import { defineEventHandler, readBody, getHeader } from "h3";
import type { H3Event } from "h3";
import { handleStartCommand } from "~/server/services/commands/startCommandHandler";
import { handleSetPromptCommand } from "~/server/services/commands/setPromptCommandHandler";
import { handleBotsCommand } from "~/server/services/commands/botsCommandHandler";
import { handleCancelCommand } from "~/server/services/commands/cancelCommandHandler";
import { handleTextMessage } from "~/server/services/messageHandler";
import { handleVoiceMessage } from "~/server/services/voiceHandler";
import type { TelegramUpdate, TelegramMessage } from "~/server/types/telegram";
import { useRuntimeConfig } from "#imports";
import logger from "~/server/utils/logger";

export default defineEventHandler(async (event: H3Event) => {
  const config = useRuntimeConfig();
  const expectedSecretToken = config.telegramBotApiSecretToken as string;
  const requestBotToken = event.context.params?.botToken as string;

  const childLogger = logger.child({
    botToken: requestBotToken
      ? requestBotToken.substring(0, 10) + "..."
      : "undefined",
  });

  if (expectedSecretToken) {
    const receivedSecretToken = getHeader(
      event,
      "X-Telegram-Bot-Api-Secret-Token"
    );
    if (receivedSecretToken !== expectedSecretToken) {
      childLogger.error(
        "Webhook error: Invalid X-Telegram-Bot-Api-Secret-Token"
      );
      event.node.res.statusCode = 403;
      return { status: "error", message: "Forbidden: Invalid secret token" };
    }
    childLogger.info("X-Telegram-Bot-Api-Secret-Token validated successfully.");
  }

  if (!requestBotToken) {
    logger.error("Webhook error: Bot token is missing in URL");
    event.node.res.statusCode = 400;
    return { status: "error", message: "Bot token missing" };
  }

  childLogger.info("Webhook event received");

  try {
    const body = await readBody<TelegramUpdate>(event);
    childLogger.debug({ webhookBody: body }, "Webhook body received");

    if (body?.message) {
      const message = body.message as TelegramMessage;
      childLogger.info(
        { messageId: message.message_id, chatId: message.chat.id },
        "Processing message update"
      );

      if (message.text) {
        if (message.text.startsWith("/start")) {
          await handleStartCommand(requestBotToken, message, childLogger);
        } else if (message.text.startsWith("/setprompt")) {
          await handleSetPromptCommand(requestBotToken, message, childLogger);
        } else if (message.text.startsWith("/bots")) {
          await handleBotsCommand(requestBotToken, message, childLogger);
        } else if (message.text.startsWith("/cancel")) {
          await handleCancelCommand(requestBotToken, message, childLogger);
        } else {
          await handleTextMessage(requestBotToken, message, childLogger);
        }
      } else if (message.voice) {
        await handleVoiceMessage(requestBotToken, message, childLogger);
      } else {
        childLogger.info(
          { chatId: message.chat.id },
          "Received a non-text/voice message. No handler implemented."
        );
      }
      return { status: "ok", message: "Webhook processed" };
    } else {
      childLogger.warn(
        { updateId: body?.update_id },
        "Received an update without a message body."
      );
      return { status: "ok", message: "Non-message update received" };
    }
  } catch (error: unknown) {
    const err = error as Error;
    childLogger.error({ err, stack: err.stack }, "Error processing webhook");
    event.node.res.statusCode = 500;
    return {
      status: "error",
      message: "Internal server error",
      details: err.message,
    };
  }
});
