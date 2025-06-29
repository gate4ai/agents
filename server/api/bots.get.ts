import { allQuery } from "~/server/db";

interface BotPublicInfo {
  id: number;
  name: string;
  username: string;
}

export default defineEventHandler(async () => {
  const bots = await allQuery<BotPublicInfo>(
    "SELECT id, name, username FROM bots WHERE is_active = 1 ORDER BY name"
  );
  return { bots };
});
