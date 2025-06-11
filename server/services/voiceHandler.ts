import type { TelegramMessage } from "~/server/types/telegram";
import type { Logger } from "pino";
import { getFileInfo, downloadFile } from "./telegramService";
import ASRManager from "./ai/ASRManager";
import { handleTextMessage } from "./messageHandler";

/**
 * Handles voice messages by transcribing them and passing to text handler.
 * @param botToken The bot token for file operations.
 * @param message The original message containing voice data.
 * @param logger Logger instance for this operation.
 */
export async function handleVoiceMessage(
  botToken: string,
  message: TelegramMessage,
  logger: Logger
): Promise<void> {
  const voice = message.voice;
  if (!voice) {
    logger.warn("handleVoiceMessage called with message without voice data");
    return;
  }

  logger.info(
    {
      voiceFileId: voice.file_id,
      duration: voice.duration,
      mimeType: voice.mime_type,
    },
    "Processing voice message"
  );

  try {
    // Step 1: Get file info from Telegram
    const fileInfo = await getFileInfo(botToken, voice.file_id);
    if (!fileInfo) {
      logger.error("Failed to get file info from Telegram");
      return;
    }

    logger.info({ filePath: fileInfo.file_path }, "Retrieved file info");

    // Step 2: Download the audio file
    const audioBuffer = await downloadFile(botToken, fileInfo.file_path);
    logger.info({ bufferSize: audioBuffer.length }, "Downloaded audio file");

    // Step 3: Transcribe the audio
    const transcribedText = await ASRManager.transcribeAudio(audioBuffer);
    logger.info({ transcribedText }, "Audio transcribed successfully");

    // Step 4: Create a modified message with transcribed text
    const textMessage: TelegramMessage = {
      ...message,
      text: transcribedText,
      // Remove voice property to treat it as text message
      voice: undefined,
    };

    // Step 5: Pass to text message handler
    await handleTextMessage(botToken, textMessage, logger);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error({ err, stack: err.stack }, "Error processing voice message");
  }
}
