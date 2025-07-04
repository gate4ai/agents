# Архитектура Проекта "AI Telegram Bot Platform"

Этот документ является основным руководством по структуре и архитектуре проекта. Его цель — обеспечить единое понимание кодовой базы для всех участников разработки, включая AI-ассистентов. При внесении изменений или добавлении новой функциональности **следует строго придерживаться** описанных здесь принципов и использовать существующие сущности.

## 1. Общая Концепция

Проект представляет собой **монолитное Nuxt.js приложение**, где вся логика (API, обработка вебхуков, взаимодействие с БД) сосредоточена в серверной части (`/server`).

**Ключевые принципы архитектуры:**

1.  **Сервис-ориентированный подход:** Логика разделена на небольшие, переиспользуемые сервисы (`/server/services`), каждый из которых отвечает за свою область (авторизация, работа с AI, сессии).
2.  **Единая точка входа:** Все обновления от Telegram поступают на один эндпоинт `/server/api/telegram/webhook/[botToken].post.ts`, который выступает в роли маршрутизатора.
3.  **Абстракция от внешних API:** Взаимодействие с внешними сервисами (Telegram, OpenAI, Gemini) инкапсулировано в соответствующих сервисах (`telegramService`, `AIManager`), чтобы минимизировать зависимость основного кода от конкретных реализаций.
4.  **Централизованная работа с БД:** Все операции с базой данных (SQLite) выполняются через хелперы в `/server/db/index.ts`. Модели данных (таблицы) определены там же.

## 2. Структура Директорий и Файлов

Ниже приведено описание ключевых файлов и директорий проекта.

---

### 📂 `/.github/workflows/`

- **`ci.yml`**: Файл конфигурации GitHub Actions для непрерывной интеграции (CI). Запускает линтинг и тесты при каждом push или pull request в ветку `main`.

### 📂 `/docs/`

- **`ARCHITECTURE.md`**: Этот файл. Описание архитектуры.
- **`Terms of Reference.md`**: Техническое задание на проект.
- **`testing.md`**: Описание стратегии тестирования, текущего покрытия и недостающих тестов.

### 📂 `/public/`

- **`robots.txt`**: Стандартный файл для поисковых роботов. В данном проекте запрещает индексацию.

### 📂 `/server/`

Это ядро нашего приложения.

#### 📂 `/server/api/`

- **`/telegram/webhook/[botToken].post.ts`**: **Главный эндпоинт и маршрутизатор**.
  - **Роль:** Принимает POST-запросы от вебхуков Telegram.
  - **Логика:**
    1.  Валидирует секретный токен (`X-Telegram-Bot-Api-Secret-Token`).
    2.  Парсит тело запроса (`TelegramUpdate`).
    3.  Определяет тип сообщения (команда или текст).
    4.  Вызывает соответствующий обработчик команды (`handleStartCommand`, `handleSetPromptCommand` и т.д.) или общий обработчик текста (`handleTextMessage`).
    5.  Обрабатывает ошибки и логирует все действия.

#### 📂 `/server/db/`

- **`index.ts`**: Центральный файл для работы с базой данных SQLite.
  - **Роль:** Инициализация соединения с БД, создание таблиц и триггеров.
  - **Содержит:**
    - `initializeDatabase()`: Функция, вызываемая при старте сервера для подготовки БД. **Здесь определена схема БД (`CREATE TABLE ...`)**.
    - `getDB()`: Возвращает инстанс БД.
    - `runQuery`, `getQuery`, `allQuery`: Асинхронные хелперы для выполнения SQL-запросов.
- **`seedBots.ts`**: Скрипт для начального заполнения таблицы `bots` из переменных окружения (`TELEGRAM_BOT_1_TOKEN` и т.д.).

#### 📂 `/server/plugins/`

- **`database.ts`**: Nitro-плагин, который гарантирует вызов `initializeDatabase()` при старте сервера. Это обеспечивает готовность БД к приему запросов, **а также запускает фоновый планировщик задач (`schedulerService`)**.

#### 📂 `/server/services/`

Здесь находится вся бизнес-логика, разделенная на сервисы.

##### 📂 `/server/services/ai/`

- **`AIManager.ts`**: **Singleton-фабрика** для работы с AI.
  - **Роль:** Предоставляет единый интерфейс (`generateTextResponse`) для всей системы, скрывая детали реализации конкретного AI-провайдера.
  - **Логика:** На основе `runtimeConfig.aiProvider` (`openai` или `gemini`) создает и возвращает нужный инстанс провайдера.
- **`ASRManager.ts`**: **Singleton-фабрика** для работы с транскрипцией аудио.
  - **Роль:** Предоставляет единый интерфейс (`transcribeAudio`) для транскрипции голосовых сообщений, независимо от AI провайдера.
  - **Логика:** На основе `runtimeConfig.asrProvider` (`openai` или `google`) создает и возвращает нужный инстанс провайдера для транскрипции.
- **`types.ts`**: Определяет общие типы для AI-взаимодействия (`ChatMessage`, `AIProvider`), включая метод `transcribeAudio` для транскрипции аудио.
- **`/providers/openai.ts`**: Реализация `AIProvider` для работы с OpenAI API, включая Whisper для транскрипции.
- **`/providers/gemini.ts`**: Реализация `AIProvider` для работы с Gemini API и Google Cloud Speech-to-Text для транскрипции.

##### 📂 `/server/services/commands/`

- **`startCommandHandler.ts`**: Обработчик команды `/start`. Вызывает `findOrCreateUser`.
- **`setPromptCommandHandler.ts`**: Обработчик команды `/setprompt`. Устанавливает кастомный промпт для связки "пользователь-бот".
- **`myBotsCommandHandler.ts`**: Обработчик команды `/mybots`. Показывает пользователю список доступных ботов и их текущие настройки.

##### Другие сервисы:

- **`authService.ts`**:
  - **Роль:** Управление пользователями.
  - **Ключевая функция:** `findOrCreateUser(telegramUser)` — находит пользователя в БД по `telegram_id` или создает нового, если он не найден. Возвращает объект пользователя из БД.
- **`botUserService.ts`**:
  - **Роль:** Управляет связями между пользователями, ботами и их настройками (промптами).
  - **Функции:** `getBotByToken`, `getUserBotPrompt`, `setUserBotPrompt` и т.д.
- **`messageHandler.ts`**:
  - **Роль:** Обработка всех не-командных текстовых сообщений.
  - **Логика:**
    1.  Получает пользователя и бота из БД.
    2.  Получает историю чата из `sessionService`.
    3.  Получает системный промпт (кастомный или по умолчанию).
    4.  Формирует полный контекст и передает его в `AIManager`.
    5.  Отправляет ответ пользователю через `telegramService`.
    6.  Обновляет историю диалога в `sessionService`.
- **`sessionService.ts`**:
  - **Роль:** Управление контекстом диалога и состоянием сессии.
  - **Ключевые функции:**
    - `getSession(chatId)`: Получает сессию чата, включая историю сообщений.
    - `updateHistory(...)`: Обновляет историю сообщений в сессии после каждого обмена репликами.
- **`schedulerService.ts`**:
  - **Роль**: Отвечает за выполнение отложенных и периодических задач. Использует механизм опроса БД (DB-polling) для поиска и обработки просроченных сессий или других фоновых заданий.
- **`telegramService.ts`**:
  - **Роль:** Инкапсуляция вызовов Telegram Bot API.
  - **Ключевые функции:**
    - `sendMessage(botToken, chatId, text)` — отправляет сообщение пользователю.
    - `getFileInfo(botToken, fileId)` — получает информацию о файле по ID.
    - `downloadFile(botToken, filePath)` — скачивает файл с серверов Telegram.
- **`voiceHandler.ts`**:
  - **Роль:** Обработка голосовых сообщений.
  - **Логика:**
    1. Получает информацию о голосовом файле через `getFileInfo`.
    2. Скачивает аудиофайл через `downloadFile`.
    3. Транскрибирует аудио через `ASRManager`.
    4. Передает транскрибированный текст в `handleTextMessage` для дальнейшей обработки.

#### 📂 `/server/types/`

- **`telegram.ts`**: TypeScript-типы для объектов Telegram API (`TelegramUpdate`, `TelegramMessage`, `TelegramUser`, `TelegramVoice`).

#### 📂 `/server/utils/`

- **`logger.ts`**: Настройка логгера `pino` для структурированного и удобочитаемого логирования во всем приложении.

---

### 📂 `/test/`

Директория с тестами.

- **`setup.ts`**: Глобальный файл настройки для `vitest`. Мокирует `useRuntimeConfig` для использования тестовой БД и конфигурации. Управляет созданием и очисткой тестовой БД перед и после тестов.
- **`/e2e/`**: End-to-end тесты. Проверяют всю систему целиком через HTTP-запросы к API.
- **`/unit/`**: Unit-тесты. Проверяют отдельные функции и сервисы в изоляции.
- **`/mocks/`**: Моки для внешних сервисов (Telegram, OpenAI) с использованием `msw` (Mock Service Worker).

Более подробное описание стратегии тестирования, текущего покрытия и областей для улучшения находится в документе [docs/testing.md](./testing.md).

---

### 📄 Корневые файлы

- **`nuxt.config.ts`**: Основной конфигурационный файл Nuxt.js. Определяет модули, `runtimeConfig` (переменные окружения включая `asrProvider` и `googleCloudKeyFile`), настройки Vite и т.д.
- **`package.json`**: Список зависимостей и скриптов проекта (`npm run test`, `npm run dev`).
- **`vitest.config.ts`**: Конфигурация тестового фреймворка `vitest`.
