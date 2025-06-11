import type { BotCommand } from "./telegramService";

// Standard bot commands that appear in the main menu
export const STANDARD_COMMANDS: BotCommand[] = [
  {
    command: "start",
    description: "Start the bot and get welcome message",
  },
  {
    command: "bots",
    description: "List all available bots and their settings",
  },
  { command: "setprompt", description: "Set a custom prompt for this bot" },
  { command: "cancel", description: "Cancel current operation" },
];

// Contextual commands that appear during prompt input
export const CONTEXTUAL_COMMANDS: BotCommand[] = [
  { command: "cancel", description: "Cancel current operation" },
];
