import { useRuntimeConfig } from "#imports";
import type { AIProvider, ChatMessage, GenerationOptions } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";
import logger from "~/server/utils/logger";

class AIManager {
  private provider: AIProvider;
  private static instance: AIManager;

  private constructor() {
    const config = useRuntimeConfig();
    const managerLogger = logger.child({ service: "AIManager" });

    managerLogger.info(`Initializing AI provider: ${config.aiProvider}`);

    switch (config.aiProvider.toLowerCase()) {
      case "openai":
        this.provider = new OpenAIProvider(config.openaiApiKey as string);
        break;
      case "gemini":
        this.provider = new GeminiProvider(config.geminiApiKey as string);
        break;
      default:
        managerLogger.error(`Unsupported AI provider: ${config.aiProvider}`);
        throw new Error(`Unsupported AI provider: ${config.aiProvider}`);
    }
  }

  /**
   * Gets the singleton instance of the AIManager.
   */
  public static getInstance(): AIManager {
    if (!AIManager.instance) {
      AIManager.instance = new AIManager();
    }
    return AIManager.instance;
  }

  /**
   * Delegates the text generation call to the configured provider.
   */
  public generateTextResponse(
    messages: ChatMessage[],
    options?: GenerationOptions
  ): Promise<string> {
    return this.provider.generateTextResponse(messages, options);
  }
}

// Export a singleton instance for easy use across the app.
export default AIManager.getInstance();
