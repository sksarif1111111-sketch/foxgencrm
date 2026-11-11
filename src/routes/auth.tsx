import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OWNER_EMAIL, OWNER_PASSWORD_MIN_LENGTH } from "@/lib/owner-signin";
import { Eye, EyeOff } from "lucide-react";

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

type Mode = "signin" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email === OWNER_EMAIL) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    setFailed(false);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: OWNER_EMAIL, password });
        if (error) {
          setFailed(true);
          setNotice(error.status === 429
            ? "Too many sign-in attempts. Wait a few minutes, then try again."
            : error.status && error.status >= 500
              ? "Sign-in is temporarily unavailable. Try again in a moment."
              : "This password was not accepted. Use your saved owner password, or reset it below.");
          return;
        }
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(OWNER_EMAIL, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setNotice("A reset link is on its way to the owner's email.");
      }
    } catch (err) {
      toast.error("Could not reach sign-in. Try again in a moment.");
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
              {mode === "signin" ? "Owner sign in" : "Reset password"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "forgot" ? "We'll email the owner a reset link." : "Welcome back."}
            </p>
          </div>
          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={OWNER_PASSWORD_MIN_LENGTH}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                className="pr-12"
                aria-invalid={failed}
                aria-describedby={notice ? "signin-notice" : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" disabled={busy}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}>
                {showPassword ? <EyeOff /> : <Eye />}
              </Button>
              </div>
            </div>
          )}
          {notice && <p id="signin-notice" role={failed ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${failed ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}>{notice}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Send reset link"}
          </Button>
          <div className="flex flex-col gap-2 text-center text-sm">
            {mode !== "signin" && (
              <Button variant="link" type="button" onClick={() => { setMode("signin"); setNotice(null); }}>
                Back to sign in
              </Button>
            )}
            {mode === "signin" && (
              <Button variant="link" type="button" className="text-muted-foreground" onClick={() => { setMode("forgot"); setNotice(null); }}>
                Forgot password?
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
