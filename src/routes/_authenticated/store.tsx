import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, RefreshCw, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rotateStoreKey, setStoreEnabled } from "@/lib/store-sync.functions";
import { STORE_ENTITIES, STORE_URL } from "@/lib/store-sync";
import type { Database } from "@/integrations/supabase/types";
import { FoxgenConnectionCard } from "@/components/crm/FoxgenMetrics";
import { FoxgenConnectionSetup } from "@/components/crm/FoxgenConnectionSetup";

export const Route = createFileRoute("/_authenticated/store")({
  head: () => ({
    meta: [
      { title: "FoxGen Store connection — Digital Store CRM" },
      {
        name: "description",
        content: "Review imported FoxGen orders, payments, customers and inventory.",
      },
      { property: "og:title", content: "FoxGen Store connection — Digital Store CRM" },
      {
        property: "og:description",
        content: "Review imported FoxGen orders, payments, customers and inventory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StorePage,
});

type StoreRecord = Database["public"]["Tables"]["store_records"]["Row"];
const endpoints = {
  live: "https://foxgencrm.lovable.app/api/public/store/sync",
  preview:
    "https://project--89ef405a-3b92-4a46-a34f-3186c0336acf-dev.lovable.app/api/public/store/sync",
};
const labels = {
  orders: "Orders",
  payments: "Payments",
  customers: "Customers",
  products: "Products",
  refunds: "Refunds",
  expenses: "Expenses",
  inventory: "Inventory",
};

function StorePage() {
  const qc = useQueryClient();
  const rotate = useServerFn(rotateStoreKey);
  const enable = useServerFn(setStoreEnabled);
  const [key, setKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [entity, setEntity] = useState<(typeof STORE_ENTITIES)[number]>("orders");
  const [page, setPage] = useState(0);
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<StoreRecord | null>(null);
  const [target, setTarget] = useState<"live" | "preview">("live");
  const integration = useQuery({
    queryKey: ["store-integration"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_integrations")
        .select("id,store_url,enabled,last_received_at")
        .eq("id", "foxgen")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: 15000,
  });
  const records = useQuery({
    queryKey: ["store-records", entity, page, term],
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
    queryFn: async () => {
      let query = supabase
        .from("store_records")
        .select("*", { count: "exact" })
        .eq("integration_id", "foxgen")
        .eq("entity", entity);
      const clean = term.replace(/[%,()*\\]/g, " ").trim();
      if (clean) query = query.or(`name.ilike.%${clean}%,external_id.ilike.%${clean}%`);
      const { data, error, count } = await query
        .order("received_at", { ascending: false })
        .range(page * 50, page * 50 + 49);
      if (error) throw new Error(error.message);
      return { rows: data ?? [], count: count ?? 0 };
    },
  });
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Copy unavailable; select the text manually");
    }
  }
  async function generate() {
    setBusy(true);
    try {
      const result = await rotate();
      setKey(result.key);
      setConfirm(false);
      await qc.invalidateQueries({ queryKey: ["store-integration"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }
  const d = integration.data;
  return (
    <>
      <PageHeader
        title="FoxGen Store"
        description={STORE_URL}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              integration.refetch();
              records.refetch();
            }}
          >
            <RefreshCw /> Refresh
          </Button>
        }
      />
      <FoxgenConnectionSetup />
      <section className="mb-8 space-y-4 border-b pb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Store className="size-5 text-primary" />
            <h2 className="text-lg font-bold">Store API</h2>
            <Badge variant={d?.enabled && d.last_received_at ? "success" : "warning"}>
              {!d
                ? "Not configured"
                : !d.enabled
                  ? "Disabled"
                  : d.last_received_at
                    ? "Receiving records"
                    : "Waiting for store"}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              aria-label="Enable store sync"
              disabled={!d || busy}
              checked={d?.enabled ?? false}
              onCheckedChange={async (enabled) => {
                setBusy(true);
                try {
                  await enable({ data: { enabled } });
                  await qc.invalidateQueries({ queryKey: ["store-integration"] });
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Could not update connection",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button
              variant="outline"
              disabled={busy || integration.isLoading}
              onClick={() => (d ? setConfirm(true) : generate())}
            >
              <KeyRound />
              {d ? "Replace API key" : "Create API key"}
            </Button>
          </div>
        </div>
        {integration.error && <p className="text-destructive">{integration.error.message}</p>}
        <p className="text-sm text-muted-foreground">
          Last received: {d?.last_received_at ? new Date(d.last_received_at).toLocaleString() : "—"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={target} onValueChange={(v) => setTarget(v as "live" | "preview")}>
            <TabsList>
              <TabsTrigger value="live">Published</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            aria-label="Store API endpoint"
            readOnly
            value={endpoints[target]}
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <Button
            size="icon"
            variant="outline"
            title="Copy endpoint"
            aria-label="Copy endpoint"
            onClick={() => copy(endpoints[target])}
          >
            <Copy />
          </Button>
        </div>
        {key && (
          <div className="space-y-2 border border-warning p-4">
            <p className="font-medium">New API key — shown once</p>
            <p className="text-sm text-muted-foreground">
              Keep this key private. Existing keys no longer work.
            </p>
            <div className="flex gap-2">
              <Input aria-label="New store API key" type="password" value={key} readOnly />
              <Button
                size="icon"
                variant="outline"
                title="Copy API key"
                aria-label="Copy API key"
                onClick={() => copy(key)}
              >
                <Copy />
              </Button>
            </div>
            <Button variant="ghost" onClick={() => setKey(null)}>
              I have saved the key
            </Button>
          </div>
        )}
      </section>
      <div className="mb-6">
        <FoxgenConnectionCard />
      </div>
      <Tabs
        value={entity}
        onValueChange={(v) => {
          setEntity(v as typeof entity);
          setPage(0);
          setTerm("");
        }}
      >
        <div className="overflow-x-auto">
          <TabsList>
            {STORE_ENTITIES.map((e) => (
              <TabsTrigger key={e} value={e}>
                {labels[e]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <div className="my-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{records.data?.count ?? 0} records</p>
        <Input
          aria-label="Search store records"
          placeholder="Search name or ID"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
      </div>
      {records.error ? (
        <p className="text-destructive">{records.error.message}</p>
      ) : records.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID / Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.data?.rows.map((r) => (
                <TableRow key={r.external_id}>
                  <TableCell className="max-w-64 break-words">
                    <p className="font-medium">{r.name || r.external_id}</p>
                    <p className="font-mono text-xs text-muted-foreground">{r.external_id}</p>
                  </TableCell>
                  <TableCell>{r.status || "—"}</TableCell>
                  <TableCell className="figure whitespace-nowrap">
                    {r.amount === null ? "—" : `${r.currency ?? ""} ${Number(r.amount).toFixed(2)}`}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(r.source_updated_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!records.data?.rows.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    No store records received.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="mt-4 flex items-center justify-end gap-3">
        <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span className="figure">{page + 1}</span>
        <Button
          variant="outline"
          disabled={(page + 1) * 50 >= (records.data?.count ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace the store API key?</DialogTitle>
          </DialogHeader>
          <p>
            The current key will stop working. Update the key in FoxGen Store after replacing it.
          </p>
          <Button disabled={busy} onClick={generate}>
            Replace key
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.name || selected?.external_id}</DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs">
            {JSON.stringify(selected?.data, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
