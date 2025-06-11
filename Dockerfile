# Dockerfile для AI Telegram Bot Platform

# Используем официальный Node.js образ
FROM node:20-alpine AS base

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production && npm cache clean --force

# Стадия для разработки и сборки
FROM node:20-alpine AS build

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем все зависимости (включая dev)
RUN npm ci

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# Финальная стадия для production
FROM node:20-alpine AS production

# Создаем пользователя без привилегий
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nuxt -u 1001

WORKDIR /app

# Копируем зависимости из base стадии
COPY --from=base /app/node_modules ./node_modules

# Копируем собранное приложение
COPY --from=build /app/.output ./.output
COPY --from=build /app/package*.json ./

# Создаем директорию для базы данных и логов
RUN mkdir -p /app/data /app/logs && \
    chown -R nuxt:nodejs /app

# Переключаемся на пользователя nuxt
USER nuxt

# Указываем порт
EXPOSE 3000

# Переменные окружения
ENV NODE_ENV=production
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000
ENV DB_FILE_NAME=/app/data/gate4ai.db

# Проверка здоровья
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Запускаем приложение
CMD ["node", ".output/server/index.mjs"] 