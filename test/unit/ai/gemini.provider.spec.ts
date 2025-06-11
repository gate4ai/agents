/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiProvider } from "~/server/services/ai/providers/gemini";

// Mock the Google Generative AI SDK
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      startChat: vi.fn().mockReturnValue({
        sendMessage: vi.fn(),
      }),
    }),
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: "BLOCK_MEDIUM_AND_ABOVE",
  },
}));

// Mock Google Cloud Speech
vi.mock("@google-cloud/speech", () => ({
  SpeechClient: vi.fn().mockImplementation(() => ({
    recognize: vi.fn(),
  })),
}));

// Mock useRuntimeConfig
vi.mock("#imports", () => ({
  useRuntimeConfig: vi.fn().mockReturnValue({
    googleCloudKeyFile: "/path/to/keyfile.json",
  }),
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

describe("GeminiProvider", () => {
  let provider: GeminiProvider;
  let mockGeminiInstance: any;
  let mockSpeechClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked constructors
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const { SpeechClient } = await import("@google-cloud/speech");

    provider = new GeminiProvider("test-api-key");

    // Get the mocked instances
    mockGeminiInstance = (GoogleGenerativeAI as any).mock.results[0].value;
    mockSpeechClient = (SpeechClient as any).mock.results[0].value;
  });

  describe("constructor", () => {
    it("should throw error if API key is not provided", () => {
      expect(() => new GeminiProvider("")).toThrow(
        "Google Gemini API key is required."
      );
    });

    it("should initialize successfully with valid API key", () => {
      expect(() => new GeminiProvider("valid-key")).not.toThrow();
    });
  });

  describe("generateTextResponse", () => {
    it("should generate text response successfully", async () => {
      const mockResponse = {
        response: {
          text: () => "Hello, this is a Gemini response!",
        },
      };

      const mockChat = {
        sendMessage: vi.fn().mockResolvedValue(mockResponse),
      };

      const mockModel = {
        startChat: vi.fn().mockReturnValue(mockChat),
      };

      mockGeminiInstance.getGenerativeModel.mockReturnValue(mockModel);

      const messages = [{ role: "user" as const, content: "Hello" }];

      const result = await provider.generateTextResponse(messages);

      expect(result).toBe("Hello, this is a Gemini response!");
      expect(mockChat.sendMessage).toHaveBeenCalledWith("Hello");
    });

    it("should handle empty response", async () => {
      const mockResponse = {
        response: {
          text: () => "",
        },
      };

      const mockChat = {
        sendMessage: vi.fn().mockResolvedValue(mockResponse),
      };

      const mockModel = {
        startChat: vi.fn().mockReturnValue(mockChat),
      };

      mockGeminiInstance.getGenerativeModel.mockReturnValue(mockModel);

      const messages = [{ role: "user" as const, content: "Hello" }];

      const result = await provider.generateTextResponse(messages);

      expect(result).toBe(
        "I received an empty response. Could you please rephrase?"
      );
    });

    it("should handle API errors", async () => {
      const mockChat = {
        sendMessage: vi.fn().mockRejectedValue(new Error("Gemini API Error")),
      };

      const mockModel = {
        startChat: vi.fn().mockReturnValue(mockChat),
      };

      mockGeminiInstance.getGenerativeModel.mockReturnValue(mockModel);

      const messages = [{ role: "user" as const, content: "Hello" }];

      const result = await provider.generateTextResponse(messages);

      expect(result).toBe(
        "Sorry, I encountered an error while contacting my AI service. Please try again later."
      );
    });
  });

  describe("transcribeAudio", () => {
    it("should transcribe audio successfully", async () => {
      const mockResponse = [
        {
          results: [
            {
              alternatives: [
                {
                  transcript:
                    "This is the transcribed text from Google Speech.",
                },
              ],
            },
          ],
        },
      ];

      mockSpeechClient.recognize.mockResolvedValue(mockResponse);

      const audioBuffer = Buffer.from("fake audio data");
      const result = await provider.transcribeAudio(audioBuffer);

      expect(result).toBe("This is the transcribed text from Google Speech.");
      expect(mockSpeechClient.recognize).toHaveBeenCalledWith({
        audio: {
          content: audioBuffer.toString("base64"),
        },
        config: {
          encoding: "OGG_OPUS",
          sampleRateHertz: 16000,
          languageCode: "en-US",
          audioChannelCount: 1,
        },
      });
    });

    it("should transcribe audio with specified language", async () => {
      const mockResponse = [
        {
          results: [
            {
              alternatives: [
                {
                  transcript: "Это транскрибированный текст от Google.",
                },
              ],
            },
          ],
        },
      ];

      mockSpeechClient.recognize.mockResolvedValue(mockResponse);

      const audioBuffer = Buffer.from("fake audio data");
      const result = await provider.transcribeAudio(audioBuffer, "ru-RU");

      expect(result).toBe("Это транскрибированный текст от Google.");
      expect(mockSpeechClient.recognize).toHaveBeenCalledWith({
        audio: {
          content: audioBuffer.toString("base64"),
        },
        config: {
          encoding: "OGG_OPUS",
          sampleRateHertz: 16000,
          languageCode: "ru-RU",
          audioChannelCount: 1,
        },
      });
    });

    it("should handle empty transcription", async () => {
      const mockResponse = [
        {
          results: [],
        },
      ];

      mockSpeechClient.recognize.mockResolvedValue(mockResponse);

      const audioBuffer = Buffer.from("fake audio data");
      const result = await provider.transcribeAudio(audioBuffer);

      expect(result).toBe(
        "I couldn't understand the audio. Could you please try again?"
      );
    });

    it("should handle transcription API errors", async () => {
      mockSpeechClient.recognize.mockRejectedValue(
        new Error("Google Speech API Error")
      );

      const audioBuffer = Buffer.from("fake audio data");
      const result = await provider.transcribeAudio(audioBuffer);

      expect(result).toBe(
        "Sorry, I encountered an error while transcribing your audio. Please try again later."
      );
    });
  });
});
