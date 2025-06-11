// @vitest-environment node
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { initializeDatabase, runQuery, closeAndResetDb } from "~/server/db";
import { handleStartCommand } from "~/server/services/commands/startCommandHandler";
import { handleSetPromptCommand } from "~/server/services/commands/setPromptCommandHandler";
import { handleTextMessage } from "~/server/services/messageHandler";
import type { TelegramMessage } from "~/server/types/telegram";
import type { Database } from "sqlite";
import logger from "~/server/utils/logger";

// Mock the runtime config
vi.mock("#imports", async () => {
  const originalModule = await vi.importActual<typeof import("#imports")>(
    "#imports"
  );
  return {
    ...originalModule,
    useRuntimeConfig: () => ({
      dbFileName: ":memory:", // Use in-memory DB for this test suite
      telegramBotApiSecretToken: "test-secret-token",
      aiProvider: "openai",
      openaiApiKey: "test-openai-key",
      geminiApiKey: "test-gemini-key",
    }),
  };
});

// Mock external API calls
vi.mock("~/server/services/ai/providers/openaiProvider", () => ({
  generateResponse: vi.fn().mockResolvedValue("Mocked AI response"),
}));

vi.mock("~/server/services/ai/AIManager", () => ({
  default: {
    getInstance: () => ({
      generateTextResponse: vi.fn().mockResolvedValue("Mocked AI response"),
    }),
  },
}));

vi.mock("~/server/services/telegramService", () => ({
  sendMessage: vi.fn().mockResolvedValue({ ok: true }),
  setBotCommands: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("Unit Test: Webhook Handlers", () => {
  let db: Database;
  const MOCK_BOT_TOKEN = "12345:ABC-DEF1234567";

  const MOCK_USER = {
    id: 1111,
    is_bot: false,
    first_name: "John",
    last_name: "Doe",
    username: "johndoe",
  };

  const MOCK_START_MESSAGE: TelegramMessage = {
    message_id: 1,
    from: MOCK_USER,
    chat: { id: 1111, type: "private", first_name: "John" },
    date: Date.now() / 1000,
    text: "/start",
  };

  const MOCK_SETPROMPT_MESSAGE: TelegramMessage = {
    message_id: 2,
    from: MOCK_USER,
    chat: { id: 1111, type: "private", first_name: "John" },
    date: Date.now() / 1000,
    text: "/setprompt",
  };

  const MOCK_PROMPT_MESSAGE: TelegramMessage = {
    message_id: 3,
    from: MOCK_USER,
    chat: { id: 1111, type: "private", first_name: "John" },
    date: Date.now() / 1000,
    text: "You are a pirate!",
  };

  beforeAll(async () => {
    db = await initializeDatabase();
  });

  afterAll(async () => {
    await closeAndResetDb();
  });

  beforeEach(async () => {
    // Clear all tables before each test
    await runQuery("DELETE FROM user_bots");
    await runQuery("DELETE FROM users");
    await runQuery("DELETE FROM bots");

    // Reset auto-increment counters
    await runQuery(
      "DELETE FROM sqlite_sequence WHERE name IN ('users', 'bots', 'user_bots')"
    );

    // Insert test bot
    await runQuery("INSERT INTO bots (token, name) VALUES (?, ?)", [
      MOCK_BOT_TOKEN,
      "TestBot",
    ]);
  });

  describe("Start Command Handler", () => {
    it("should create a new user when /start command is received", async () => {
      await handleStartCommand(MOCK_BOT_TOKEN, MOCK_START_MESSAGE, logger);

      const user = await db.get(
        "SELECT * FROM users WHERE telegram_id = ?",
        MOCK_USER.id
      );

      expect(user).toBeDefined();
      expect(user.first_name).toBe("John");
      expect(user.username).toBe("johndoe");
    });

    it("should not create duplicate user if user already exists", async () => {
      // First call
      await handleStartCommand(MOCK_BOT_TOKEN, MOCK_START_MESSAGE, logger);

      // Second call
      await handleStartCommand(MOCK_BOT_TOKEN, MOCK_START_MESSAGE, logger);

      const users = await db.all(
        "SELECT * FROM users WHERE telegram_id = ?",
        MOCK_USER.id
      );

      expect(users).toHaveLength(1);
    });
  });

  describe("SetPrompt Command Handler", () => {
    it("should set a custom prompt for the user-bot pair", async () => {
      // First ensure user exists
      await handleStartCommand(MOCK_BOT_TOKEN, MOCK_START_MESSAGE, logger);

      // Then trigger setprompt command to set session state
      await handleSetPromptCommand(
        MOCK_BOT_TOKEN,
        MOCK_SETPROMPT_MESSAGE,
        logger
      );

      // Now send the actual prompt message
      await handleTextMessage(MOCK_BOT_TOKEN, MOCK_PROMPT_MESSAGE, logger);

      const user = await db.get(
        "SELECT id FROM users WHERE telegram_id = ?",
        MOCK_USER.id
      );
      const bot = await db.get(
        "SELECT id FROM bots WHERE token = ?",
        MOCK_BOT_TOKEN
      );

      const userBot = await db.get(
        "SELECT * FROM user_bots WHERE user_id = ? AND bot_id = ?",
        [user.id, bot.id]
      );

      expect(userBot).toBeDefined();
      expect(userBot.prompt).toBe("You are a pirate!");
    });

    it("should handle setprompt command without existing user", async () => {
      // Try to set prompt without creating user first
      await handleSetPromptCommand(
        MOCK_BOT_TOKEN,
        MOCK_SETPROMPT_MESSAGE,
        logger
      );

      // User should NOT be created automatically - the handler should ask to run /start first
      const user = await db.get(
        "SELECT * FROM users WHERE telegram_id = ?",
        MOCK_USER.id
      );

      expect(user).toBeUndefined();

      // The handler should have sent a message asking to run /start first
      const { sendMessage } = await import("~/server/services/telegramService");
      expect(sendMessage).toHaveBeenCalledWith(
        MOCK_BOT_TOKEN,
        MOCK_USER.id,
        "I can't find your user profile. Please type /start first."
      );
    });
  });
});
