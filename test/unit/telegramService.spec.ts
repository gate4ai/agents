/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendMessage,
  setBotCommands,
  getFileInfo,
  downloadFile,
} from "~/server/services/telegramService";

// Mock ofetch
vi.mock("ofetch", () => ({
  $fetch: vi.fn(),
}));

// Mock logger
vi.mock("~/server/utils/logger", () => ({
  default: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe("telegramService", () => {
  let mockFetch: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { $fetch } = await import("ofetch");
    mockFetch = vi.mocked($fetch);
  });

  describe("sendMessage", () => {
    it("should send message successfully", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await sendMessage("test-token", 123, "Hello World");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest-token/sendMessage",
        {
          method: "POST",
          body: {
            chat_id: 123,
            text: "Hello World",
          },
        }
      );
    });

    it("should handle missing bot token", async () => {
      await sendMessage("", 123, "Hello World");

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle API errors", async () => {
      mockFetch.mockRejectedValue(new Error("API Error"));

      await sendMessage("test-token", 123, "Hello World");

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("setBotCommands", () => {
    it("should set bot commands successfully", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const commands = [
        { command: "start", description: "Start the bot" },
        { command: "help", description: "Get help" },
      ];

      await setBotCommands("test-token", commands);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest-token/setMyCommands",
        {
          method: "POST",
          body: {
            commands: commands,
          },
        }
      );
    });

    it("should handle missing bot token", async () => {
      const commands = [{ command: "start", description: "Start the bot" }];

      await setBotCommands("", commands);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("getFileInfo", () => {
    it("should get file info successfully", async () => {
      const mockResponse = {
        ok: true,
        result: {
          file_path: "voice/file_123.oga",
        },
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await getFileInfo("test-token", "FILE_ID_123");

      expect(result).toEqual({ file_path: "voice/file_123.oga" });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest-token/getFile",
        {
          method: "POST",
          body: { file_id: "FILE_ID_123" },
        }
      );
    });

    it("should handle missing bot token", async () => {
      const result = await getFileInfo("", "FILE_ID_123");

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle API errors", async () => {
      mockFetch.mockRejectedValue(new Error("API Error"));

      const result = await getFileInfo("test-token", "FILE_ID_123");

      expect(result).toBeNull();
    });
  });

  describe("downloadFile", () => {
    it("should download file successfully", async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      mockFetch.mockResolvedValue(mockArrayBuffer);

      const result = await downloadFile("test-token", "voice/file_123.oga");

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(8);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/file/bottest-token/voice/file_123.oga",
        { responseType: "arrayBuffer" }
      );
    });

    it("should handle download errors", async () => {
      mockFetch.mockRejectedValue(new Error("Download Error"));

      await expect(
        downloadFile("test-token", "voice/file_123.oga")
      ).rejects.toThrow("Failed to download file: Download Error");
    });
  });
});
