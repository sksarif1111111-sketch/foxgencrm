import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rotateStoreKey } from "@/lib/store-sync.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function StoreSyncKeySettings() {
  const qc = useQueryClient();
  const rotate = useServerFn(rotateStoreKey);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const integration = useQuery({
    queryKey: ["store-integration"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_integrations")
        .select("id,store_url,enabled,last_received_at").eq("id", "foxgen").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const result = await rotate();
      setKey(result.key);
      setConfirm(false);
      toast.success("New Store sync key created");
      await qc.invalidateQueries({ queryKey: ["store-integration"] });
    } catch {
      setError("Could not create the Store sync key. Try again in a moment.");
    } finally { setBusy(false); }
  }
  async function copy(value: string, message: string) {
    try { await navigator.clipboard.writeText(value); toast.success(message); }
    catch { setError("Could not copy. Select the field and copy it manually."); }
  }
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-lg font-bold"><KeyRound className="size-4 text-primary" />FoxGen Store sync key</h2>
      {integration.isPending ? <div className="h-9 animate-pulse rounded-md bg-muted" /> : (
        <Button className="w-full" disabled={busy || integration.isError || !!key}
          onClick={() => integration.data ? setConfirm(true) : create()}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {busy ? "Creating key…" : integration.data ? "Replace inbound sync key" : "Create inbound sync key"}
        </Button>
      )}
      {(error || integration.isError) && <p role="alert" className="text-sm text-destructive">{error ?? "Could not check the sync key. Refresh and try again."}</p>}
      <div className="space-y-2">
        <Label htmlFor="settings-sync-endpoint">CRM sync URL</Label>
        <div className="flex gap-2">
          <Input id="settings-sync-endpoint" readOnly className="min-w-0 font-mono" value="https://foxgencrm.lovable.app/api/public/store/sync" />
          <Button size="icon" variant="outline" aria-label="Copy CRM sync URL" title="Copy CRM sync URL" onClick={() => copy("https://foxgencrm.lovable.app/api/public/store/sync", "CRM sync URL copied")}><Copy /></Button>
        </div>
      </div>
      {key && <div className="space-y-3 border-t pt-4">
        <Label htmlFor="settings-sync-key">New inbound sync key — shown once</Label>
        <div className="flex gap-2">
          <Input id="settings-sync-key" type="password" readOnly value={key} className="min-w-0" />
          <Button size="icon" variant="outline" aria-label="Copy inbound sync key" title="Copy inbound sync key" onClick={() => copy(key, "Inbound sync key copied")}><Copy /></Button>
        </div>
        <Button variant="outline" className="w-full" onClick={() => setKey(null)}>I have saved the key</Button>
      </div>}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent><DialogHeader><DialogTitle>Replace inbound sync key?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">The current key will stop working. Save the new key in FoxGen Store to keep orders syncing.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy} onClick={create}>{busy && <Loader2 className="animate-spin" />}{busy ? "Creating key…" : "Replace key"}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}