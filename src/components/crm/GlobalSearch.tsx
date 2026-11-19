import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Receipt, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { foxgenCustomerListOptions, foxgenListOptions } from "@/lib/foxgen-queries";
import { memberNumber } from "@/lib/foxgen-customers";
import { orderData, text } from "@/lib/foxgen-orders";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const enabled = open && term.length > 0;
  const orders = useQuery({ ...foxgenListOptions({ q: term }), enabled, refetchInterval: false });
  const members = useQuery({
    ...foxgenCustomerListOptions({ q: term }),
    enabled,
    refetchInterval: false,
  });
  const close = () => setOpen(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          aria-label="Global search"
          className="crm-motion size-10 sm:h-9 sm:w-60 sm:justify-start sm:px-3"
        >
          <Search className="text-muted-foreground" />
          <span className="hidden text-muted-foreground sm:inline">Search orders or members</span>
          <kbd className="ml-auto hidden rounded border bg-muted px-1 text-[10px] sm:inline">
            ⌘ K
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Search FOXGEN CRM</DialogTitle>
          <DialogDescription>Store orders and member directory</DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Search orders or members"
          placeholder="Order ID, member ID, name or email"
          value={input}
          maxLength={100}
          onChange={(e) => setInput(e.target.value)}
        />
        {input.trim() && (
          <div className="max-h-[55vh] space-y-4 overflow-auto" aria-live="polite">
            {term !== input.trim() || orders.isFetching || members.isFetching ? (
              <p className="text-sm text-muted-foreground">Searching…</p>
            ) : (
              <>
                {(orders.isError || members.isError) && (
                  <p role="alert" className="text-sm text-destructive">
                    Some results could not be loaded.
                  </p>
                )}
                {!orders.data?.rows.length &&
                  !members.data?.rows.length &&
                  !orders.isError &&
                  !members.isError && (
                    <p className="text-sm text-muted-foreground">No matching orders or members.</p>
                  )}
                {!!orders.data?.rows.length && (
                  <section>
                    <h3 className="mb-1 text-xs font-bold text-muted-foreground">Store orders</h3>
                    {orders.data.rows.slice(0, 5).map((row) => (
                      <Link
                        key={row.external_id}
                        to="/foxgen-orders/$id"
                        params={{ id: row.external_id }}
                        onClick={close}
                        className="flex items-center gap-3 rounded-md p-2 text-sm hover:bg-accent"
                      >
                        <Receipt className="size-4 shrink-0 text-primary" />
                        <span className="min-w-0 grow truncate">
                          {text(orderData(row.data)["order_number"] ?? row.external_id)} ·{" "}
                          {row.name}
                        </span>
                        <ArrowUpRight className="size-4 shrink-0" />
                      </Link>
                    ))}
                    <Link
                      to="/foxgen-orders"
                      search={{ q: term }}
                      onClick={close}
                      className="inline-block p-2 text-sm font-semibold text-primary hover:underline"
                    >
                      All matching orders
                    </Link>
                  </section>
                )}
                {!!members.data?.rows.length && (
                  <section>
                    <h3 className="mb-1 text-xs font-bold text-muted-foreground">Store members</h3>
                    {members.data.rows.slice(0, 5).map((row) => (
                      <Link
                        key={row.external_id}
                        to="/foxgen-customers/$id"
                        params={{ id: row.external_id }}
                        onClick={close}
                        className="flex items-center gap-3 rounded-md p-2 text-sm hover:bg-accent"
                      >
                        <Users className="size-4 shrink-0 text-primary" />
                        <span className="min-w-0 grow truncate">
                          {row.name || memberNumber(row)} · {memberNumber(row)}
                        </span>
                        <ArrowUpRight className="size-4 shrink-0" />
                      </Link>
                    ))}
                    <Link
                      to="/foxgen-customers"
                      search={{ q: term }}
                      onClick={close}
                      className="inline-block p-2 text-sm font-semibold text-primary hover:underline"
                    >
                      All matching members
                    </Link>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
