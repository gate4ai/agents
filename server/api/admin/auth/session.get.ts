import { defineEventHandler } from "h3";
import { useRuntimeConfig } from "#imports";
import logger from "~/server/utils/logger";

// useSession is auto-imported by @sidebase/nuxt-session

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { data: session } = await useSession(event, {
    password: config.session.password,
  });

  logger.info(
    { sessionValue: session.value },
    "Checking admin session status."
  );

  if (session.value?.user) {
    return {
      loggedIn: true,
      user: session.value.user,
    };
  } else {
    return {
      loggedIn: false,
    };
  }
});
