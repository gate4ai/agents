/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAIProvider } from "~/server/services/ai/providers/openai";

// Mock the OpenAI SDK
vi.mock("openai", () => {
  const mockOpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
    audio: {
      transcriptions: {
        create: vi.fn(),
      },
    },
  }));
  return { default: mockOpenAI };
});

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

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider;
  let mockOpenAIInstance: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked OpenAI constructor
    const OpenAI = (await import("openai")).default;
    provider = new OpenAIProvider("test-api-key");

    // Get the mocked instance
    mockOpenAIInstance = (OpenAI as any).mock.results[0].value;
  });

  describe("constructor", () => {
    it("should throw error if API key is not provided", () => {
      expect(() => new OpenAIProvider("")).toThrow(
        "OpenAI API key is required."
      );
    });

    it("should initialize successfully with valid API key", () => {
      expect(() => new OpenAIProvider("valid-key")).not.toThrow();
    });
  });

  describe("generateTextResponse", () => {
    it("should generate text response successfully", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "Hello, this is a test response!",
            },
          },
        ],
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValue(
        mockResponse
      );

      const messages = [{ role: "user" as const, content: "Hello" }];

      const result = await provider.generateTextResponse(messages);

      expect(result).toBe("Hello, this is a test response!");
      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith({
        model: "gpt-3.5-turbo",
        messages: messages,
        temperature: 0.7,
      });
    });

    it("should handle empty response", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValue(
        mockResponse
      );

      const messages = [{ role: "user" as const, content: "Hello" }];

      const result = await provider.generateTextResponse(messages);

      expect(result).toBe(
        "I received an empty response. Could you please rephrase?"
      );
    });

    it("should handle API errors", async () => {
      mockOpenAIInstance.chat.completions.create.mockRejectedValue(
        new Error("API Error")
      );

      const messages = [{ role: "user" as const, content: "Hello" }];

      const result = await provider.generateTextResponse(messages);

      expect(result).toBe(
        "Sorry, I encountered an error while contacting my AI service. Please try again later."
      );
    });
  });

  describe("transcribeAudio", () => {
    it("should transcribe audio successfully", async () => {
      const mockTranscription = {
        text: "This is the transcribed text from audio.",
      };

      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue(
        mockTranscription
      );

      const audioBuffer = Buffer.from("fake audio data");
      const result = await provider.transcribeAudio(audioBuffer);

      expect(result).toBe("This is the transcribed text from audio.");
      expect(
        mockOpenAIInstance.audio.transcriptions.create
      ).toHaveBeenCalledWith({
        file: expect.any(File),
        model: "whisper-1",
        language: undefined,
      });
    });

    it("should transcribe audio with specified language", async () => {
      const mockTranscription = {
        text: "Это транскрибированный текст.",
      };

      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue(
        mockTranscription
      );

      const audioBuffer = Buffer.from("fake audio data");
      const result = await provider.transcribeAudio(audioBuffer, "ru");

      expect(result).toBe("Это транскрибированный текст.");
      expect(
        mockOpenAIInstance.audio.transcriptions.create
      ).toHaveBeenCalledWith({
        file: expect.any(File),
        model: "whisper-1",
        language: "ru",
      });
    });

    it("should handle empty transcription", async () => {
      const mockTranscription = {
        text: "",
      };

      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue(
        mockTranscription
      );

      const audioBuffer = Buffer.from("fake audio data");
      const result = await provider.transcribeAudio(audioBuffer);

      expect(result).toBe(
        "I couldn't understand the audio. Could you please try again?"
      );
    });

    it("should handle transcription API errors", async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockRejectedValue(
        new Error("Transcription API Error")
      );

      const audioBuffer = Buffer.from("fake audio data");
      const result = await provider.transcribeAudio(audioBuffer);

      expect(result).toBe(
        "Sorry, I encountered an error while transcribing your audio. Please try again later."
      );
    });
  });
});
