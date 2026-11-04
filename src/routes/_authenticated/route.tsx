import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const { data: isOwner, isLoading } = useQuery({
    queryKey: ["is-owner", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  });

  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (!isOwner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-bold">Owner access only</h1>
          <p className="mt-2 text-sm text-muted-foreground">This account isn't the store owner, so the dashboard is locked.</p>
          <Button className="mt-6" variant="outline" onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/auth"))}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }
  return (
    <AppShell email={user.email ?? null}>
      <Outlet />
    </AppShell>
  );
}
