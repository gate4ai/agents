import { allQuery } from "~/server/db";
import { sendMessage, setBotCommands } from "./telegramService";
import { setSessionState } from "./sessionService";
import logger from "../utils/logger";
import { STANDARD_COMMANDS } from "./constants";

interface ExpiredSession {
  chat_id: number;
  bot_token: string;
  state: string;
  state_expires_at: string;
}

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Checks for expired sessions and handles them appropriately
 */
export async function processExpiredSessions(): Promise<void> {
  const schedulerLogger = logger.child({ service: "scheduler" });

  try {
    // Find all sessions with awaiting_prompt state that have expired
    const expiredSessions = await allQuery<ExpiredSession>(
      `SELECT cs.chat_id, b.token as bot_token, cs.state, cs.state_expires_at
       FROM chat_sessions cs
       JOIN bots b ON cs.bot_id = b.id
       WHERE cs.state = 'awaiting_prompt' 
       AND cs.state_expires_at IS NOT NULL 
       AND datetime(cs.state_expires_at) < datetime('now')`,
      []
    );

    if (expiredSessions.length === 0) {
      schedulerLogger.debug("No expired sessions found");
      return;
    }

    schedulerLogger.info(
      { expiredCount: expiredSessions.length },
      "Found expired sessions to process"
    );

    // Process each expired session
    for (const session of expiredSessions) {
      try {
        // Send notification to user
        await sendMessage(
          session.bot_token,
          session.chat_id,
          "⏰ Prompt input mode has expired. Operation cancelled."
        );

        // Reset session state to idle
        await setSessionState(session.chat_id, "idle");

        // Restore standard menu commands
        await setBotCommands(session.bot_token, STANDARD_COMMANDS);

        schedulerLogger.info(
          { chatId: session.chat_id },
          "Successfully processed expired session"
        );
      } catch (sessionError) {
        const err = sessionError as Error;
        schedulerLogger.error(
          { err, chatId: session.chat_id },
          "Error processing expired session"
        );
      }
    }
  } catch (error) {
    const err = error as Error;
    schedulerLogger.error({ err }, "Error in scheduler task");
  }
}

/**
 * Initializes the scheduler that runs every 30 seconds
 */
export function initializeScheduler(): void {
  const schedulerLogger = logger.child({ service: "scheduler" });

  if (schedulerInterval) {
    schedulerLogger.warn("Scheduler already initialized, skipping");
    return;
  }

  schedulerLogger.info("Initializing scheduler");

  // Run scheduler every 30 seconds
  schedulerInterval = setInterval(async () => {
    await processExpiredSessions();
  }, 30000);

  schedulerLogger.info("Scheduler initialized successfully");
}

/**
 * Stops the scheduler (useful for testing)
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("Scheduler stopped");
  }
}
