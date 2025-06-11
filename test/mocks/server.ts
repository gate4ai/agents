import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Создаем сервер для моков, который будет работать в Node.js
export const server = setupServer(...handlers);
