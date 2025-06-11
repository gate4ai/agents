// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp, toNodeListener, defineEventHandler } from "h3";
import supertest from "supertest";
import webhookHandler from "~/server/api/telegram/webhook/[botToken].post";
import { handleStartCommand } from "~/server/services/commands/startCommandHandler";
import { handleTextMessage } from "~/server/services/messageHandler";
import { handleVoiceMessage } from "~/server/services/voiceHandler";

// Используем тот же setup, что и для unit-тестов. Он идеально подходит.
import "~/test/unit-setup";

// Мокируем runtime config ПЕРЕД импортом модулей
vi.mock("#imports", () => ({
  useRuntimeConfig: () => ({
    telegramBotApiSecretToken: "test-secret-token",
    aiProvider: "openai",
    openaiApiKey: "test-openai-key",
    geminiApiKey: "test-gemini-key",
    asrProvider: "openai",
    googleCloudKeyFile: "",
  }),
}));

// Мокируем логгер
vi.mock("~/server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

// Мокируем AIManager
vi.mock("~/server/services/ai/AIManager", () => ({
  default: {
    getInstance: () => ({
      generateTextResponse: vi.fn().mockResolvedValue("Mocked AI response"),
    }),
  },
}));

// Мокируем реальные обработчики команд и сообщений
vi.mock("~/server/services/commands/startCommandHandler");
vi.mock("~/server/services/messageHandler");
vi.mock("~/server/services/voiceHandler");

describe("Integration: Telegram Webhook", () => {
  // Создаем инстанс нашего приложения h3
  const app = createApp();
  // Создаем обработчик, который будет работать на любом пути
  app.use(
    defineEventHandler(async (event) => {
      // Извлекаем botToken из URL
      const url = event.node.req.url || "";
      const match = url.match(/\/api\/telegram\/webhook\/([^/?\\s]+)/);
      const botToken = match ? match[1] : null;

      // Устанавливаем параметры как в Nuxt
      event.context.params = { botToken: botToken || "" };

      // Вызываем оригинальный обработчик
      return await webhookHandler(event);
    })
  );

  // Создаем агент для отправки запросов
  const agent = supertest(toNodeListener(app));

  const MOCK_BOT_TOKEN = "12345:test-token";
  const MOCK_SECRET_TOKEN = "test-secret-token";

  beforeEach(() => {
    // Сбрасываем все моки перед каждым тестом
    vi.clearAllMocks();
  });

  it("should reject request with invalid secret token", async () => {
    const response = await agent
      .post(`/api/telegram/webhook/${MOCK_BOT_TOKEN}`)
      .set("X-Telegram-Bot-Api-Secret-Token", "invalid-token")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.message).toContain("Invalid secret token");
  });

  it("should route /start command to handleStartCommand", async () => {
    const mockMessage = {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 123, is_bot: false, first_name: "Test" },
        chat: { id: 123, type: "private" },
        date: Date.now() / 1000,
        text: "/start",
      },
    };

    const response = await agent
      .post(`/api/telegram/webhook/${MOCK_BOT_TOKEN}`)
      .set("X-Telegram-Bot-Api-Secret-Token", MOCK_SECRET_TOKEN)
      .send(mockMessage);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");

    // Главная проверка: был ли вызван правильный обработчик
    expect(handleStartCommand).toHaveBeenCalledOnce();
    expect(handleTextMessage).not.toHaveBeenCalled();
  });

  it("should route a regular text message to handleTextMessage", async () => {
    const mockMessage = {
      update_id: 2,
      message: {
        message_id: 2,
        from: { id: 123, is_bot: false, first_name: "Test" },
        chat: { id: 123, type: "private" },
        date: Date.now() / 1000,
        text: "Hello, bot!",
      },
    };

    const response = await agent
      .post(`/api/telegram/webhook/${MOCK_BOT_TOKEN}`)
      .set("X-Telegram-Bot-Api-Secret-Token", MOCK_SECRET_TOKEN)
      .send(mockMessage);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");

    // Главная проверка
    expect(handleTextMessage).toHaveBeenCalledOnce();
    expect(handleStartCommand).not.toHaveBeenCalled();
  });

  it("should route voice message to handleVoiceMessage", async () => {
    const mockVoiceMessage = {
      update_id: 3,
      message: {
        message_id: 3,
        from: { id: 123, is_bot: false, first_name: "Test" },
        chat: { id: 123, type: "private" },
        date: Date.now() / 1000,
        voice: {
          file_id: "FILE_ID_12345",
          file_unique_id: "unique_12345",
          duration: 5,
          mime_type: "audio/ogg",
        },
      },
    };

    const response = await agent
      .post(`/api/telegram/webhook/${MOCK_BOT_TOKEN}`)
      .set("X-Telegram-Bot-Api-Secret-Token", MOCK_SECRET_TOKEN)
      .send(mockVoiceMessage);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");

    // Главная проверка: был ли вызван правильный обработчик
    expect(handleVoiceMessage).toHaveBeenCalledOnce();
    expect(handleTextMessage).not.toHaveBeenCalled();
    expect(handleStartCommand).not.toHaveBeenCalled();
  });
});
