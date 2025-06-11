import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  initializeScheduler,
  processExpiredSessions,
} from "../../server/services/schedulerService";
import { initializeDatabase, runQuery } from "../../server/db";
import * as telegramService from "../../server/services/telegramService";
import * as sessionService from "../../server/services/sessionService";

// Mock external services
vi.mock("../../server/services/telegramService");
vi.mock("../../server/services/sessionService");

describe("schedulerService", () => {
  beforeEach(async () => {
    await initializeDatabase();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initializeScheduler", () => {
    it("should start scheduler with 30 second interval", () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      initializeScheduler();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it("should not start scheduler in test environment", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";

      const setIntervalSpy = vi.spyOn(global, "setInterval");

      initializeScheduler();

      expect(setIntervalSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("processExpiredSessions", () => {
    beforeEach(async () => {
      // Clear any existing data and create fresh test data
      await runQuery("DELETE FROM chat_sessions");
      await runQuery("DELETE FROM user_bots");
      await runQuery("DELETE FROM users");
      await runQuery("DELETE FROM bots");

      // Create test data
      await runQuery(`
        INSERT INTO bots (token, name, username) 
        VALUES ('test_token', 'Test Bot', 'test_bot')
      `);

      await runQuery(`
        INSERT INTO users (telegram_id, first_name, username) 
        VALUES (123, 'Test User', 'testuser')
      `);
    });

    it("should process expired sessions and notify users", async () => {
      const expiredTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago

      await runQuery(
        `
        INSERT INTO chat_sessions (chat_id, user_id, bot_id, state, state_expires_at, history)
        VALUES (456, 1, 1, 'awaiting_prompt', ?, '[]')
      `,
        [expiredTime]
      );

      const sendMessageSpy = vi.mocked(telegramService.sendMessage);
      const setSessionStateSpy = vi.mocked(sessionService.setSessionState);
      const setBotCommandsSpy = vi.mocked(telegramService.setBotCommands);

      await processExpiredSessions();

      expect(sendMessageSpy).toHaveBeenCalledWith(
        "test_token",
        456,
        "⏰ Prompt input mode has expired. Operation cancelled."
      );

      expect(setSessionStateSpy).toHaveBeenCalledWith(456, "idle");

      expect(setBotCommandsSpy).toHaveBeenCalledWith(
        "test_token",
        expect.arrayContaining([
          {
            command: "start",
            description: "Start the bot and get welcome message",
          },
          {
            command: "bots",
            description: "List all available bots and their settings",
          },
          {
            command: "setprompt",
            description: "Set a custom prompt for this bot",
          },
          { command: "cancel", description: "Cancel current operation" },
        ])
      );
    });

    it("should not process sessions that are not expired", async () => {
      const futureTime = new Date(Date.now() + 60000).toISOString(); // 1 minute in future

      await runQuery(
        `
        INSERT INTO chat_sessions (chat_id, user_id, bot_id, state, state_expires_at, history)
        VALUES (456, 1, 1, 'awaiting_prompt', ?, '[]')
      `,
        [futureTime]
      );

      const sendMessageSpy = vi.mocked(telegramService.sendMessage);

      await processExpiredSessions();

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      const expiredTime = new Date(Date.now() - 60000).toISOString();

      await runQuery(
        `
        INSERT INTO chat_sessions (chat_id, user_id, bot_id, state, state_expires_at, history)
        VALUES (456, 1, 1, 'awaiting_prompt', ?, '[]')
      `,
        [expiredTime]
      );

      // Mock sendMessage to throw error
      vi.mocked(telegramService.sendMessage).mockRejectedValue(
        new Error("Telegram API error")
      );

      // Should not throw
      await expect(processExpiredSessions()).resolves.not.toThrow();
    });

    it("should only process sessions with awaiting_prompt state", async () => {
      const expiredTime = new Date(Date.now() - 60000).toISOString();

      // Insert session with different state
      await runQuery(
        `
        INSERT INTO chat_sessions (chat_id, user_id, bot_id, state, state_expires_at, history)
        VALUES (456, 1, 1, 'idle', ?, '[]')
      `,
        [expiredTime]
      );

      const sendMessageSpy = vi.mocked(telegramService.sendMessage);

      await processExpiredSessions();

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });

    it("should skip sessions without bot information", async () => {
      const expiredTime = new Date(Date.now() - 60000).toISOString();

      // Insert session with non-existent bot_id
      await runQuery(
        `
        INSERT INTO chat_sessions (chat_id, user_id, bot_id, state, state_expires_at, history)
        VALUES (456, 1, 999, 'awaiting_prompt', ?, '[]')
      `,
        [expiredTime]
      );

      const sendMessageSpy = vi.mocked(telegramService.sendMessage);

      await processExpiredSessions();

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });
  });
});
