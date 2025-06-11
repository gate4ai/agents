import { runQuery, getDB, initializeDatabase } from "./index";
import logger from "../utils/logger";

interface BotData {
  name: string;
  telegram_bot_token: string;
  // webhook_url_template is not directly stored in the 'bots' table as per current schema
}

// Read PREDEFINED_BOTS from environment variables
const PREDEFINED_BOTS: BotData[] = [];
const MAX_PREDEFINED_BOTS = parseInt(
  process.env.MAX_PREDEFINED_BOTS || "10",
  10
); // Default to 10 for example

logger.info(
  `Attempting to load up to ${MAX_PREDEFINED_BOTS} predefined bots from environment variables.`
);

for (let i = 1; i <= MAX_PREDEFINED_BOTS; i++) {
  const token = process.env[`TELEGRAM_BOT_${i}_TOKEN`];
  const name = process.env[`TELEGRAM_BOT_${i}_NAME`] || `Bot${i}`; // Default name if not provided

  if (token) {
    PREDEFINED_BOTS.push({
      name: name,
      telegram_bot_token: token,
    });
    logger.info(`Loaded configuration for ${name} (TELEGRAM_BOT_${i}_TOKEN).`);
  } else {
    // Log only if an explicit name was provided for this slot, or for the first few.
    if (process.env[`TELEGRAM_BOT_${i}_NAME`] || i <= 3) {
      logger.warn(
        `Environment variable TELEGRAM_BOT_${i}_TOKEN not found. Bot slot ${i} will be skipped.`
      );
    }
  }
}

async function seedBotsTable() {
  logger.info("Starting bots table seeding process...");

  try {
    await initializeDatabase();
    logger.info("Database initialized successfully for seeding.");
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      { err, stack: err.stack },
      "Database initialization failed. Cannot seed bots."
    );
    return;
  }

  const dbInstance = getDB();
  if (!dbInstance) {
    logger.error(
      "Failed to get DB instance after initialization. Cannot seed bots."
    );
    return;
  }

  if (PREDEFINED_BOTS.length === 0) {
    logger.info(
      "No predefined bots configured via environment variables (e.g., TELEGRAM_BOT_1_TOKEN). Seeding skipped."
    );
    return;
  }

  logger.info(`Found ${PREDEFINED_BOTS.length} predefined bot(s) to seed.`);

  for (const bot of PREDEFINED_BOTS) {
    try {
      // Schema: id, token, name, username, telegram_id, created_at, updated_at
      // We will insert name and token. Token has a UNIQUE constraint.
      // username and telegram_id can be populated later (e.g. after first successful API call to getMe)
      await runQuery(
        "INSERT INTO bots (name, token) VALUES (?, ?) ON CONFLICT(token) DO NOTHING",
        [bot.name, bot.telegram_bot_token]
      );
      logger.info(
        { botName: bot.name },
        `Bot ${bot.name} seeded or already exists (based on token).`
      );
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(
        { err, botName: bot.name, stack: err.stack },
        `Error seeding bot ${bot.name}`
      );
    }
  }
  logger.info("Bots table seeding finished.");
}

// To run this seed: node -r esbuild-register server/db/seedBots.ts (or similar execution method for TS files)
// Ensure environment variables like TELEGRAM_BOT_1_TOKEN are set.
if (require.main === module) {
  logger.info("Executing seedBotsTable directly.");
  seedBotsTable().catch((error) => {
    const err = error as Error;
    logger.error(
      { err, stack: err.stack },
      "Unhandled error during seedBotsTable direct execution."
    );
  });
}

export { seedBotsTable };
