import type { FoxgenOrder } from "./foxgen-orders";
import { marketplaceData, relatedOrderRecords } from "./foxgen-marketplace";

const nonempty = (...values: unknown[]): string | undefined => {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
};

/** Never borrow evidence from a wallet deposit, refund or another order. */
export function orderPaymentData(order: FoxgenOrder, records: FoxgenOrder[]) {
  const data = marketplaceData(order.data);
  const payment = relatedOrderRecords(records, order.external_id)
    .filter(r => r.entity === "payments")
    .map(r => marketplaceData(r.data))
    .find(d => nonempty(d["payment_reference"], d["reference"], d["transaction_id"], d["utr"]));
  return {
    ...data,
    payment_reference: nonempty(data["payment_reference"], data["transaction_id"], data["utr"], data["payment_ref"], payment?.["payment_reference"], payment?.["reference"]),
    proof_submitted_at: data["proof_submitted_at"] ?? data["payment_submitted_at"] ?? payment?.["proof_submitted_at"] ?? payment?.["payment_submitted_at"],
  };
}

export function proofRepairInstructions(orderId: string) {
  return `Fix FOXGEN Store → CRM payment evidence for order ${orderId} and every other real Telegram order. Preserve the existing bot webhook, checkout and payment approval rules.
The CRM already displays order evidence and calls GET https://foxgenofficial.lovable.app/api/public/shop/v1/payment-proof/<order UUID> server-to-server using SHOP_CRM_ACTION_KEY. That endpoint currently returns 404 HTML; the existing /api/admin/payment-proof/$id requires a Store-admin session and returns 401 to the CRM.
1. Add src/routes/api/public/shop/v1/payment-proof/$id.ts. Verify the Bearer SHOP_CRM_ACTION_KEY with existing keyMatches before any privileged reads. Validate UUID. Look up ONLY that shop_orders row and its payment_evidence_url. Reuse the server-only telegram-file download logic from src/routes/api/admin/payment-proof/$id.ts or authorized private-storage downloads. No arbitrary URL fetch, bot token, Telegram file URL, public proof URL, or credentials in the response. Stream only JPEG/PNG/WebP/PDF, maximum 5 MB; return private, no-store and nosniff headers. Use JSON 404 PROOF_NOT_FOUND for no evidence, JSON 401 for unauthorized callers, and JSON 502 for upstream failure.
2. In src/lib/shop-crm.payload.ts crmOrderRecord, retain payment_reference and add has_payment_proof (boolean) and proof_submitted_at from durable source evidence. Preserve the same shop_orders.id as external_id and the exact customer_external_id. Do not send screenshot bytes, raw Telegram file IDs, or private URLs in sync JSON.
3. Check telegram-marketplace.server.ts evidence submission and shop.server.ts submitPayment: save the reference and photo against the selected order transactionally, update its source version, and queue CRM sync after commit. Keep payment under_review until manual verification. Never approve from a screenshot alone.
4. Backfill real existing order snapshots with persisted newer source versions; unchanged old timestamps will be ignored by the CRM. Flush the existing durable outbox and report failures. Do not invent transaction IDs for orders without submitted payment evidence.
5. Publish the Store. Test with a real Telegram payment screenshot: correct CRM order/customer/transaction reference, authorized image preview, unauthorized 401, absent evidence 404, duplicate retries safe, no automatic payment approval. Do not claim complete before the image reads back in the signed-in CRM. No fake data or key rotation.`;
}