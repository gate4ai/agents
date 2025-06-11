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
  getBotByToken,
  getUserByTelegramId,
  getUserBotPrompt,
  setUserBotPrompt,
  getAllBots,
  getUserBots,
} from "~/server/services/botUserService";

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

describe("Unit Test: BotUserService", () => {
  const MOCK_BOT_TOKEN = "12345:ABC-DEF1234567";
  const MOCK_BOT_TOKEN_2 = "67890:XYZ-GHI7890123";
  const MOCK_TELEGRAM_USER_ID = 1111;

  beforeAll(async () => {
    await initializeDatabase();
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
      [MOCK_TELEGRAM_USER_ID, "Test", "testuser"]
    );
  });

  describe("getBotByToken", () => {
    it("should return bot by token", async () => {
      const bot = await getBotByToken(MOCK_BOT_TOKEN);

      expect(bot).toBeDefined();
      expect(bot?.token).toBe(MOCK_BOT_TOKEN);
      expect(bot?.name).toBe("TestBot1");
      expect(bot?.username).toBe("testbot1");
    });

    it("should return undefined for non-existent token", async () => {
      const bot = await getBotByToken("non-existent-token");
      expect(bot).toBeUndefined();
    });
  });

  describe("getUserByTelegramId", () => {
    it("should return user by telegram ID", async () => {
      const user = await getUserByTelegramId(MOCK_TELEGRAM_USER_ID);

      expect(user).toBeDefined();
      expect(user?.telegram_id).toBe(MOCK_TELEGRAM_USER_ID);
      expect(user?.first_name).toBe("Test");
      expect(user?.username).toBe("testuser");
    });

    it("should return undefined for non-existent telegram ID", async () => {
      const user = await getUserByTelegramId(99999);
      expect(user).toBeUndefined();
    });
  });

  describe("getAllBots", () => {
    it("should return all bots", async () => {
      const bots = await getAllBots();

      expect(bots).toHaveLength(2);
      expect(bots.map((b) => b.name)).toContain("TestBot1");
      expect(bots.map((b) => b.name)).toContain("TestBot2");
    });
  });

  describe("getUserBots", () => {
    it("should return empty array for user with no custom prompts", async () => {
      const user = await getUserByTelegramId(MOCK_TELEGRAM_USER_ID);
      const userBots = await getUserBots(user!.id);

      expect(userBots).toHaveLength(0);
    });

    it("should return user's custom bot prompts", async () => {
      const user = await getUserByTelegramId(MOCK_TELEGRAM_USER_ID);
      const bot = await getBotByToken(MOCK_BOT_TOKEN);

      await setUserBotPrompt(user!.id, bot!.id, "Custom test prompt");

      const userBots = await getUserBots(user!.id);

      expect(userBots).toHaveLength(1);
      expect(userBots[0].prompt).toBe("Custom test prompt");
      expect(userBots[0].bot_id).toBe(bot!.id);
    });
  });

  describe("getUserBotPrompt", () => {
    it("should return null for non-existent prompt", async () => {
      const user = await getUserByTelegramId(MOCK_TELEGRAM_USER_ID);
      const bot = await getBotByToken(MOCK_BOT_TOKEN);

      expect(user).toBeDefined();
      expect(bot).toBeDefined();

      const prompt = await getUserBotPrompt(user!.id, bot!.id);
      expect(prompt).toBeNull();
    });

    it("should return custom prompt when it exists", async () => {
      const user = await getUserByTelegramId(MOCK_TELEGRAM_USER_ID);
      const bot = await getBotByToken(MOCK_BOT_TOKEN);
      const customPrompt = "You are a helpful assistant";

      await setUserBotPrompt(user!.id, bot!.id, customPrompt);

      const prompt = await getUserBotPrompt(user!.id, bot!.id);
      expect(prompt).toBe(customPrompt);
    });
  });

  describe("setUserBotPrompt", () => {
    it("should create new user-bot prompt", async () => {
      const user = await getUserByTelegramId(MOCK_TELEGRAM_USER_ID);
      const bot = await getBotByToken(MOCK_BOT_TOKEN);
      const customPrompt = "You are a pirate assistant";

      expect(user).toBeDefined();
      expect(bot).toBeDefined();

      await setUserBotPrompt(user!.id, bot!.id, customPrompt);

      const savedPrompt = await getUserBotPrompt(user!.id, bot!.id);
      expect(savedPrompt).toBe(customPrompt);
    });

    it("should update existing user-bot prompt", async () => {
      const user = await getUserByTelegramId(MOCK_TELEGRAM_USER_ID);
      const bot = await getBotByToken(MOCK_BOT_TOKEN);

      await setUserBotPrompt(user!.id, bot!.id, "First prompt");
      await setUserBotPrompt(user!.id, bot!.id, "Updated prompt");

      const savedPrompt = await getUserBotPrompt(user!.id, bot!.id);
      expect(savedPrompt).toBe("Updated prompt");
    });
  });
});
