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
import { handleTextMessage } from "~/server/services/messageHandler";
import { findOrCreateUser } from "~/server/services/authService";
import { setSessionState, getSession } from "~/server/services/sessionService";
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

// Mock AI Manager
vi.mock("~/server/services/ai/AIManager", () => ({
  default: {
    generateTextResponse: vi.fn().mockResolvedValue("AI response"),
  },
}));

describe("Unit Test: MessageHandler Stateful Logic", () => {
  const MOCK_BOT_TOKEN = "12345:ABC-DEF1234567";
  const MOCK_CHAT_ID = 1111;

  const MOCK_TELEGRAM_USER: TelegramUser = {
    id: 1111,
    is_bot: false,
    first_name: "John",
    last_name: "Doe",
    username: "johndoe",
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

    // Create user
    await findOrCreateUser(MOCK_TELEGRAM_USER);

    // Reset mocks
    vi.clearAllMocks();
  });

  it("should save prompt and restore standard menu when in awaiting_prompt state", async () => {
    // Set session to awaiting_prompt state
    await setSessionState(MOCK_CHAT_ID, "awaiting_prompt", 5);

    const promptMessage: TelegramMessage = {
      message_id: 1,
      from: MOCK_TELEGRAM_USER,
      chat: { id: MOCK_CHAT_ID, type: "private", first_name: "John" },
      date: Date.now() / 1000,
      text: "You are a helpful coding assistant",
    };

    // Handle the text message (should be treated as prompt input)
    await handleTextMessage(MOCK_BOT_TOKEN, promptMessage, logger);

    // Verify session state is reset to idle
    const session = await getSession(MOCK_CHAT_ID);
    expect(session?.state).toBe("idle");

    const { sendMessage, setBotCommands } = await import(
      "~/server/services/telegramService"
    );

    // Verify success message is sent
    expect(sendMessage).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      MOCK_CHAT_ID,
      "✅ Prompt successfully updated! Your bot will now behave according to your instructions."
    );

    // Verify standard menu commands are restored
    expect(setBotCommands).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      expect.arrayContaining([
        expect.objectContaining({ command: "start" }),
        expect.objectContaining({ command: "bots" }),
        expect.objectContaining({ command: "setprompt" }),
        expect.objectContaining({ command: "cancel" }),
      ])
    );

    // Should not call AI for prompt input
    const AIManager = await import("~/server/services/ai/AIManager");
    expect(AIManager.default.generateTextResponse).not.toHaveBeenCalled();
  });

  it("should handle expired awaiting_prompt state and restore menu", async () => {
    // Set session to awaiting_prompt state with past expiration
    const pastDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    await runQuery(
      `INSERT INTO chat_sessions (chat_id, user_id, bot_id, state, state_expires_at)
       VALUES (?, 1, 1, 'awaiting_prompt', ?)`,
      [MOCK_CHAT_ID, pastDate.toISOString()]
    );

    const normalMessage: TelegramMessage = {
      message_id: 1,
      from: MOCK_TELEGRAM_USER,
      chat: { id: MOCK_CHAT_ID, type: "private", first_name: "John" },
      date: Date.now() / 1000,
      text: "Hello, how are you?",
    };

    // Handle the text message (should be treated as normal message due to expiration)
    await handleTextMessage(MOCK_BOT_TOKEN, normalMessage, logger);

    // Verify session state is reset to idle
    const session = await getSession(MOCK_CHAT_ID);
    expect(session?.state).toBe("idle");

    const { sendMessage, setBotCommands } = await import(
      "~/server/services/telegramService"
    );

    // Verify expiration message is sent first
    expect(sendMessage).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      MOCK_CHAT_ID,
      "⏰ Prompt input mode has expired. Processing your message normally."
    );

    // Verify standard menu commands are restored
    expect(setBotCommands).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      expect.arrayContaining([
        expect.objectContaining({ command: "start" }),
        expect.objectContaining({ command: "bots" }),
        expect.objectContaining({ command: "setprompt" }),
        expect.objectContaining({ command: "cancel" }),
      ])
    );

    // Should call AI for normal message processing
    const AIManager = await import("~/server/services/ai/AIManager");
    expect(AIManager.default.generateTextResponse).toHaveBeenCalled();
  });

  it("should process normal messages when not in awaiting_prompt state", async () => {
    const normalMessage: TelegramMessage = {
      message_id: 1,
      from: MOCK_TELEGRAM_USER,
      chat: { id: MOCK_CHAT_ID, type: "private", first_name: "John" },
      date: Date.now() / 1000,
      text: "Hello, how are you?",
    };

    // Handle the text message (should be treated as normal message)
    await handleTextMessage(MOCK_BOT_TOKEN, normalMessage, logger);

    const { sendMessage, setBotCommands } = await import(
      "~/server/services/telegramService"
    );

    // Should call AI for normal message processing
    const AIManager = await import("~/server/services/ai/AIManager");
    expect(AIManager.default.generateTextResponse).toHaveBeenCalled();

    // Should send AI response
    expect(sendMessage).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      MOCK_CHAT_ID,
      "AI response"
    );

    // Should not call setBotCommands for normal messages
    expect(setBotCommands).not.toHaveBeenCalled();
  });
});
