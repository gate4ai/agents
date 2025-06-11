import { beforeAll, afterAll, vi } from "vitest";
import {
  initializeTestDatabase,
  closeTestDb,
  getTestDB,
  runTestQuery,
  getTestQuery,
  allTestQuery,
} from "./test-db";

// Mock the database functions to use test database
vi.mock("~/server/db", () => ({
  initializeDatabase: () => initializeTestDatabase(),
  getDB: () => getTestDB(),
  runQuery: async (query: string, params: unknown[] = []) => {
    return runTestQuery(query, params);
  },
  getQuery: async (query: string, params: unknown[] = []) => {
    return getTestQuery(query, params);
  },
  allQuery: async (query: string, params: unknown[] = []) => {
    return allTestQuery(query, params);
  },
  closeAndResetDb: () => closeTestDb(),
}));

// Initialize database for unit tests
beforeAll(async () => {
  await initializeTestDatabase();
});

// Clean up after unit tests
afterAll(async () => {
  await closeTestDb();
});
