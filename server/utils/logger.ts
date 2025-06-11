import pino from "pino";

// Determine log level from environment variable, default to 'info'
const logLevel = process.env.LOG_LEVEL || "info";

// Basic Pino logger configuration
const logger = pino({
  level: logLevel,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
});

// For production environments, you might want to disable pino-pretty
// or use a different transport for structured logging.
// Example: Switch transport based on NODE_ENV
if (process.env.NODE_ENV === "production") {
  logger.info(
    "Production logging active. Pino-pretty is typically disabled in non-TTY production environments."
  );
  // In a production setup, you would ensure logs are structured (e.g., JSON)
  // and potentially sent to a log management system.
  // Pino by default logs JSON when not in a TTY or when pino-pretty is not configured.
  // If pino-pretty was the only transport, re-initializing or modifying the logger might be needed.
  // For example, to ensure JSON output and add redaction:
  // logger.level = logLevel; // Ensure level is set
  // logger.options.redact = ['req.headers.authorization', 'user.token', 'botToken']; // Example redaction
  // Or re-initialize more explicitly if needed for production:
  // const prodOnlyLogger = pino({
  //   level: logLevel,
  //   redact: ['req.headers.authorization', 'user.token', 'botToken'],
  //   // No pino-pretty transport for production JSON logs
  // });
  // logger = prodOnlyLogger; // This would reassign the exported logger
  // For this example, the existing setup with pino-pretty will often automatically switch
  // to JSON in production if stdout is not a TTY. The main point is to be aware.
}

export default logger;
