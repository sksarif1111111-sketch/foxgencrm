import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Owner sign in — Digital Store CRM" },
      { name: "description", content: "Sign in to manage orders, customers and pricing." },
      { property: "og:title", content: "Owner sign in — Digital Store CRM" },
      { property: "og:description", content: "Sign in to manage orders, customers and pricing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: ownerExists } = useQuery({
    queryKey: ["owner-exists"],
    queryFn: async () => {
      const { data } = await supabase.rpc("owner_exists");
      return Boolean(data);
    },
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard", replace: true });
        else setNotice("Check your inbox and click the confirmation link, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="bg-ledger relative hidden flex-col justify-between p-12 text-primary-foreground lg:flex">
        <div className="text-xs uppercase tracking-[0.2em] text-highlight">Sales ledger</div>
        <div>
          <h1 className="text-5xl font-extrabold leading-[1.05]">
            Every sale.
            <br />
            Every margin.
            <br />
            <span className="text-highlight">One ledger.</span>
          </h1>
          <p className="mt-6 max-w-md text-primary-foreground/80">Telegram bot orders and WhatsApp deals, tracked together with live profit.</p>
        </div>
        <div className="figure text-sm text-primary-foreground/60">revenue − cost = profit</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-3xl font-bold">
              {mode === "signin" ? "Owner sign in" : mode === "signup" ? "Create owner account" : "Reset password"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signup" ? "The first account becomes the store owner." : mode === "forgot" ? "We'll email you a reset link." : "Welcome back."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {notice && <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{notice}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </Button>
          <div className="flex flex-col gap-2 text-center text-sm">
            {mode !== "signin" && (
              <button type="button" className="text-primary hover:underline" onClick={() => setMode("signin")}>
                Back to sign in
              </button>
            )}
            {mode === "signin" && (
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMode("forgot")}>
                Forgot password?
              </button>
            )}
            {mode === "signin" && ownerExists === false && (
              <button type="button" className="text-primary hover:underline" onClick={() => setMode("signup")}>
                First time? Create the owner account
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
