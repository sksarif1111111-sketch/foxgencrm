import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("orders").select("id").limit(1);
          if (error) throw new Error("db");
          return Response.json({ status: "healthy", timestamp: new Date().toISOString() });
        } catch {
          return Response.json({ status: "unhealthy", timestamp: new Date().toISOString() }, { status: 500 });
        }
      },
    },
  },
});
