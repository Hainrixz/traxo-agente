import { MockMessaging } from "./mock.ts";
import type { MessagingProvider } from "./types.ts";
import { ZernioMessaging } from "./zernio.ts";

/** Zernio real si hay ZERNIO_API_KEY; si no, mensajes simulados (y la UI lo dice). */
export function messagingFromEnv(
  env: Record<string, string | undefined> = process.env,
  profileId?: string,
): MessagingProvider {
  if (env.ZERNIO_API_KEY) {
    return new ZernioMessaging({
      apiKey: env.ZERNIO_API_KEY,
      webhookSecret: env.ZERNIO_WEBHOOK_SECRET,
      profileId: env.ZERNIO_PROFILE_ID ?? profileId,
    });
  }
  return new MockMessaging();
}
