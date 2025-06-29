import { defineEventHandler, readBody, createError } from "h3";
import { createHmac, createHash } from "crypto";
import { useRuntimeConfig } from "#imports";
import { getTokenByName } from "~/server/services/botRegistryService";
import logger from "~/server/utils/logger";
// useSession is auto-imported by @sidebase/nuxt-session
// import { getSession } from "h3";

interface TelegramAuthPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  bot_username: string;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody<TelegramAuthPayload>(event);

  if (!body || !body.hash || !body.bot_username) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid request body",
    });
  }

  const botToken = getTokenByName(body.bot_username);
  if (!botToken) {
    throw createError({
      statusCode: 404,
      statusMessage: `Bot with username '${body.bot_username}' not found on server.`,
    });
  }

  const { hash, bot_username, ...userData } = body;

  const dataCheckString = Object.keys(userData)
    .sort()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((key) => `${key}=${(userData as any)[key]}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const hmac = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (hmac !== hash) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: Invalid hash",
    });
  }

  const adminIds = config.adminTelegramIds;

  if (!adminIds || !Array.isArray(adminIds) || adminIds.length === 0) {
    const errorMessage = `ADMIN_TELEGRAM_IDS is not configured or empty. Access denied for user ${body.id}`;
    logger.error(errorMessage);
    throw createError({
      statusCode: 500,
      statusMessage: `Переменная окружения ADMIN_TELEGRAM_IDS не задана. Свяжитесь с системным администратором. Ваш Telegram User ID: ${body.id}`,
    });
  }

  if (!adminIds.includes(String(body.id))) {
    throw createError({
      statusCode: 403,
      statusMessage: `Доступ запрещен. Вы не являетесь администратором. Ваш Telegram User ID: ${body.id}`,
    });
  }

  const { update } = await useSession(event, {
    password: config.session.password,
  });

  const userPayload = {
    user: {
      telegramId: body.id,
      username: body.username,
      firstName: body.first_name,
      lastName: body.last_name,
      photoUrl: body.photo_url,
    },
  };

  await update(userPayload);

  logger.info(
    { user: userPayload.user },
    "Admin session successfully created and updated."
  );

  return { loggedIn: true, message: "Authentication successful" };
});
