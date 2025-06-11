import { http, HttpResponse, passthrough } from "msw";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot*";
const OPENAI_API_BASE = "https://api.openai.com/v1";

export const handlers = [
  http.all("http://127.0.0.1:*", () => {
    return passthrough();
  }),

  http.post(`${TELEGRAM_API_BASE}/sendMessage`, async () => {
    console.log("MSW intercepted sendMessage request");
    return HttpResponse.json({ ok: true, result: {} });
  }),

  http.post(`${TELEGRAM_API_BASE}/setMyCommands`, async () => {
    console.log("MSW intercepted setMyCommands request");
    return HttpResponse.json({ ok: true, result: true });
  }),

  http.post(`${OPENAI_API_BASE}/chat/completions`, async () => {
    console.log("MSW intercepted OpenAI request");
    return HttpResponse.json({
      id: "chatcmpl-123",
      object: "chat.completion",
      created: 1677652288,
      model: "gpt-3.5-turbo-0613",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello from mocked OpenAI!" },
          finish_reason: "stop",
        },
      ],
    });
  }),
];
