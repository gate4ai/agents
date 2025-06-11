import { useRuntimeConfig } from "#imports";
import type { AIProvider } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";
import logger from "~/server/utils/logger";

class ASRManager {
  private provider: AIProvider;
  private static instance: ASRManager;

  private constructor() {
    const config = useRuntimeConfig();
    const managerLogger = logger.child({ service: "ASRManager" });

    managerLogger.info(`Initializing ASR provider: ${config.asrProvider}`);

    switch (config.asrProvider.toLowerCase()) {
      case "openai":
        this.provider = new OpenAIProvider(config.openaiApiKey as string);
        break;
      case "google":
        this.provider = new GeminiProvider(config.geminiApiKey as string);
        break;
      default:
        managerLogger.error(`Unsupported ASR provider: ${config.asrProvider}`);
        throw new Error(`Unsupported ASR provider: ${config.asrProvider}`);
    }
  }

  /**
   * Gets the singleton instance of the ASRManager.
   */
  public static getInstance(): ASRManager {
    if (!ASRManager.instance) {
      ASRManager.instance = new ASRManager();
    }
    return ASRManager.instance;
  }

  /**
   * Delegates the audio transcription call to the configured provider.
   */
  public transcribeAudio(
    audioBuffer: Buffer,
    language?: string
  ): Promise<string> {
    return this.provider.transcribeAudio(audioBuffer, language);
  }
}

// Export a singleton instance for easy use across the app.
export default ASRManager.getInstance();
