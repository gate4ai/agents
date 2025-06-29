import { initializeDatabase, runQuery } from "~/server/db";
import { initializeScheduler } from "~/server/services/schedulerService";
import { syncBotsFromEnv } from "~/server/services/botSyncService";
import logger from "~/server/utils/logger";
import { useRuntimeConfig } from "#imports";

// This Nitro plugin will run when the server starts
export default defineNitroPlugin(async (_nitroApp) => {
  try {
    await initializeDatabase();
    logger.info("Database initialized via Nitro plugin.");

    await syncBotsFromEnv();
    logger.info("Bots synchronized successfully from environment.");

    const config = useRuntimeConfig();
    // For E2E tests, the test script sets DB_FILE_NAME to a specific test file.
    // We use this as a reliable way to detect the E2E test context
    // instead of relying on NODE_ENV, which behaves unpredictably with @nuxt/test-utils.
    if (config.dbFileName && config.dbFileName.includes("test-db-e2e")) {
      logger.info(
        `E2E test database detected (${config.dbFileName}). Seeding database for server...`
      );
      try {
        // Using ON CONFLICT ensures this is safe to run multiple times.
        await runQuery(
          "INSERT INTO bots (name, token) VALUES (?, ?) ON CONFLICT(token) DO NOTHING",
          ["TestBot1", "12345:test-token-for-e2e"]
        );
        logger.info(
          "Test database seeded successfully for the server process."
        );
      } catch (seedError) {
        logger.error(
          { err: seedError },
          "Failed to seed test database for server."
        );
      }
    }

    // Initialize the scheduler after database setup
    // Skip scheduler initialization in test environments
    if (!config.dbFileName || !config.dbFileName.includes("test-db")) {
      initializeScheduler();
      logger.info("Scheduler initialized via Nitro plugin.");
    } else {
      logger.info("Skipping scheduler initialization in test environment.");
    }
  } catch (error) {
    const err = error as Error;
    logger.error(
      { err },
      `Failed to initialize database in Nitro plugin: ${err.message}`
    );
    // In a test environment, don't exit, just throw to fail the test setup
    if (process.env.NODE_ENV === "test") throw error;
    process.exit(1);
  }
});
