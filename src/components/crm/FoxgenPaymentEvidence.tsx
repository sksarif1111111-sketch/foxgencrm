import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileImage, LoaderCircle, ExternalLink, Copy, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFoxgenPaymentProof } from "@/lib/foxgen.functions";
import { marketplaceData } from "@/lib/foxgen-marketplace";
import { text, type FoxgenOrder } from "@/lib/foxgen-orders";
import { foxgenDate } from "./FoxgenCustomersShared";
import { proofRepairInstructions } from "@/lib/foxgen-payment-evidence";

export function FoxgenPaymentEvidence({ order }: { order: FoxgenOrder }) {
  const load = useServerFn(getFoxgenPaymentProof);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [proof, setProof] = useState<{ url: string; mime: string } | null>(null);
  const d = marketplaceData(order.data);
  async function copyRepair() {
    try {
      await navigator.clipboard.writeText(proofRepairInstructions(order.external_id));
      toast.success("Store payment connection fix copied");
    } catch {
      toast.error("Could not copy. Try again from your browser.");
    }
  }
  useEffect(
    () => () => {
      if (proof) URL.revokeObjectURL(proof.url);
    },
    [proof],
  );
  useEffect(() => {
    setProof(null);
    setError(null);
  }, [order.external_id]);
  async function viewProof() {
    setBusy(true);
    setError(null);
    setZoom(100);
    try {
      const result = await load({ data: { id: order.external_id } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      setProof({
        url: URL.createObjectURL(new Blob([bytes], { type: result.mime })),
        mime: result.mime,
      });
    } catch {
      setError("Could not load the screenshot. Try again or review it in Store admin.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mb-5 rounded-lg border bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Payment evidence</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Customer payment documents · manual verification required
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={viewProof}>
          {busy ? <LoaderCircle className="animate-spin" /> : <FileImage />}
          {busy ? "Loading proof…" : "View payment screenshot"}
        </Button>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Order number / source ID</dt>
          <dd className="figure mt-1 break-all text-sm">
            {text(d["order_number"] ?? order.external_id)}
            <span className="mt-1 block text-xs text-muted-foreground">{order.external_id}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Transaction ID / UTR</dt>
          <dd className="figure mt-1 break-all text-sm">
            {d["payment_reference"]
              ? text(d["payment_reference"])
              : "No transaction reference received"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Payment method</dt>
          <dd className="mt-1 text-sm">{text(d["payment_method_name"] ?? d["payment_method"])}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Proof submitted</dt>
          <dd className="mt-1 text-sm">
            {foxgenDate(d["proof_submitted_at"] ?? d["payment_submitted_at"])}
          </dd>
        </div>
      </dl>
      {error && (
        <div role="alert" className="mt-4 space-y-3 text-sm">
          <p className="text-destructive">{error}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyRepair}>
              <Copy />
              Copy Store connection fix
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="https://foxgenofficial.lovable.app/admin" target="_blank" rel="noreferrer">
                <ExternalLink />
                Open Store admin
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Store payment-proof sharing needs to be enabled before the screenshot can appear here.
          </p>
        </div>
      )}
      <Dialog
        open={!!proof}
        onOpenChange={(open) => {
          if (!open) setProof(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="break-all">
              Payment evidence · {String(d["order_number"] ?? order.external_id)}
            </DialogTitle>
            <DialogDescription>{proof?.mime.toUpperCase()} · Owner-only viewer</DialogDescription>
          </DialogHeader>
          {proof &&
            (proof.mime === "application/pdf" ? (
              <object data={proof.url} type="application/pdf" className="h-[58vh] w-full">
                <a href={proof.url} target="_blank" rel="noreferrer">
                  Open payment slip
                </a>
              </object>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    title="Zoom out"
                    aria-label="Zoom out"
                    disabled={zoom <= 100}
                    onClick={() => setZoom((value) => value - 25)}
                  >
                    <Minus />
                  </Button>
                  <span className="figure min-w-12 text-center text-sm">{zoom}%</span>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Zoom in"
                    aria-label="Zoom in"
                    disabled={zoom >= 250}
                    onClick={() => setZoom((value) => value + 25)}
                  >
                    <Plus />
                  </Button>
                </div>
                <div className="max-h-[55vh] overflow-auto rounded-md border bg-muted">
                  <img
                    src={proof.url}
                    alt="Customer-submitted payment screenshot"
                    className="max-w-none"
                    style={{ width: `${zoom}%` }}
                  />
                </div>
              </>
            ))}
          <p className="text-xs text-muted-foreground">
            Confirm the actual received payment before approving this order.
          </p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
