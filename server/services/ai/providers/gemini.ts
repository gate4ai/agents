import {
  GoogleGenerativeAI,
  type Content,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { SpeechClient } from "@google-cloud/speech";
import type { AIProvider, ChatMessage, GenerationOptions } from "../types";
import logger from "~/server/utils/logger";
import { useRuntimeConfig } from "#imports";

export class GeminiProvider implements AIProvider {
  private gemini: GoogleGenerativeAI;
  private speechClient: SpeechClient | null = null;
  private serviceLogger = logger.child({ service: "GeminiProvider" });

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Google Gemini API key is required.");
    }
    this.gemini = new GoogleGenerativeAI(apiKey);

    // Initialize Google Cloud Speech client if key file is available
    const config = useRuntimeConfig();
    if (config.googleCloudKeyFile) {
      try {
        this.speechClient = new SpeechClient({
          keyFilename: config.googleCloudKeyFile,
        });
        this.serviceLogger.info("Google Cloud Speech client initialized.");
      } catch (error) {
        this.serviceLogger.warn(
          { err: error },
          "Failed to initialize Google Cloud Speech client. Audio transcription will not be available."
        );
      }
    } else {
      this.serviceLogger.info(
        "Google Cloud key file not provided. Audio transcription will not be available."
      );
    }

    this.serviceLogger.info("GeminiProvider initialized.");
  }

  /**
   * Maps our generic ChatMessage array to the format expected by Google's SDK.
   * It also separates the system prompt, as Gemini handles it differently.
   */
  private mapMessages(messages: ChatMessage[]): {
    history: Content[];
    lastUserMessage: string;
    systemInstruction?: string;
  } {
    const history: Content[] = [];
    let systemInstruction: string | undefined;
    let lastUserMessage: string = "";

    // Corrected: Use a compatible way to find the last system message
    const systemMessage = messages
      .slice()
      .reverse()
      .find((m) => m.role === "system");

    if (systemMessage) {
      systemInstruction = systemMessage.content;
    }

    // Filter out system messages and map roles for history
    const chatMessages = messages.filter((m) => m.role !== "system");

    chatMessages.forEach((message, index) => {
      const isLastMessage = index === chatMessages.length - 1;

      if (isLastMessage && message.role === "user") {
        lastUserMessage = message.content;
      } else {
        history.push({
          // Google uses 'model' for the assistant's role
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        });
      }
    });

    return { history, lastUserMessage, systemInstruction };
  }

  async generateTextResponse(
    messages: ChatMessage[],
    options?: GenerationOptions
  ): Promise<string> {
    const modelName = options?.model || "gemini-1.5-flash-latest";
    this.serviceLogger.info(
      { model: modelName, messageCount: messages.length },
      "Requesting chat completion from Google Gemini."
    );

    try {
      const { history, lastUserMessage, systemInstruction } =
        this.mapMessages(messages);

      if (!lastUserMessage) {
        this.serviceLogger.warn("No user message found to send to Gemini.");
        return "It seems there was no message to process. Please try again.";
      }

      const model = this.gemini.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: {
          temperature: options?.temperature || 0.7,
        },
        // Safety settings can be adjusted as needed
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
      });

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastUserMessage);
      const response = result.response;
      const responseText = response.text();

      if (!responseText) {
        this.serviceLogger.warn(
          { response },
          "Received an empty response from Gemini."
        );
        return "I received an empty response. Could you please rephrase?";
      }

      this.serviceLogger.info("Successfully received response from Gemini.");
      return responseText;
    } catch (error: unknown) {
      this.serviceLogger.error(
        { err: error },
        "Error calling Google Gemini API"
      );
      return "Sorry, I encountered an error while contacting my AI service. Please try again later.";
    }
  }

  async transcribeAudio(
    audioBuffer: Buffer,
    language?: string
  ): Promise<string> {
    this.serviceLogger.info(
      { bufferSize: audioBuffer.length, language },
      "Requesting audio transcription from Google Cloud Speech-to-Text."
    );

    if (!this.speechClient) {
      this.serviceLogger.error(
        "Google Cloud Speech client is not initialized."
      );
      return "Sorry, audio transcription is not available. Please configure Google Cloud credentials.";
    }

    try {
      const request = {
        audio: {
          content: audioBuffer.toString("base64"),
        },
        config: {
          encoding: "OGG_OPUS" as const,
          sampleRateHertz: 16000,
          languageCode: language || "en-US",
          audioChannelCount: 1,
        },
      };

      const [response] = await this.speechClient.recognize(request);
      const transcription = response.results
        ?.map((result) => result.alternatives?.[0]?.transcript)
        .filter(Boolean)
        .join(" ");

      if (!transcription) {
        this.serviceLogger.warn(
          "Received empty transcription from Google Cloud Speech."
        );
        return "I couldn't understand the audio. Could you please try again?";
      }

      this.serviceLogger.info(
        "Successfully transcribed audio with Google Cloud Speech."
      );
      return transcription;
    } catch (error: unknown) {
      this.serviceLogger.error(
        { err: error },
        "Error calling Google Cloud Speech API"
      );
      return "Sorry, I encountered an error while transcribing your audio. Please try again later.";
    }
  }
}
