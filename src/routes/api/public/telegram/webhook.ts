import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { deriveWebhookSecret } from "@/lib/telegram.server";
import { handleUpdate } from "@/lib/bot.server";
import { errorMessage, logger } from "@/lib/logger";

function safeEqual(a: string, b: string): boolean {
  const l = Buffer.from(a);
  const r = Buffer.from(b);
  return l.length === r.length && timingSafeEqual(l, r);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let expected: string;
        try {
          expected = deriveWebhookSecret();
        } catch (e) {
          logger.error("webhook misconfigured", { error: errorMessage(e) });
          return new Response("Not configured", { status: 500 });
        }
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

        let update: unknown;
        try {
          update = await request.json();
        } catch {
          return Response.json({ ok: true, ignored: true });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await handleUpdate(supabaseAdmin, update);
        } catch (e) {
          logger.error("webhook processing failed", { error: errorMessage(e) });
        }
        // Always 200 so Telegram does not re-deliver; duplicates are also de-duplicated by update_id.
        return Response.json({ ok: true });
      },
    },
  },
});
