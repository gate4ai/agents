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
import { handleCancelCommand } from "~/server/services/commands/cancelCommandHandler";
import { setSessionState, getSession } from "~/server/services/sessionService";
import type { TelegramMessage } from "~/server/types/telegram";

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

describe("Unit Test: CancelCommandHandler", () => {
  const MOCK_BOT_TOKEN = "12345:ABC-DEF1234567";
  const MOCK_CHAT_ID = 1111;

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
    chat: { id: MOCK_CHAT_ID, type: "private", first_name: "John" },
    date: Date.now() / 1000,
    text: "/cancel",
  };

  beforeAll(async () => {
    await initializeDatabase();
  });

  afterAll(async () => {
    await closeAndResetDb();
  });

  beforeEach(async () => {
    // Clear all tables before each test
    await runQuery("DELETE FROM chat_sessions");

    // Reset auto-increment counters
    await runQuery(
      "DELETE FROM sqlite_sequence WHERE name IN ('chat_sessions')"
    );

    // Reset mocks
    vi.clearAllMocks();
  });

  it("should reset session state to idle and restore standard menu", async () => {
    // First set session to awaiting_prompt
    await setSessionState(MOCK_CHAT_ID, "awaiting_prompt", 5);

    // Verify it's set
    let session = await getSession(MOCK_CHAT_ID);
    expect(session?.state).toBe("awaiting_prompt");

    // Handle cancel command
    await handleCancelCommand(MOCK_BOT_TOKEN, MOCK_MESSAGE, logger);

    // Verify state is reset
    session = await getSession(MOCK_CHAT_ID);
    expect(session?.state).toBe("idle");

    const { sendMessage, setBotCommands } = await import(
      "~/server/services/telegramService"
    );

    expect(sendMessage).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      MOCK_CHAT_ID,
      "❌ Operation cancelled. You can start a new command anytime."
    );

    // Verify that standard menu commands are restored
    expect(setBotCommands).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      expect.arrayContaining([
        expect.objectContaining({ command: "start" }),
        expect.objectContaining({ command: "bots" }),
        expect.objectContaining({ command: "setprompt" }),
        expect.objectContaining({ command: "cancel" }),
      ])
    );
  });

  it("should work even when no session exists", async () => {
    // Handle cancel command without existing session
    await handleCancelCommand(MOCK_BOT_TOKEN, MOCK_MESSAGE, logger);

    const { sendMessage, setBotCommands } = await import(
      "~/server/services/telegramService"
    );

    expect(sendMessage).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      MOCK_CHAT_ID,
      "❌ Operation cancelled. You can start a new command anytime."
    );

    // Should still restore standard menu
    expect(setBotCommands).toHaveBeenCalledWith(
      MOCK_BOT_TOKEN,
      expect.arrayContaining([
        expect.objectContaining({ command: "start" }),
        expect.objectContaining({ command: "bots" }),
        expect.objectContaining({ command: "setprompt" }),
        expect.objectContaining({ command: "cancel" }),
      ])
    );
  });
});
