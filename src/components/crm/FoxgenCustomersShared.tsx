import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { timestamp } from "@/lib/foxgen-orders";

export function FoxgenCustomersSkeleton() {
  return <div aria-label="Loading FoxGen customers" className="space-y-4">
    <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
    {Array.from({ length: 6 }, (_, i) => <div key={i} className="grid grid-cols-3 gap-4 border-b py-4">
      <div className="h-5 animate-pulse rounded-md bg-muted" /><div className="h-5 animate-pulse rounded-md bg-muted" /><div className="h-5 animate-pulse rounded-md bg-muted" />
    </div>)}
  </div>;
}
export function FoxgenCustomersError() {
  const router = useRouter();
  return <div role="alert" className="space-y-4">
    <p className="text-destructive">Could not load FoxGen customers or purchase history. Try again in a moment.</p>
    <Button variant="outline" onClick={() => router.invalidate()}>Try again</Button>
  </div>;
}
export function foxgenDate(value: unknown) {
  const at = timestamp(value);
  return at === null ? "—" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(at);
}