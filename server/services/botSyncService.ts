import { getDB } from "~/server/db";
import logger from "~/server/utils/logger";

interface BotConfig {
  name: string;
  token: string;
}

/**
 * Parses bot configurations from environment variables.
 */
function getBotsFromEnv(): BotConfig[] {
  const botConfigs: { [key: number]: Partial<BotConfig> } = {};

  for (const envKey in process.env) {
    const match = envKey.match(/^TELEGRAM_BOT_(\d+)_(NAME|TOKEN)$/);
    if (match) {
      const index = parseInt(match[1]);
      const type = match[2];
      const value = process.env[envKey];

      if (!botConfigs[index]) {
        botConfigs[index] = {};
      }
      if (type === "NAME") {
        botConfigs[index].name = value;
      } else if (type === "TOKEN") {
        botConfigs[index].token = value;
      }
    }
  }

  const validBots: BotConfig[] = [];
  for (const index in botConfigs) {
    const config = botConfigs[index];
    if (config.name && config.token) {
      validBots.push({ name: config.name, token: config.token });
    }
  }
  return validBots;
}

/**
 * Synchronizes bots from environment variables with the database.
 * Marks bots present in the environment as active, and all others as inactive.
 */
export async function syncBotsFromEnv() {
  const syncLogger = logger.child({ service: "BotSyncService" });
  syncLogger.info("Starting bot synchronization from environment variables...");

  const db = getDB();
  const botsFromEnv = getBotsFromEnv();

  if (botsFromEnv.length === 0) {
    syncLogger.warn(
      "No bots found in environment variables (e.g., TELEGRAM_BOT_1_TOKEN). Marking all bots in DB as inactive."
    );
  } else {
    syncLogger.info(
      `Found ${botsFromEnv.length} bot(s) configured in environment.`
    );
  }

  try {
    // Start a transaction to ensure atomicity
    await db.exec("BEGIN TRANSACTION");
    syncLogger.info("Transaction started. Marking all bots as inactive.");

    // Step 1: Mark all bots in the database as inactive
    await db.run("UPDATE bots SET is_active = 0");

    // Step 2: Upsert bots from environment variables and mark them as active
    for (const bot of botsFromEnv) {
      await db.run(
        `INSERT INTO bots (token, name, is_active)
         VALUES (?, ?, 1)
         ON CONFLICT(token) DO UPDATE SET
           name = excluded.name,
           is_active = 1,
           updated_at = CURRENT_TIMESTAMP`,
        [bot.token, bot.name]
      );
      syncLogger.info(`Upserted and marked bot '${bot.name}' as active.`);
    }

    // Commit the transaction
    await db.exec("COMMIT");
    syncLogger.info("Transaction committed. Bot synchronization complete.");
  } catch (error: unknown) {
    const err = error as Error;
    syncLogger.error(
      { err, stack: err.stack },
      "Error during bot synchronization. Rolling back transaction."
    );
    // Rollback on error
    await db.exec("ROLLBACK");
    throw err; // Re-throw the error to be handled by the caller (e.g., the Nitro plugin)
  }
}
