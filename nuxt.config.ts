// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-05-15",
  devtools: { enabled: true },

  sourcemap: {
    server: true,
    client: true,
  },

  modules: [
    "@nuxt/eslint",
    "@nuxt/fonts",
    "@nuxt/icon",
    "@nuxt/image",
    "@nuxt/scripts",
    "@nuxt/test-utils",
    "@nuxt/ui",
    "@nuxt/content",
  ],

  runtimeConfig: {
    // General
    dbFileName: process.env.DB_FILE_NAME || "gate4ai.db",
    defaultLanguage: process.env.DEFAULT_LANGUAGE || "en",

    // Telegram
    telegramBotApiSecretToken: process.env.TELEGRAM_BOT_API_SECRET_TOKEN || "",

    // AI Service Configuration
    aiProvider: process.env.AI_PROVIDER || "openai", // 'openai', 'gemini', etc.
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",

    // ASR (Speech-to-Text) Service Configuration
    asrProvider: process.env.ASR_PROVIDER || "openai", // 'openai', 'google', etc.
    googleCloudKeyFile: process.env.GOOGLE_CLOUD_KEY_FILE || "",

    // Keys within public are also exposed client-side
    public: {},
  },

  hooks: {
    close: (nuxt) => {
      if (!nuxt.options._prepare) process.exit();
    },
  },

  vite: process.env.NODE_ENV?.includes("test")
    ? {}
    : {
        server: {
          hmr: {
            protocol: "wss",
            host: "game-dodo-willingly.ngrok-free.app",
            clientPort: 443,
          },
          allowedHosts: ["game-dodo-willingly.ngrok-free.app"],
        },
      },
});
