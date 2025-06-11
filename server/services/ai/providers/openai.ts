import OpenAI from "openai";
import type { AIProvider, ChatMessage, GenerationOptions } from "../types";
import logger from "~/server/utils/logger";

export class OpenAIProvider implements AIProvider {
  private openai: OpenAI;
  private serviceLogger = logger.child({ service: "OpenAIProvider" });

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenAI API key is required.");
    }
    this.openai = new OpenAI({ apiKey });
    this.serviceLogger.info("OpenAIProvider initialized.");
  }

  async generateTextResponse(
    messages: ChatMessage[],
    options?: GenerationOptions
  ): Promise<string> {
    const model = options?.model || "gpt-3.5-turbo";
    this.serviceLogger.info(
      { model, messageCount: messages.length },
      "Requesting chat completion from OpenAI."
    );

    try {
      const completion = await this.openai.chat.completions.create({
        model,
        messages: messages,
        temperature: options?.temperature || 0.7,
      });

      const responseText = completion.choices[0]?.message?.content;

      if (!responseText) {
        this.serviceLogger.warn(
          { completion },
          "Received an empty response from OpenAI."
        );
        return "I received an empty response. Could you please rephrase?";
      }

      this.serviceLogger.info("Successfully received response from OpenAI.");
      return responseText;
    } catch (error: unknown) {
      this.serviceLogger.error({ err: error }, "Error calling OpenAI API");
      // Avoid leaking detailed error info to the end user.
      return "Sorry, I encountered an error while contacting my AI service. Please try again later.";
    }
  }

  async transcribeAudio(
    audioBuffer: Buffer,
    language?: string
  ): Promise<string> {
    this.serviceLogger.info(
      { bufferSize: audioBuffer.length, language },
      "Requesting audio transcription from OpenAI Whisper."
    );

    try {
      // Create a File-like object from Buffer
      const audioFile = new File([audioBuffer], "audio.ogg", {
        type: "audio/ogg",
      });

      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: language || undefined, // Let Whisper auto-detect if not specified
      });

      const transcribedText = transcription.text;

      if (!transcribedText) {
        this.serviceLogger.warn(
          "Received empty transcription from OpenAI Whisper."
        );
        return "I couldn't understand the audio. Could you please try again?";
      }

      this.serviceLogger.info(
        "Successfully transcribed audio with OpenAI Whisper."
      );
      return transcribedText;
    } catch (error: unknown) {
      this.serviceLogger.error(
        { err: error },
        "Error calling OpenAI Whisper API"
      );
      return "Sorry, I encountered an error while transcribing your audio. Please try again later.";
    }
  }
}
