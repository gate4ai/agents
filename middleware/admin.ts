import logger from "~/server/utils/logger";
import type { NuxtError } from "#app";

export default defineNuxtRouteMiddleware(async (to, _from) => {
  // Skip middleware on login page to prevent redirect loop
  if (to.path === "/admin/login") {
    return;
  }

  try {
    const data = await $fetch<{ loggedIn: boolean }>("/api/admin/auth/session");

    if (!data.loggedIn) {
      return navigateTo("/admin/login");
    }
  } catch (error) {
    const nuxtError = error as NuxtError;
    // Log the full error, including status and data
    logger.error(
      {
        error: {
          message: nuxtError.message,
          statusCode: nuxtError.statusCode,
          data: nuxtError.data,
        },
      },
      "Admin middleware session check failed, redirecting to login."
    );
    return navigateTo("/admin/login");
  }
});
