## Техническое Задание: Платформа для AI Telegram-ботов

### 1. Описание Продукта

Этот документ описывает требования к MVP (Minimum Viable Product) платформы для создания и использования AI-агентов в виде Telegram-ботов.

**Ключевая концепция:**

Платформа предоставляет пул предопределенных, равнозначных Telegram-ботов. Пользователи могут взаимодействовать с любым из этих ботов. Основная функциональность заключается в том, что пользователь может для _каждого_ бота настроить свой уникальный системный промпт (роль или личность), превращая стандартного ассистента в специализированного агента (например, "Юрист", "Переводчик", "Шекспир").

Все боты поддерживают диалог с сохранением контекста. Управление настройками (смена промпта) и навигация между ботами осуществляются с помощью интуитивных Telegram-команд.

### 2. Архитектура Системы

Система реализована как монолитное Nuxt.js приложение, где серверная часть обрабатывает всю бизнес-логику.

**Компоненты:**

- **Backend (Nuxt Server-Side):**
  - **API-Эндпоинт для Вебхуков:** Единая точка входа для всех входящих обновлений от Telegram (`/server/api/telegram/webhook/[botToken].post.ts`).
  - **Обработчик Сообщений (`MessageHandler`):** Ядро логики. Анализирует входящие сообщения, определяет, является ли оно командой или обычным текстом, проверяет состояние сессии (например, режим ввода промпта) и делегирует обработку соответствующим сервисам.
  - **Сервис Авторизации (`AuthService`):** Управляет созданием и поиском пользователей в базе данных на основе их `telegram_id`.
  - **Сервис Управления Сессиями (`SessionService`):** Инкапсулирует работу с `chat_sessions`. Отвечает за хранение и обновление истории диалога (контекста) и управление состояниями пользователя (например, `awaiting_prompt`).
  - **Сервис Интеграции с AI (`AIManager`):** Абстрактный слой для взаимодействия с различными провайдерами языковых моделей (OpenAI, Gemini). Получает на вход историю сообщений и системный промпт, возвращает ответ.
  - **Сервис Взаимодействия с Telegram (`TelegramService`):** Обертка над Telegram Bot API для отправки сообщений, установки меню команд и других действий.
- **База Данных (SQLite):** Хранилище для всех персистентных данных.
- **Внешние Сервисы:**
  - Telegram Bot API
  - API языковых моделей (OpenAI, Gemini)

### 3. Схема Базы Данных

Используется SQLite. Ключевые таблицы:

- **`bots`**: Хранит информацию о предопределенных ботах, загружаемых при старте из переменных окружения (токен, имя, username).
- **`users`**: Профили пользователей, идентифицированных по `telegram_id`.
- **`user_bots`**: Таблица связи, хранящая кастомный системный промпт для связки "пользователь-бот".
- **`chat_sessions`**: Таблица для управления сессиями. Хранит для каждого чата:
  - **`history`**: JSON-массив сообщений для поддержания контекста диалога.
  - **`state`**: Текущее состояние сессии (например, `idle`, `awaiting_prompt`) для реализации сложной логики команд.
  - **`state_expires_at`**: Время истечения текущего состояния.

### 4. Шаги Реализации MVP

Шаги выстроены последовательно. Каждый шаг завершается работающей и тестируемой функциональностью.

---

#### **Шаг 1: Базовая Инфраструктура и Авторизация**

- **Статус:** ✅ **Выполнено**
- **Цель:** Подготовить основу приложения: сервер, базу данных и механизм регистрации пользователей.
- **Задачи:**
  1.  Настройка сервера Nuxt.js для приема вебхуков от Telegram.
  2.  Создание схемы БД (`bots`, `users`, `user_bots`, `chat_sessions`).
  3.  Реализация сидинга таблицы `bots` из переменных окружения.
  4.  Реализация команды `/start` для создания/поиска пользователя в БД (`AuthService`).
- **Тестирование:** Отправка команды `/start` новому боту приводит к созданию записи в таблице `users` и отправке приветственного сообщения.

---

#### **Шаг 2: Интеграция с AI и Обработка Текстовых Сообщений**

- **Статус:** ✅ **Выполнено**
- **Цель:** Научить бота отвечать на текстовые сообщения с использованием AI.
- **Задачи:**
  1.  Создание `AIManager` для работы с API языковых моделей.
  2.  Интеграция `AIManager` в `MessageHandler` для обработки любых текстовых сообщений, не являющихся командами.
  3.  Реализация получения кастомного промпта из `user_bots` или использования промпта по умолчанию.
- **Тестирование:** Любое текстовое сообщение, отправленное боту, получает осмысленный ответ, сгенерированный AI.

---

#### **Шаг 3: Контекстная Память для Диалогов**

- **Статус:** ✅ **Выполнено**
- **Цель:** Обеспечить поддержание контекста в диалоге, чтобы бот помнил предыдущие реплики.
- **Задачи:**
  1.  Добавление таблицы `chat_sessions` в схему БД.
  2.  Создание `SessionService` для управления историей сообщений.
  3.  Модификация `MessageHandler`: перед вызовом AI загружать историю из `SessionService`, а после получения ответа — обновлять ее, сохраняя пару "сообщение пользователя" + "ответ ассистента".
- **Тестирование:**
  1.  Отправить боту: "Меня зовут Иван". Бот отвечает.
  2.  Отправить следующий вопрос: "Как меня зовут?". Бот должен ответить: "Иван".

---

#### **Шаг 4: Меню Команд Бота**

- **Статус:** ✅ **Выполнено**
- **Цель:** Добавить стандартную кнопку "Меню" в интерфейс Telegram со списком основных команд для удобства пользователя.
- **Задачи:**
  1.  В `telegramService.ts` создать новую функцию `setBotCommands(botToken, commands)`, которая вызывает метод `setMyCommands` Telegram API.
  2.  В `startCommandHandler.ts` после отправки приветственного сообщения вызывать `setBotCommands` со списком команд: `/start`, `/bots`, `/setprompt`.
- **Тестирование:** После отправки команды `/start` в клиенте Telegram появляется кнопка "Меню". При нажатии на нее отображается список доступных команд.

---

#### **Шаг 5: Улучшенная Команда `/bots`**

- **Статус:** ✅ **Выполнено**
- **Цель:** Заменить `/mybots`. Новая команда должна выводить единый список всех ботов, разделенный на "настроенных" и "доступных", с кликабельными ссылками для быстрого перехода.
- **Задачи:**
  1.  Переименовать `myBotsCommandHandler.ts` в `botsCommandHandler.ts`. Обновить вызов в `[botToken].post.ts`.
  2.  Внутри `botsCommandHandler.ts`:
      - Получить из БД список всех ботов (`getAllBots`). Убедиться, что у ботов в БД есть поле `username`.
      - Получить список ботов, для которых у текущего пользователя есть кастомный промпт (`getUserBots`).
      - Разделить общий список на две группы: настроенные и доступные.
      - Сформировать текстовое сообщение с использованием Markdown-разметки для ссылок: `🤖 [Bot Name](https://t.me/bot_username)`. Для настроенных ботов дополнительно указать их текущий промпт.
- **Тестирование:** Отправка команды `/bots` возвращает отформатированный список. Ссылки в списке кликабельны и ведут на чаты с соответствующими ботами.

---

#### **Шаг 6: Stateful-команда `/setprompt` с динамическим меню**

- **Статус:** ✅ **Выполнено**
- **Цель:** Изменить команду `/setprompt`, чтобы она переводила сессию в режим ожидания ввода и **меняла меню команд** на контекстуальное.
- **Задачи:**
  1.  В `SessionService` создать функцию `setSessionState(chatId, state, expiresInMinutes)`.
  2.  В `setPromptCommandHandler.ts`:
      - Вызвать `setSessionState`, установив `state = 'awaiting_prompt'` и `expires_at` на 5 минут вперед.
      - **Изменить меню команд**, отправив через `setBotCommands` только одну команду: `/cancel`.
      - Отправить пользователю сообщение: "Пожалуйста, введите новый системный промпт... Для отмены введите /cancel."
  3.  В `MessageHandler.ts` (при обработке текста в состоянии `awaiting_prompt`):
      - После успешного сохранения промпта сбросить состояние сессии в `idle`.
      - **Восстановить стандартное меню команд** (`/start`, `/bots`, `/setprompt`, `/cancel`).
  4.  В `cancelCommandHandler.ts`:
      - После сброса состояния сессии в `idle` **восстановить стандартное меню команд**.
- **Тестирование:**
  1.  Отправить `/setprompt`. Бот отвечает, что ждет промпт. В меню команд Telegram остается только `/cancel`.
  2.  Отправить "Ты — пират". Бот подтверждает сохранение. Меню команд возвращается к стандартному виду.
  3.  Отправить `/setprompt` еще раз, а затем `/cancel`. Меню команд возвращается к стандартному виду.

---

#### **Шаг 7: Фоновый Планировщик Задач (Scheduler)**

- **Статус:** ✅ **Выполнено**
- **Цель:** Создать надежный механизм для выполнения отложенных задач, который будет проактивно уведомлять пользователя об истечении времени ожидания ввода промпта.
- **Архитектура:** Централизованный планировщик на основе опроса БД (DB-Polling).
- **Задачи:**
  1.  Создать новый сервис `schedulerService.ts`.
  2.  Внутри него реализовать функцию `initializeScheduler()`, которая с помощью `setInterval` (например, раз в 30 секунд) будет выполнять проверку.
  3.  Логика проверки: выполнить SQL-запрос для поиска всех сессий, у которых `state = 'awaiting_prompt'` и `state_expires_at` уже прошел.
  4.  Для каждой найденной просроченной сессии:
      - Отправить пользователю сообщение: "Режим ввода промпта истек. Операция отменена."
      - Сбросить состояние сессии в `idle` (`setSessionState`).
      - Восстановить стандартное меню команд (`setBotCommands`).
  5.  Вызвать `initializeScheduler()` один раз при старте сервера (например, из Nitro-плагина `database.ts`).
- **Тестирование:**
  1. Отправить `/setprompt`.
  2. Подождать >5 минут, ничего не отправляя.
  3. Бот должен **сам прислать сообщение** об истечении времени. Меню команд должно вернуться к стандартному.

---

#### **Шаг 8: Поддержка Голосовых Сообщений**

- **Статус:** ✅ **Выполнено**
- **Цель:** Добавить возможность обработки голосовых сообщений через транскрибацию в текст.
- **Задачи:**
  1.  ✅ В `AIProvider` добавлен метод `transcribeAudio` для транскрибации аудио.
  2.  ✅ Реализован метод в провайдерах:
      - OpenAI с моделью Whisper
      - Google Cloud Speech-to-Text для Gemini провайдера
  3.  ✅ Создан отдельный `ASRManager` для управления провайдерами транскрипции независимо от AI провайдеров.
  4.  ✅ Добавлены функции в `telegramService` для скачивания файлов (`getFileInfo`, `downloadFile`).
  5.  ✅ Создан `voiceHandler` для обработки голосовых сообщений.
  6.  ✅ В `[botToken].post.ts` добавлена обработка сообщений типа `voice`.
  7.  ✅ Транскрибированный текст сохраняется в истории сообщений и передается в `handleTextMessage`.
- **Тестирование:** ✅ Полное покрытие unit и интеграционными тестами. Запись и отправка голосового сообщения боту приводит к получению текстового ответа на заданный голосом вопрос.

---

### 5. Качество и Тестирование

Для обеспечения стабильности и надежности продукта, вся ключевая бизнес-логика должна быть покрыта автоматическими тестами. Проект использует подход с разделением тестов на unit-тесты для изолированной проверки модулей и интеграционные тесты для проверки их взаимодействия.

Детальное описание стратегии тестирования, существующего покрытия и областей для улучшения находится в документе **[docs/testing.md](./testing.md)**.
