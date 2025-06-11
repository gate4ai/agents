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
import {
  getSession,
  updateHistory,
  setSessionState,
} from "~/server/services/sessionService";

import type { ChatMessage } from "~/server/services/ai/types";

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

describe("Unit Test: SessionService", () => {
  const MOCK_CHAT_ID = 12345;
  const MOCK_USER_ID = 1;
  const MOCK_BOT_ID = 1;

  beforeAll(async () => {
    await initializeDatabase();
  });

  afterAll(async () => {
    await closeAndResetDb();
  });

  beforeEach(async () => {
    // Clear tables before each test
    await runQuery("DELETE FROM chat_sessions");
    await runQuery("DELETE FROM users");
    await runQuery("DELETE FROM bots");

    // Insert test data
    await runQuery("INSERT INTO bots (token, name) VALUES (?, ?)", [
      "test-token",
      "TestBot",
    ]);
    await runQuery(
      "INSERT INTO users (telegram_id, first_name) VALUES (?, ?)",
      [12345, "Test User"]
    );
  });

  describe("getSession", () => {
    it("should return null for non-existent session", async () => {
      const session = await getSession(MOCK_CHAT_ID);
      expect(session).toBeNull();
    });

    it("should return session with empty history when history is null", async () => {
      await runQuery(
        "INSERT INTO chat_sessions (chat_id, user_id, bot_id, history) VALUES (?, ?, ?, ?)",
        [MOCK_CHAT_ID, MOCK_USER_ID, MOCK_BOT_ID, null]
      );

      const session = await getSession(MOCK_CHAT_ID);

      expect(session).toBeDefined();
      expect(session?.chat_id).toBe(MOCK_CHAT_ID);
      expect(session?.user_id).toBe(MOCK_USER_ID);
      expect(session?.bot_id).toBe(MOCK_BOT_ID);
      expect(session?.history).toEqual([]);
      expect(session?.state).toBe("idle");
    });

    it("should return session with parsed history", async () => {
      const testHistory: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      await runQuery(
        "INSERT INTO chat_sessions (chat_id, user_id, bot_id, history) VALUES (?, ?, ?, ?)",
        [MOCK_CHAT_ID, MOCK_USER_ID, MOCK_BOT_ID, JSON.stringify(testHistory)]
      );

      const session = await getSession(MOCK_CHAT_ID);

      expect(session).toBeDefined();
      expect(session?.history).toEqual(testHistory);
    });

    it("should handle malformed JSON history gracefully", async () => {
      await runQuery(
        "INSERT INTO chat_sessions (chat_id, user_id, bot_id, history) VALUES (?, ?, ?, ?)",
        [MOCK_CHAT_ID, MOCK_USER_ID, MOCK_BOT_ID, "invalid json"]
      );

      const session = await getSession(MOCK_CHAT_ID);

      expect(session).toBeDefined();
      expect(session?.history).toEqual([]);
    });

    it("should return session with state and expiration", async () => {
      const expirationTime = new Date(Date.now() + 300000).toISOString(); // 5 minutes from now

      await runQuery(
        "INSERT INTO chat_sessions (chat_id, user_id, bot_id, state, state_expires_at) VALUES (?, ?, ?, ?, ?)",
        [
          MOCK_CHAT_ID,
          MOCK_USER_ID,
          MOCK_BOT_ID,
          "awaiting_prompt",
          expirationTime,
        ]
      );

      const session = await getSession(MOCK_CHAT_ID);

      expect(session).toBeDefined();
      expect(session?.state).toBe("awaiting_prompt");
      expect(session?.state_expires_at).toBe(expirationTime);
    });
  });

  describe("updateHistory", () => {
    it("should create new session with history", async () => {
      const userMessage: ChatMessage = { role: "user", content: "Hello" };
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "Hi!",
      };

      await updateHistory(
        MOCK_CHAT_ID,
        MOCK_USER_ID,
        MOCK_BOT_ID,
        userMessage,
        assistantMessage
      );

      const session = await getSession(MOCK_CHAT_ID);

      expect(session).toBeDefined();
      expect(session?.history).toHaveLength(2);
      expect(session?.history[0]).toEqual(userMessage);
      expect(session?.history[1]).toEqual(assistantMessage);
    });

    it("should append to existing history", async () => {
      const initialHistory: ChatMessage[] = [
        { role: "user", content: "First message" },
        { role: "assistant", content: "First response" },
      ];

      await runQuery(
        "INSERT INTO chat_sessions (chat_id, user_id, bot_id, history) VALUES (?, ?, ?, ?)",
        [
          MOCK_CHAT_ID,
          MOCK_USER_ID,
          MOCK_BOT_ID,
          JSON.stringify(initialHistory),
        ]
      );

      const userMessage: ChatMessage = {
        role: "user",
        content: "Second message",
      };
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "Second response",
      };

      await updateHistory(
        MOCK_CHAT_ID,
        MOCK_USER_ID,
        MOCK_BOT_ID,
        userMessage,
        assistantMessage
      );

      const session = await getSession(MOCK_CHAT_ID);

      expect(session?.history).toHaveLength(4);
      expect(session?.history[2]).toEqual(userMessage);
      expect(session?.history[3]).toEqual(assistantMessage);
    });

    it("should limit history to MAX_HISTORY_MESSAGES", async () => {
      // Create a history with more than 1000 messages
      const longHistory: ChatMessage[] = [];
      for (let i = 0; i < 999; i++) {
        longHistory.push({ role: "user", content: `Message ${i}` });
        longHistory.push({ role: "assistant", content: `Response ${i}` });
      }

      await runQuery(
        "INSERT INTO chat_sessions (chat_id, user_id, bot_id, history) VALUES (?, ?, ?, ?)",
        [MOCK_CHAT_ID, MOCK_USER_ID, MOCK_BOT_ID, JSON.stringify(longHistory)]
      );

      const userMessage: ChatMessage = { role: "user", content: "New message" };
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "New response",
      };

      await updateHistory(
        MOCK_CHAT_ID,
        MOCK_USER_ID,
        MOCK_BOT_ID,
        userMessage,
        assistantMessage
      );

      const session = await getSession(MOCK_CHAT_ID);

      // Should be limited to 1000 messages
      expect(session?.history).toHaveLength(1000);
      // The newest messages should be at the end
      expect(session?.history[998]).toEqual(userMessage);
      expect(session?.history[999]).toEqual(assistantMessage);
    });
  });

  describe("setSessionState", () => {
    it("should set session state without expiration", async () => {
      await setSessionState(MOCK_CHAT_ID, "awaiting_prompt");

      const session = await getSession(MOCK_CHAT_ID);

      expect(session).toBeDefined();
      expect(session?.state).toBe("awaiting_prompt");
      expect(session?.state_expires_at).toBeNull();
    });

    it("should set session state with expiration", async () => {
      const expiresInMinutes = 5;
      const beforeTime = new Date(
        Date.now() + expiresInMinutes * 60 * 1000 - 1000
      );

      await setSessionState(MOCK_CHAT_ID, "awaiting_prompt", expiresInMinutes);

      const session = await getSession(MOCK_CHAT_ID);

      expect(session).toBeDefined();
      expect(session?.state).toBe("awaiting_prompt");
      expect(session?.state_expires_at).toBeDefined();

      const expiresAt = new Date(session!.state_expires_at!);
      expect(expiresAt.getTime()).toBeGreaterThan(beforeTime.getTime());
    });

    it("should update existing session state", async () => {
      // First set to awaiting_prompt
      await setSessionState(MOCK_CHAT_ID, "awaiting_prompt", 5);

      // Then set to idle
      await setSessionState(MOCK_CHAT_ID, "idle");

      const session = await getSession(MOCK_CHAT_ID);

      expect(session?.state).toBe("idle");
      expect(session?.state_expires_at).toBeNull();
    });
  });
});
