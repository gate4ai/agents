/**
 * Represents a single message in a chat conversation.
 * This is a generic type to avoid dependency on a specific provider's types.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Represents options for generating a response.
 * This can be extended with more provider-specific options in the future.
 */
export interface GenerationOptions {
  model?: string;
  temperature?: number;
  // In the future, this can include 'tools', 'json_mode', etc.
}

/**
 * Defines the contract that every AI provider must adhere to.
 * This allows for a plug-and-play architecture.
 */
export interface AIProvider {
  /**
   * Generates a text response based on a series of messages.
   * @param messages The history of the conversation.
   * @param options Additional options for generation.
   * @returns A promise that resolves to the AI's response text.
   */
  generateTextResponse(
    messages: ChatMessage[],
    options?: GenerationOptions
  ): Promise<string>;

  /**
   * Transcribes an audio file into text.
   * @param audioBuffer The audio data as a buffer.
   * @param language The language of the audio (e.g., 'en').
   * @returns A promise that resolves to the transcribed text.
   */
  transcribeAudio(audioBuffer: Buffer, language?: string): Promise<string>;
}
