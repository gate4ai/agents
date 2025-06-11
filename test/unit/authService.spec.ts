// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initializeDatabase, getDB, runQuery } from "~/server/db";
import { findOrCreateUser } from "~/server/services/authService";
import type { TelegramUser } from "~/server/types/telegram";
import type { Database } from "sqlite";

describe("Unit Test: AuthService", () => {
  let db: Database;

  beforeAll(async () => {
    db = await initializeDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clear the users table before each test to ensure isolation
    await runQuery("DELETE FROM users");
    await runQuery("DELETE FROM sqlite_sequence WHERE name = 'users'");
  });

  it("should create a new user if one does not exist", async () => {
    const mockTelegramUser: TelegramUser = {
      id: 12345,
      is_bot: false,
      first_name: "Test",
      last_name: "User",
      username: "testuser",
    };

    const user = await findOrCreateUser(mockTelegramUser);

    expect(user).toBeDefined();
    expect(user.telegram_id).toBe(12345);
    expect(user.first_name).toBe("Test");

    const dbUser = await getDB().get(
      "SELECT * FROM users WHERE telegram_id = ?",
      [12345]
    );
    expect(dbUser).toBeDefined();
    expect(dbUser.username).toBe("testuser");
  });

  it("should find an existing user and not create a new one", async () => {
    const mockTelegramUser: TelegramUser = {
      id: 54321,
      is_bot: false,
      first_name: "Existing",
      username: "existinguser",
    };

    await findOrCreateUser(mockTelegramUser); // First call creates the user
    const user = await findOrCreateUser(mockTelegramUser); // Second call finds it

    expect(user).toBeDefined();
    expect(user.telegram_id).toBe(54321);

    const allUsers = await getDB().all(
      "SELECT * FROM users WHERE telegram_id = ?",
      [54321]
    );
    expect(allUsers).toHaveLength(1);
  });
});
