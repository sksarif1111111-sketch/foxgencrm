import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, LayoutDashboard, LogOut, Menu, Package, PlusCircle, Receipt, Settings, Store, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSettings } from "@/lib/crm-queries";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/orders", label: "Orders", icon: Receipt },
  { to: "/orders/new", label: "Add order", icon: PlusCircle },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/products", label: "Products", icon: Package },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/store", label: "FoxGen Store", icon: Store },
  { to: "/foxgen-orders", label: "FoxGen Store Orders", icon: Receipt },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          activeOptions={{ exact: to === "/orders" }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-primary"
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ children, email }: { children: ReactNode; email: string | null }) {
  const [open, setOpen] = useState(false);
  const { data: s } = useSettings();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const brand = (
    <div className="mb-8 px-3">
      <div className="font-display text-lg font-bold text-sidebar-foreground">{s?.store_name ?? "Digital Store"}</div>
      <div className="text-xs uppercase tracking-[0.18em] text-sidebar-primary">Sales ledger</div>
    </div>
  );

  const footer = (
    <div className="mt-auto border-t border-sidebar-border px-3 pt-4">
      <p className="truncate text-xs text-sidebar-muted">{email}</p>
      <button onClick={signOut} className="mt-2 flex items-center gap-2 text-sm text-sidebar-foreground hover:text-sidebar-primary">
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-sidebar p-4 lg:flex">
        {brand}
        <NavList />
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-sidebar px-4 py-3 lg:hidden">
        <span className="font-display font-bold text-sidebar-foreground">{s?.store_name ?? "Digital Store"}</span>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="highlight">
            <Link to="/orders/new">
              <PlusCircle /> Order
            </Link>
          </Button>
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-md p-2 text-sidebar-foreground">
            <Menu className="size-5" />
          </button>
        </div>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-64 flex-col border-sidebar-border bg-sidebar p-4">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {brand}
          <NavList onNavigate={() => setOpen(false)} />
          {footer}
        </SheetContent>
      </Sheet>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
