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
import { handleSetPromptCommand } from "~/server/services/commands/setPromptCommandHandler";
import { findOrCreateUser } from "~/server/services/authService";
import { getSession } from "~/server/services/sessionService";
import type { TelegramMessage, TelegramUser } from "~/server/types/telegram";
import logger from "~/server/utils/logger";

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
  setBotCommands: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("Unit Test: SetPromptCommandHandler", () => {
  const MOCK_BOT_TOKEN = "12345:ABC-DEF1234567";
  const MOCK_CHAT_ID = 1111;

  const MOCK_TELEGRAM_USER: TelegramUser = {
    id: 1111,
    is_bot: false,
    first_name: "John",
    last_name: "Doe",
    username: "johndoe",
  };

  const MOCK_MESSAGE: TelegramMessage = {
    message_id: 1,
    from: MOCK_TELEGRAM_USER,
    chat: { id: MOCK_CHAT_ID, type: "private", first_name: "John" },
    date: Date.now() / 1000,
    text: "/setprompt",
  };

  beforeAll(async () => {
    await initializeDatabase();
  });

  afterAll(async () => {
    await closeAndResetDb();
  });

  beforeEach(async () => {
    // Clear all tables before each test
    await runQuery("DELETE FROM users");
    await runQuery("DELETE FROM bots");
    await runQuery("DELETE FROM user_bots");
    await runQuery("DELETE FROM chat_sessions");

    // Reset auto-increment counters
    await runQuery(
      "DELETE FROM sqlite_sequence WHERE name IN ('users', 'bots', 'user_bots', 'chat_sessions')"
    );

    // Insert test bot
    await runQuery(
      "INSERT INTO bots (name, token, username) VALUES (?, ?, ?)",
      ["TestBot", MOCK_BOT_TOKEN, "testbot"]
    );

    // Reset mocks
    vi.clearAllMocks();
  });

  it("should set session state to awaiting_prompt and change menu to contextual", async () => {
    // Create user first
    await findOrCreateUser(MOCK_TELEGRAM_USER);

    // Handle setprompt command
    await handleSetPromptCommand(MOCK_BOT_TOKEN, MOCK_MESSAGE, logger);

    // Verify session state is set to awaiting_prompt
    const session = await getSession(MOCK_CHAT_ID);
    expect(session?.state).toBe("awaiting_prompt");
    expect(session?.state_expires_at).toBeTruthy();

    const { sendMessage, setBotCommands } = await import(
      "~/server/services/telegramService"
    );

    // Verify message is sent
    expect(sendMessage).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      MOCK_CHAT_ID,
      expect.stringContaining("🤖 Please enter your new system prompt")
    );

    // Verify contextual menu is set (only cancel command)
    expect(setBotCommands).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      expect.arrayContaining([expect.objectContaining({ command: "cancel" })])
    );

    // Verify only one command in contextual menu
    const setBotCommandsCall = vi.mocked(setBotCommands).mock.calls[0];
    expect(setBotCommandsCall[1]).toHaveLength(1);
  });

  it("should handle user not found", async () => {
    // Don't create user, so it won't be found

    await handleSetPromptCommand(MOCK_BOT_TOKEN, MOCK_MESSAGE, logger);

    const { sendMessage, setBotCommands } = await import(
      "~/server/services/telegramService"
    );

    expect(sendMessage).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      MOCK_CHAT_ID,
      "I can't find your user profile. Please type /start first."
    );

    // Should not set contextual menu if user not found
    expect(setBotCommands).not.toHaveBeenCalled();
  });

  it("should handle bot not found", async () => {
    // Create user
    await findOrCreateUser(MOCK_TELEGRAM_USER);

    // Remove bot from database
    await runQuery("DELETE FROM bots WHERE token = ?", [MOCK_BOT_TOKEN]);

    await handleSetPromptCommand(MOCK_BOT_TOKEN, MOCK_MESSAGE, logger);

    const { sendMessage, setBotCommands } = await import(
      "~/server/services/telegramService"
    );

    expect(sendMessage).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      MOCK_CHAT_ID,
      "Error: This bot is not registered."
    );

    // Should not set contextual menu if bot not found
    expect(setBotCommands).not.toHaveBeenCalled();
  });

  it("should handle missing telegram user ID", async () => {
    const messageWithoutUser: TelegramMessage = {
      ...MOCK_MESSAGE,
      from: undefined,
    };

    await handleSetPromptCommand(MOCK_BOT_TOKEN, messageWithoutUser, logger);

    const { sendMessage, setBotCommands } = await import(
      "~/server/services/telegramService"
    );

    // Should not send any message or change menu
    expect(sendMessage).not.toHaveBeenCalled();
    expect(setBotCommands).not.toHaveBeenCalled();
  });
});
