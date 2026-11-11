import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileImage, LoaderCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFoxgenPaymentProof } from "@/lib/foxgen.functions";
import { marketplaceData } from "@/lib/foxgen-marketplace";
import { text, type FoxgenOrder } from "@/lib/foxgen-orders";

export function FoxgenPaymentEvidence({ order }: { order: FoxgenOrder }) {
  const load = useServerFn(getFoxgenPaymentProof);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<{ url: string; mime: string } | null>(null);
  const d = marketplaceData(order.data);
  useEffect(() => () => { if (proof) URL.revokeObjectURL(proof.url); }, [proof]);
  useEffect(() => { setProof(null); setError(null); }, [order.external_id]);
  async function viewProof() {
    setBusy(true); setError(null);
    try {
      const result = await load({ data: { id: order.external_id } });
      if (!result.ok) { setError(result.error); return; }
      const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      setProof({ url: URL.createObjectURL(new Blob([bytes], { type: result.mime })), mime: result.mime });
    } catch { setError("Could not load the screenshot. Try again or review it in Store admin."); }
    finally { setBusy(false); }
  }
  return (
    <section className="mb-6 border-y py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Payment evidence</h2>
          <p className="mt-1 text-xs text-muted-foreground">Customer payment documents · manual verification required</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={viewProof}>
          {busy ? <LoaderCircle className="animate-spin" /> : <FileImage />}
          {busy ? "Loading proof…" : "View screenshot / slip"}
        </Button>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Transaction ID / UTR</dt><dd className="figure mt-1 break-all text-sm">{text(d["payment_reference"])}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Payment method</dt><dd className="mt-1 text-sm">{text(d["payment_method_name"] ?? d["payment_method"])}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Proof submitted</dt><dd className="mt-1 text-sm">{text(d["proof_submitted_at"] ?? d["payment_submitted_at"])}</dd></div>
      </dl>
      {error && <div role="alert" className="mt-4 space-y-2 text-sm"><p className="text-destructive">{error}</p><Button asChild variant="outline" size="sm"><a href="https://foxgenofficial.lovable.app/admin" target="_blank" rel="noreferrer"><ExternalLink />Open Store admin</a></Button></div>}
      <Dialog open={!!proof} onOpenChange={open => { if (!open) setProof(null); }}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Payment proof · {String(d["order_number"] ?? order.external_id)}</DialogTitle></DialogHeader>
          {proof && (proof.mime === "application/pdf" ? <object data={proof.url} type="application/pdf" className="h-[65vh] w-full"><a href={proof.url} target="_blank" rel="noreferrer">Open payment slip</a></object> : <img src={proof.url} alt="Customer-submitted payment screenshot" className="max-h-[65vh] w-full object-contain" />)}
          <p className="text-xs text-muted-foreground">Confirm the actual received payment before approving this order.</p>
        </DialogContent>
      </Dialog>
    </section>
  );
}