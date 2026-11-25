import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileImage, LoaderCircle, Copy, Minus, Plus } from "lucide-react";
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

export function FoxgenPaymentEvidence({
  order,
  kind = "order",
  compact = false,
}: {
  order: FoxgenOrder;
  kind?: "order" | "topup";
  compact?: boolean;
}) {
  const load = useServerFn(getFoxgenPaymentProof);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [open, setOpen] = useState(false);
  const [proof, setProof] = useState<{ url: string; mime: string } | null>(null);
  const mounted = useRef(false);
  const attempted = useRef(false);
  const d = marketplaceData(order.data);
  const reference = d["payment_reference"] ?? d["transaction_id"] ?? d["reference"];
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (proof) URL.revokeObjectURL(proof.url);
    },
    [proof],
  );
  const viewProof = useCallback(async () => {
    setBusy(true);
    setError(null);
    setZoom(100);
    try {
      const result = await load({ data: { id: order.external_id, kind } });
      if (!mounted.current) return;
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
      if (mounted.current)
        setError("Could not load the screenshot. Try again or review it in Store admin.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [load, order.external_id, kind]);
  useEffect(() => {
    if (
      !compact &&
      (d["has_payment_proof"] === true ||
        ["under_review", "payment_submitted"].includes(order.status)) &&
      !attempted.current
    ) {
      attempted.current = true;
      void viewProof();
    }
  }, [compact, d, order.status, viewProof]);
  async function copyReference() {
    if (typeof reference !== "string" || !reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      toast.success("Transaction ID copied");
    } catch {
      toast.error("Could not copy transaction ID");
    }
  }
  const viewer = (
    <>
      {proof?.mime !== "application/pdf" && (
        <div className="mb-3 flex items-center gap-2">
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
            disabled={zoom >= 300}
            onClick={() => setZoom((value) => value + 25)}
          >
            <Plus />
          </Button>
        </div>
      )}
      {proof &&
        (proof.mime === "application/pdf" ? (
          <object data={proof.url} type="application/pdf" className="h-[60vh] w-full">
            <a href={proof.url} target="_blank" rel="noreferrer">
              Open payment slip
            </a>
          </object>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted">
            <img
              src={proof.url}
              alt="Customer-submitted payment screenshot"
              className="max-w-none"
              style={{ width: `${zoom}%` }}
            />
          </div>
        ))}
    </>
  );
  const action = (
    <Button
      variant="outline"
      size={compact ? "sm" : "default"}
      disabled={busy}
      onClick={() => {
        setOpen(true);
        if (!proof) void viewProof();
      }}
    >
      {busy ? <LoaderCircle className="animate-spin" /> : <FileImage />}
      {busy ? "Loading proof…" : compact ? "View screenshot" : "View payment screenshot"}
    </Button>
  );
  const dialog = (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (compact && !value) setProof(null);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-all">
            {kind === "topup" ? "Wallet top-up evidence" : "Payment evidence"} ·{" "}
            {String(d["order_number"] ?? order.external_id)}
          </DialogTitle>
          <DialogDescription>
            {proof?.mime ?? "Private payment document"} · Owner-only viewer
          </DialogDescription>
        </DialogHeader>
        {busy && <p role="status">Loading payment screenshot…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {proof && viewer}
      </DialogContent>
    </Dialog>
  );
  if (compact)
    return (
      <>
        {action}
        {dialog}
      </>
    );
  return (
    <section className="mb-5 min-w-0 rounded-lg border bg-card p-4 shadow-card sm:p-5">
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <h2 className="min-w-0 text-lg font-semibold">Payment evidence</h2>
        {action}
      </div>
      <dl className="my-4 grid min-w-0 gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Transaction ID / UTR</dt>
          <dd className="mt-1 flex min-w-0 items-start gap-2">
            <span className="figure min-w-0 break-all text-sm">
              {reference ? text(reference) : "No transaction reference received"}
            </span>
            {typeof reference === "string" && reference && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Copy transaction ID"
                title="Copy transaction ID"
                onClick={copyReference}
              >
                <Copy />
              </Button>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Payment method</dt>
          <dd className="mt-1 break-words text-sm">
            {text(d["payment_method_name"] ?? d["payment_method"])}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Proof submitted</dt>
          <dd className="mt-1 text-sm">
            {foxgenDate(d["proof_submitted_at"] ?? d["payment_submitted_at"])}
          </dd>
        </div>
      </dl>
      {busy && (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          Loading payment screenshot…
        </p>
      )}
      {proof && !open && viewer}
      {error && !open && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!proof && !busy && !error && (
        <p className="text-sm text-muted-foreground">No payment screenshot loaded.</p>
      )}
      {dialog}
    </section>
  );
}
