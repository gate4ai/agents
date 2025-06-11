/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleVoiceMessage } from "~/server/services/voiceHandler";
import type { TelegramMessage } from "~/server/types/telegram";

// Mock dependencies
vi.mock("~/server/services/telegramService", () => ({
  getFileInfo: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock("~/server/services/ai/ASRManager", () => ({
  default: {
    transcribeAudio: vi.fn(),
  },
}));

vi.mock("~/server/services/messageHandler", () => ({
  handleTextMessage: vi.fn(),
}));

describe("voiceHandler", () => {
  let mockGetFileInfo: any;
  let mockDownloadFile: any;
  let mockTranscribeAudio: any;
  let mockHandleTextMessage: any;
  let mockLogger: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const telegramService = await import("~/server/services/telegramService");
    const ASRManager = await import("~/server/services/ai/ASRManager");
    const messageHandler = await import("~/server/services/messageHandler");

    mockGetFileInfo = vi.mocked(telegramService.getFileInfo);
    mockDownloadFile = vi.mocked(telegramService.downloadFile);
    mockTranscribeAudio = vi.mocked(ASRManager.default.transcribeAudio);
    mockHandleTextMessage = vi.mocked(messageHandler.handleTextMessage);

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  it("should process voice message successfully", async () => {
    // Setup mocks
    const mockFileInfo = { file_path: "voice/file_123.oga" };
    const mockAudioBuffer = Buffer.from("fake audio data");
    const mockTranscribedText = "Hello, this is transcribed text";

    mockGetFileInfo.mockResolvedValue(mockFileInfo);
    mockDownloadFile.mockResolvedValue(mockAudioBuffer);
    mockTranscribeAudio.mockResolvedValue(mockTranscribedText);
    mockHandleTextMessage.mockResolvedValue(undefined);

    // Create test message
    const voiceMessage: TelegramMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: Date.now() / 1000,
      voice: {
        file_id: "FILE_ID_123",
        file_unique_id: "unique_123",
        duration: 5,
        mime_type: "audio/ogg",
      },
    };

    // Execute
    await handleVoiceMessage("test-token", voiceMessage, mockLogger);

    // Verify
    expect(mockGetFileInfo).toHaveBeenCalledWith("test-token", "FILE_ID_123");
    expect(mockDownloadFile).toHaveBeenCalledWith(
      "test-token",
      "voice/file_123.oga"
    );
    expect(mockTranscribeAudio).toHaveBeenCalledWith(mockAudioBuffer);
    expect(mockHandleTextMessage).toHaveBeenCalledWith(
      "test-token",
      {
        ...voiceMessage,
        text: mockTranscribedText,
        voice: undefined,
      },
      mockLogger
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        voiceFileId: "FILE_ID_123",
        duration: 5,
        mimeType: "audio/ogg",
      },
      "Processing voice message"
    );
  });

  it("should handle message without voice data", async () => {
    const messageWithoutVoice: TelegramMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: Date.now() / 1000,
      text: "This is a text message",
    };

    await handleVoiceMessage("test-token", messageWithoutVoice, mockLogger);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "handleVoiceMessage called with message without voice data"
    );
    expect(mockGetFileInfo).not.toHaveBeenCalled();
  });

  it("should handle file info retrieval failure", async () => {
    mockGetFileInfo.mockResolvedValue(null);

    const voiceMessage: TelegramMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: Date.now() / 1000,
      voice: {
        file_id: "FILE_ID_123",
        file_unique_id: "unique_123",
        duration: 5,
      },
    };

    await handleVoiceMessage("test-token", voiceMessage, mockLogger);

    expect(mockGetFileInfo).toHaveBeenCalledWith("test-token", "FILE_ID_123");
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to get file info from Telegram"
    );
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it("should handle download failure", async () => {
    const mockFileInfo = { file_path: "voice/file_123.oga" };
    mockGetFileInfo.mockResolvedValue(mockFileInfo);
    mockDownloadFile.mockRejectedValue(new Error("Download failed"));

    const voiceMessage: TelegramMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: Date.now() / 1000,
      voice: {
        file_id: "FILE_ID_123",
        file_unique_id: "unique_123",
        duration: 5,
      },
    };

    await handleVoiceMessage("test-token", voiceMessage, mockLogger);

    expect(mockDownloadFile).toHaveBeenCalledWith(
      "test-token",
      "voice/file_123.oga"
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        stack: expect.any(String),
      }),
      "Error processing voice message"
    );
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
  });

  it("should handle transcription failure", async () => {
    const mockFileInfo = { file_path: "voice/file_123.oga" };
    const mockAudioBuffer = Buffer.from("fake audio data");

    mockGetFileInfo.mockResolvedValue(mockFileInfo);
    mockDownloadFile.mockResolvedValue(mockAudioBuffer);
    mockTranscribeAudio.mockRejectedValue(new Error("Transcription failed"));

    const voiceMessage: TelegramMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: Date.now() / 1000,
      voice: {
        file_id: "FILE_ID_123",
        file_unique_id: "unique_123",
        duration: 5,
      },
    };

    await handleVoiceMessage("test-token", voiceMessage, mockLogger);

    expect(mockTranscribeAudio).toHaveBeenCalledWith(mockAudioBuffer);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        stack: expect.any(String),
      }),
      "Error processing voice message"
    );
    expect(mockHandleTextMessage).not.toHaveBeenCalled();
  });
});
