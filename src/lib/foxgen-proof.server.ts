export async function fetchStoreProof(orderId: string, key: string) {
  const response = await fetch(`https://foxgenofficial.lovable.app/api/public/shop/v1/payment-proof/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "image/jpeg,image/png,image/webp,application/pdf" },
    redirect: "error", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return { ok: false as const, error: response.status === 401 || response.status === 403 ? "The Store did not authorize private proof access." : "Private proof sharing is not available from the Store yet. Open Store admin to review the screenshot." };
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (!mime || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime)) return { ok: false as const, error: "The Store did not return a supported payment slip." };
  const reader = response.body?.getReader();
  if (!reader) return { ok: false as const, error: "The payment slip was empty." };
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > 5 * 1024 * 1024) { await reader.cancel(); return { ok: false as const, error: "The payment slip exceeds the 5 MB preview limit. Review it in Store admin." }; }
    chunks.push(result.value);
  }
  if (!size) return { ok: false as const, error: "The payment slip was empty." };
  return { ok: true as const, mime, base64: Buffer.concat(chunks).toString("base64") };
}