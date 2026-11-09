import { useEffect, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";
import { CreateManualOrderSchema } from "@/lib/validators";
import { productsQuery, useSettings } from "@/lib/crm-queries";
import { formatMoney, orderTotals } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/orders/new")({
  head: () => ({ meta: [
    { title: "Add manual order \u2014 Digital Store CRM" },
    { name: "description", content: "Record a direct sale with customer details and accurate costs." },
    { property: "og:title", content: "Add manual order \u2014 Digital Store CRM" },
    { property: "og:description", content: "Record a direct sale with customer details and accurate costs." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: NewOrder,
});

const CUSTOM = "__custom__";
const FormSchema = CreateManualOrderSchema.extend({ custom_name: z.string().trim().max(255).default("") });
type FormValues = z.output<typeof FormSchema>;

function NewOrder() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: s } = useSettings();
  const sym = s?.currency_symbol ?? "$";
  const { data: products = [] } = useQuery(productsQuery);
  const active = products.filter((p) => p.is_active);

  const form = useForm<z.input<typeof FormSchema>, unknown, FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      product_id: "",
      quantity: 1,
      selling_price: 0,
      wholesale_cost: 0,
      customer_name: "",
      phone: "",
      whatsapp: "",
      payment_method: "upi",
      payment_proof: "",
      notes: "",
      custom_name: "",
    },
  });
  const { register, watch, setValue, handleSubmit, formState } = form;
  const productId = watch("product_id");
  const qty = Number(watch("quantity")) || 0;
  const price = Number(watch("selling_price")) || 0;
  const cost = Number(watch("wholesale_cost")) || 0;
  const totals = useMemo(() => orderTotals(price, cost, qty), [price, cost, qty]);
  const selected = active.find((p) => p.id === productId);

  useEffect(() => {
    if (selected) {
      setValue("selling_price", Number(selected.selling_price));
      setValue("wholesale_cost", Number(selected.wholesale_price));
    }
  }, [selected, setValue]);

  async function onSubmit(values: FormValues) {
    const isCustom = values.product_id === CUSTOM;
    const name = isCustom ? values.custom_name.trim() : (selected?.name ?? "");
    if (!name) {
      toast.error("Enter the product name");
      return;
    }
    const pid = isCustom ? `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}` : values.product_id;
    const { data, error } = await supabase.rpc("create_manual_order", {
      _product_id: pid,
      _product_name: name,
      _quantity: values.quantity,
      _wholesale_cost: values.wholesale_cost,
      _selling_price: values.selling_price,
      _customer_id: null as unknown as string,
      _customer_name: values.customer_name,
      _phone: values.phone ?? "",
      _whatsapp: values.whatsapp ?? "",
      _payment_method: values.payment_method,
      _payment_proof: values.payment_proof ?? "",
      _notes: values.notes ?? "",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Order saved — profit ${formatMoney(totals.profit, sym)}`);
    await qc.invalidateQueries();
    navigate({ to: "/orders/$id", params: { id: data as string } });
  }

  const err = formState.errors;
  return (
    <>
      <PageHeader title="Add manual order" description="Record a WhatsApp or direct sale. Profit is calculated automatically." />
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
            <h2 className="text-lg font-bold">Product</h2>
            <div className="space-y-2">
              <Label htmlFor="product">Product</Label>
              <select id="product" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...register("product_id")}>
                <option value="">Choose a product…</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.selling_price, sym)}
                    {p.stock_count !== null ? ` (${p.stock_count} in stock)` : ""}
                  </option>
                ))}
                <option value={CUSTOM}>Other product (type name)…</option>
              </select>
              {err.product_id && <p className="text-sm text-destructive">{err.product_id.message}</p>}
              {!active.length && <p className="text-xs text-muted-foreground">No synced products yet — choose "Other product" or sync on the Products page.</p>}
            </div>
            {productId === CUSTOM && (
              <div className="space-y-2">
                <Label htmlFor="custom_name">Product name</Label>
                <Input id="custom_name" placeholder="e.g. Spotify Premium" {...register("custom_name")} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" type="number" min={1} max={100} inputMode="numeric" {...register("quantity")} />
                {err.quantity && <p className="text-sm text-destructive">{err.quantity.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="selling_price">Selling price / unit</Label>
                <Input id="selling_price" type="number" step="0.01" min={0} inputMode="decimal" {...register("selling_price")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wholesale_cost">Cost price / unit</Label>
                <Input id="wholesale_cost" type="number" step="0.01" min={0} inputMode="decimal" {...register("wholesale_cost")} />
                {selected && <p className="text-xs text-muted-foreground">From supplier: {formatMoney(selected.wholesale_price, sym)}</p>}
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
            <h2 className="text-lg font-bold">Customer</h2>
            <div className="space-y-2">
              <Label htmlFor="customer_name">Customer name</Label>
              <Input id="customer_name" placeholder="John Doe" {...register("customer_name")} />
              {err.customer_name && <p className="text-sm text-destructive">{err.customer_name.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input id="whatsapp" type="tel" placeholder="+91 98765 43210" {...register("whatsapp")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" {...register("phone")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Existing customers are matched by WhatsApp or phone number.</p>
          </section>

          <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
            <h2 className="text-lg font-bold">Payment</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="payment_method">Payment method</Label>
                <select id="payment_method" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...register("payment_method")}>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="crypto">Crypto</option>
                  <option value="binance">Binance</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_proof">Transaction ID (optional)</Label>
                <Input id="payment_proof" {...register("payment_proof")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} {...register("notes")} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-10 lg:self-start">
          <div className="paper-rule rounded-xl border bg-card p-5 shadow-card">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Summary</h2>
            <dl className="figure mt-4 space-y-3">
              <div className="flex justify-between">
                <dt>Revenue</dt>
                <dd>{formatMoney(totals.revenue, sym)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Cost</dt>
                <dd>− {formatMoney(totals.cost, sym)}</dd>
              </div>
              <div className="flex justify-between border-t pt-3 text-xl font-semibold">
                <dt>Profit</dt>
                <dd className={totals.profit >= 0 ? "text-success" : "text-destructive"}>{formatMoney(totals.profit, sym)}</dd>
              </div>
            </dl>
            <Button type="submit" variant="highlight" className="mt-6 w-full" size="lg" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? "Saving…" : "Save order"}
            </Button>
          </div>
        </aside>
      </form>
    </>
  );
}
