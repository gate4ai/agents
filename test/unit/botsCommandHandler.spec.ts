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
import { handleBotsCommand } from "~/server/services/commands/botsCommandHandler";
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
      dbFileName: ":memory:",
      telegramBotApiSecretToken: "test-secret-token",
      aiProvider: "openai",
      openaiApiKey: "test-openai-key",
      geminiApiKey: "test-gemini-key",
    }),
  };
});

// Mock telegram service
vi.mock("~/server/services/telegramService", () => ({
  sendMessage: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("Unit Test: BotsCommandHandler", () => {
  let db: Database;
  const MOCK_BOT_TOKEN = "12345:ABC-DEF1234567";
  const MOCK_BOT_TOKEN_2 = "67890:XYZ-GHI7890123";

  const MOCK_USER = {
    id: 1111,
    is_bot: false,
    first_name: "John",
    last_name: "Doe",
    username: "johndoe",
  };

  const MOCK_MESSAGE: TelegramMessage = {
    message_id: 1,
    from: MOCK_USER,
    chat: { id: 1111, type: "private", first_name: "John" },
    date: Date.now() / 1000,
    text: "/bots",
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

    // Insert test data
    await runQuery(
      "INSERT INTO bots (token, name, username) VALUES (?, ?, ?)",
      [MOCK_BOT_TOKEN, "TestBot1", "testbot1"]
    );
    await runQuery(
      "INSERT INTO bots (token, name, username) VALUES (?, ?, ?)",
      [MOCK_BOT_TOKEN_2, "TestBot2", "testbot2"]
    );
    await runQuery(
      "INSERT INTO users (telegram_id, first_name, username) VALUES (?, ?, ?)",
      [MOCK_USER.id, MOCK_USER.first_name, MOCK_USER.username]
    );

    // Reset mocks
    vi.clearAllMocks();
  });

  it("should handle user not found", async () => {
    const messageWithoutUser = {
      ...MOCK_MESSAGE,
      from: { ...MOCK_USER, id: 99999 },
      chat: { ...MOCK_MESSAGE.chat, id: 99999 },
    };

    await handleBotsCommand(MOCK_BOT_TOKEN, messageWithoutUser, logger);

    const { sendMessage } = await import("~/server/services/telegramService");
    expect(sendMessage).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      99999,
      "I can't find your user profile. Please type /start first."
    );
  });

  it("should handle empty bots list", async () => {
    await runQuery("DELETE FROM bots");

    await handleBotsCommand(MOCK_BOT_TOKEN, MOCK_MESSAGE, logger);

    const { sendMessage } = await import("~/server/services/telegramService");
    expect(sendMessage).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      1111,
      "There are no bots available currently."
    );
  });

  it("should list bots without custom prompts", async () => {
    await handleBotsCommand(MOCK_BOT_TOKEN, MOCK_MESSAGE, logger);

    const { sendMessage } = await import("~/server/services/telegramService");
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const callArgs = (
      sendMessage as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0];
    expect(callArgs[0]).toBe(MOCK_BOT_TOKEN);
    expect(callArgs[1]).toBe(1111);

    const responseText = callArgs[2];
    expect(responseText).toContain("Your Bots");
    expect(responseText).toContain("Available Bots");
    expect(responseText).toContain("TestBot1");
    expect(responseText).toContain("TestBot2");
    expect(responseText).toContain("Using default prompt");
  });

  it("should list bots with custom prompts", async () => {
    // Get user and bot IDs
    const user = await db.get(
      "SELECT * FROM users WHERE telegram_id = ?",
      MOCK_USER.id
    );
    const bot1 = await db.get(
      "SELECT * FROM bots WHERE token = ?",
      MOCK_BOT_TOKEN
    );

    // Set custom prompt for bot1
    await runQuery(
      "INSERT INTO user_bots (user_id, bot_id, prompt) VALUES (?, ?, ?)",
      [user.id, bot1.id, "You are a helpful pirate assistant"]
    );

    await handleBotsCommand(MOCK_BOT_TOKEN, MOCK_MESSAGE, logger);

    const { sendMessage } = await import("~/server/services/telegramService");
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const callArgs = (
      sendMessage as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0];
    const responseText = callArgs[2];

    expect(responseText).toContain("TestBot1");
    expect(responseText).toContain("You are a helpful pirate assistant");
    expect(responseText).toContain("TestBot2");
    expect(responseText).toContain("Using default prompt");
    expect(responseText).toContain("Configured Bots");
    expect(responseText).toContain("Available Bots");
  });

  it("should handle missing telegram user ID", async () => {
    // Clear users to avoid constraint violation
    await runQuery("DELETE FROM users");

    const messageWithoutFromUser = {
      ...MOCK_MESSAGE,
      from: undefined,
    };

    await handleBotsCommand(MOCK_BOT_TOKEN, messageWithoutFromUser, logger);

    const { sendMessage } = await import("~/server/services/telegramService");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
