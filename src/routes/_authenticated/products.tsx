import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Calculator, Package, Pencil, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { productsQuery, useSettings } from "@/lib/crm-queries";
import {
  computeSellingPrice,
  effectiveMarkup,
  formatMoney,
  markupFromPrice,
  round2,
} from "@/lib/pricing";
import { settingNumber } from "@/lib/settings-keys";
import { syncCatalog } from "@/lib/crm.functions";

type Product = Database["public"]["Tables"]["products"]["Row"];

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Products & pricing \u2014 FOXGEN CRM" },
      {
        name: "description",
        content: "Manage digital product pricing, markup and supplier inventory.",
      },
      { property: "og:title", content: "Products & pricing \u2014 FOXGEN CRM" },
      {
        property: "og:description",
        content: "Manage digital product pricing, markup and supplier inventory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const qc = useQueryClient();
  const { data: s } = useSettings();
  const sym = s?.currency_symbol ?? "$";
  const defMarkup = s ? settingNumber(s, "default_markup_percentage") : 20;
  const { data: products = [], isLoading, isError } = useQuery(productsQuery);
  const sync = useServerFn(syncCatalog);
  const [filter, setFilter] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [bulkMarkup, setBulkMarkup] = useState<string>("");
  const [calc, setCalc] = useState({ cost: "5", markup: "40", qty: "1" });

  async function runSync() {
    setSyncing(true);
    try {
      const r = await sync();
      if (r.ok) {
        toast.success(`Synced ${r.count} products from supplier`);
        if (r.shopPush.failed)
          toast.warning(
            `CRM catalogue saved. ${r.shopPush.failed} products could not be sent to FoxGen Store. Try syncing again later.`,
          );
        else if (r.shopPush.pushed)
          toast.success(`Sent ${r.shopPush.pushed} products to FoxGen Store for review`);
      } else toast.error(`Sync failed: ${r.error}`);
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch {
      toast.error("Could not sync products. Try again.");
    } finally {
      setSyncing(false);
    }
  }

  async function applyDefault() {
    const m = Number(bulkMarkup);
    if (!Number.isFinite(m) || m < 0) {
      toast.error("Enter a valid markup %");
      return;
    }
    const { error: sErr } = await supabase.from("settings").upsert({
      key: "default_markup_percentage",
      value: String(m),
      updated_at: new Date().toISOString(),
    });
    if (sErr) {
      toast.error(sErr.message);
      return;
    }
    const rows = products
      .filter((p) => p.markup_percentage === null)
      .map((p) => ({ ...p, selling_price: computeSellingPrice(Number(p.wholesale_price), m) }));
    if (rows.length) {
      const { error } = await supabase.from("products").upsert(rows);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    toast.success(`Default markup set to ${m}% (${rows.length} products repriced)`);
    setBulkMarkup("");
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  const lastSync = products.reduce<string | null>(
    (acc, p) => (!acc || p.last_synced > acc ? p.last_synced : acc),
    null,
  );
  const visible = products.filter((product) =>
    `${product.name} ${product.id}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const calcPrice = computeSellingPrice(Number(calc.cost) || 0, Number(calc.markup) || 0);
  const calcProfit = round2((calcPrice - (Number(calc.cost) || 0)) * (Number(calc.qty) || 0));

  return (
    <>
      <PageHeader
        title="Products & pricing"
        description={
          lastSync
            ? `Last synced ${formatDistanceToNow(new Date(lastSync))} ago · default markup ${defMarkup}%`
            : `Default markup ${defMarkup}%`
        }
        actions={
          <Button onClick={runSync} disabled={syncing}>
            <RefreshCw className={syncing ? "animate-spin" : ""} />{" "}
            {syncing ? "Syncing…" : "Sync from supplier"}
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-5 shadow-card">
          <h2 className="font-bold">Default markup for all products</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Applies to every product without its own override.
          </p>
          <div className="mt-4 flex gap-2">
            <Input
              type="number"
              min={0}
              placeholder={`${defMarkup}`}
              value={bulkMarkup}
              onChange={(e) => setBulkMarkup(e.target.value)}
              className="max-w-[140px]"
            />
            <span className="self-center text-sm text-muted-foreground">%</span>
            <Button variant="secondary" onClick={applyDefault}>
              Apply
            </Button>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-bold">
            <Calculator className="size-4 text-primary" /> Margin calculator
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Cost</Label>
              <Input
                type="number"
                value={calc.cost}
                onChange={(e) => setCalc({ ...calc, cost: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Markup %</Label>
              <Input
                type="number"
                value={calc.markup}
                onChange={(e) => setCalc({ ...calc, markup: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Qty</Label>
              <Input
                type="number"
                value={calc.qty}
                onChange={(e) => setCalc({ ...calc, qty: e.target.value })}
              />
            </div>
          </div>
          <p className="figure mt-3 text-sm">
            Sell at <b>{formatMoney(calcPrice, sym)}</b> → profit{" "}
            <b className="text-success">{formatMoney(calcProfit, sym)}</b>
          </p>
        </div>
      </div>

      <div className="mb-3 grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <h2 className="text-lg font-extrabold">Supplier catalogue</h2>
          <p className="text-xs text-muted-foreground">
            {visible.length} listed · {products.filter((product) => product.is_active).length}{" "}
            active
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Search products"
            placeholder="Product name or ID"
            className="pl-9"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load the supplier catalogue.
        </p>
      ) : !visible.length ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {filter ? "No matching products." : "No products synced yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Wholesale</TableHead>
                <TableHead className="text-right">Your price</TableHead>
                <TableHead className="text-right">Markup</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Profit / unit</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => {
                const markup = effectiveMarkup(
                  p.markup_percentage === null ? null : Number(p.markup_percentage),
                  defMarkup,
                );
                return (
                  <TableRow key={p.id} className={p.is_active ? "" : "opacity-50"}>
                    <TableCell>
                      <div className="flex min-w-40 items-start gap-2">
                        <Package className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="font-bold">{p.name}</p>
                          <p
                            className="max-w-56 truncate text-xs text-muted-foreground"
                            title={p.description ?? p.id}
                          >
                            {p.description || p.id}
                          </p>
                        </div>
                      </div>
                      {!p.is_active && <Badge variant="muted">No longer listed</Badge>}
                    </TableCell>
                    <TableCell className="figure text-right text-muted-foreground">
                      {formatMoney(p.wholesale_price, sym)}
                    </TableCell>
                    <TableCell className="figure text-right font-semibold">
                      {formatMoney(p.selling_price, sym)}
                    </TableCell>
                    <TableCell className="figure text-right">
                      {markup}%
                      {p.markup_percentage === null ? (
                        <span className="ml-1 text-xs text-muted-foreground">default</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="figure text-right">
                      {p.stock_count === null ? (
                        "—"
                      ) : p.stock_count <= 0 ? (
                        <Badge variant="danger">Out</Badge>
                      ) : (
                        p.stock_count
                      )}
                    </TableCell>
                    <TableCell className="figure text-right">{p.total_sold}</TableCell>
                    <TableCell className="figure text-right text-success">
                      {formatMoney(Number(p.selling_price) - Number(p.wholesale_price), sym)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit price of ${p.name}`}
                        onClick={() => setEditing(p)}
                      >
                        <Pencil />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <EditPrice
          product={editing}
          defMarkup={defMarkup}
          sym={sym}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EditPrice({
  product,
  defMarkup,
  sym,
  onClose,
}: {
  product: Product;
  defMarkup: number;
  sym: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const wholesale = Number(product.wholesale_price);
  const [markup, setMarkup] = useState(String(product.markup_percentage ?? defMarkup));
  const [price, setPrice] = useState(String(product.selling_price));
  const [saving, setSaving] = useState(false);

  async function save(useDefault: boolean) {
    setSaving(true);
    const m = useDefault ? null : Number(markup);
    const selling = computeSellingPrice(wholesale, m ?? defMarkup);
    const { error } = await supabase
      .from("products")
      .update({ markup_percentage: m, selling_price: selling })
      .eq("id", product.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${product.name} now sells at ${formatMoney(selling, sym)}`);
    qc.invalidateQueries({ queryKey: ["products"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>
        <p className="figure text-sm text-muted-foreground">
          Wholesale {formatMoney(wholesale, sym)}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Markup %</Label>
            <Input
              type="number"
              value={markup}
              onChange={(e) => {
                setMarkup(e.target.value);
                setPrice(String(computeSellingPrice(wholesale, Number(e.target.value) || 0)));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Selling price</Label>
            <Input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setMarkup(String(markupFromPrice(wholesale, Number(e.target.value) || 0)));
              }}
            />
          </div>
        </div>
        <p className="figure text-sm">
          Profit per unit:{" "}
          <b className="text-success">
            {formatMoney(computeSellingPrice(wholesale, Number(markup) || 0) - wholesale, sym)}
          </b>
        </p>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => save(true)} disabled={saving}>
            Use default ({defMarkup}%)
          </Button>
          <Button onClick={() => save(false)} disabled={saving}>
            Save override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
