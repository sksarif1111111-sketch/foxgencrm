import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  House,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Receipt,
  Settings,
  ShoppingBag,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FoxgenBrand } from "./FoxgenBrand";
import { GlobalSearch } from "./GlobalSearch";

const NAV = [
  { label: "Overview", items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "FOXGEN Store",
    items: [
      { to: "/foxgen-orders", label: "Store Orders", icon: ShoppingBag },
      { to: "/foxgen-customers", label: "Store Members", icon: Users },
      { to: "/store", label: "Store Connection", icon: Link2 },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/orders", label: "Native Orders", icon: Receipt },
      { to: "/orders/new", label: "Manual Order", icon: PlusCircle },
      { to: "/customers", label: "Customers", icon: Users },
      { to: "/products", label: "Products", icon: Package },
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

export function AppShell({ children, email }: { children: ReactNode; email: string | null }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isActive = (path: string) =>
    pathname === path ||
    (pathname.startsWith(`${path}/`) && !(path === "/orders" && pathname === "/orders/new"));
  const current = NAV.flatMap(({ items }) => [...items]).find(({ to }) => isActive(to));
  const detail = current && pathname.replace(/\/$/, "") !== current.to;
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  function navigation(compact = false) {
    return (
      <nav aria-label="CRM navigation" className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5">
        {NAV.map(({ label, items }) => (
          <div key={label} className="space-y-1">
            {!compact && (
              <p className="px-3 pb-1 text-[11px] font-extrabold uppercase text-sidebar-muted">
                {label}
              </p>
            )}
            {items.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                title={label}
                aria-label={label}
                aria-current={isActive(to) ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "crm-motion flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-primary",
                  compact && "justify-center px-0",
                  isActive(to) && "bg-sidebar-accent font-extrabold text-sidebar-primary",
                )}
              >
                <Icon className="size-[17px] shrink-0" />
                {!compact && label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    );
  }
  function owner(compact = false) {
    return (
      <div className="border-t pt-3">
        {!compact && (
          <div className="mb-2 flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-extrabold text-primary">
              FG
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold">Owner</p>
              <p className="truncate text-[11px] text-muted-foreground">{email}</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          className={cn("w-full text-muted-foreground", !compact && "justify-start")}
        >
          <LogOut />
          {!compact && "Sign out"}
        </Button>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r bg-sidebar px-3 pb-3 lg:flex",
          collapsed ? "w-[68px]" : "w-[228px]",
        )}
      >
        <div className="flex h-16 shrink-0 items-center border-b px-1">
          <Link to="/dashboard" aria-label="FOXGEN CRM dashboard">
            <FoxgenBrand compact={collapsed} />
          </Link>
        </div>
        {navigation(collapsed)}
        {owner(collapsed)}
      </aside>
      <div className={cn("min-w-0", collapsed ? "lg:ml-[68px]" : "lg:ml-[228px]")}>
        <header className="sticky top-0 z-30 grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-card px-3 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open menu"
              className="size-10 shrink-0 lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden shrink-0 text-muted-foreground lg:inline-flex"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
              <Link
                to="/dashboard"
                aria-label="Dashboard home"
                className="hidden shrink-0 text-muted-foreground hover:text-primary sm:inline-flex"
              >
                <House className="size-4" />
              </Link>
              <ChevronRight className="hidden size-3 shrink-0 text-muted-foreground sm:block" />
              {detail ? (
                <>
                  <Link to={current.to} className="truncate font-bold hover:text-primary">
                    {current.label}
                  </Link>
                  <ChevronRight className="hidden size-3 shrink-0 text-muted-foreground md:block" />
                  <span className="hidden shrink-0 text-muted-foreground md:block">Details</span>
                </>
              ) : (
                <span className="truncate font-extrabold">{current?.label ?? "FOXGEN CRM"}</span>
              )}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <GlobalSearch />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" aria-label="Owner menu" className="h-10 gap-2 px-1 sm:px-2">
                  <span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-extrabold text-primary">
                    FG
                  </span>
                  <span className="hidden sm:inline">Owner</span>
                  <ChevronDown className="hidden text-muted-foreground sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-[90vw]">
                <DropdownMenuLabel className="break-all">{email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto min-w-0 max-w-[1600px] px-4 py-6 sm:px-6 lg:px-7 xl:px-9">
          {children}
        </main>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-[270px] flex-col gap-0 bg-sidebar p-4">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="border-b pb-3">
            <FoxgenBrand />
          </div>
          {navigation()}
          {owner()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
