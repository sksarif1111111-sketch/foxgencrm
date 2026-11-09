import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/store/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { handleStoreSync } = await import("@/lib/store-sync");
          return await handleStoreSync(request, {
            authorize: async (hash) => {
              // Credential lookup only. Do not read/write store records before authorization.
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data, error } = await supabaseAdmin.from("store_integrations").select("id").eq("key_hash", hash).eq("enabled", true).maybeSingle();
              if (error) throw new Error(error.message);
              return data?.id ?? null;
            },
            ingest: async (id, batch) => {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data, error } = await supabaseAdmin.rpc("ingest_store_records", { _integration_id: id, _records: JSON.parse(JSON.stringify(batch.records)) });
              if (error) throw new Error(error.message);
              return data;
            },
          });
        } catch (error) {
          console.error("Store sync failed", error instanceof Error ? error.message : "Unknown error");
          return Response.json({ error: "Store sync unavailable; retry the same batch" }, { status: 503, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});