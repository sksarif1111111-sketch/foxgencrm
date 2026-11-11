import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCw, Users } from "lucide-react";
import { PageHeader } from "@/components/crm/PageHeader";
import { FoxgenCustomersError, FoxgenCustomersSkeleton, foxgenDate } from "@/components/crm/FoxgenCustomersShared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FoxgenCustomerSearch } from "@/lib/foxgen-customers";
import { orderData, text } from "@/lib/foxgen-orders";
import { foxgenCustomerListOptions } from "@/lib/foxgen-queries";

export const Route = createFileRoute("/_authenticated/foxgen-customers/")({
  validateSearch: FoxgenCustomerSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(foxgenCustomerListOptions(deps)),
  pendingMs: 150,
  pendingComponent: FoxgenCustomersSkeleton,
  errorComponent: FoxgenCustomersError,
  notFoundComponent: () => <p>FoxGen customers not found.</p>,
  head: () => ({ meta: [
    { title: "FoxGen Customers — Digital Store CRM" },
    { name: "description", content: "Review FoxGen buyer contacts and repeat purchase counts." },
    { property: "og:title", content: "FoxGen Customers — Digital Store CRM" },
    { property: "og:description", content: "Review FoxGen buyer contacts and repeat purchase counts." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: FoxgenCustomers,
});

function FoxgenCustomers() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/foxgen-customers/" });
  const query = useSuspenseQuery(foxgenCustomerListOptions(search));
  const page = search.page ?? 0;
  return <div className="foxgen-section">
    <PageHeader title="FoxGen Customers" description={`${query.data.count} customers`} actions={
      <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>
        <RefreshCw className={query.isFetching ? "animate-spin" : ""} />{query.isFetching ? "Refreshing…" : "Refresh"}
      </Button>
    } />
    <div className="mb-4 border-b pb-4">
      <Label htmlFor="fg-customer-search" className="mb-2 block">Search</Label>
      <Input id="fg-customer-search" className="max-w-md" placeholder="Name, email or Telegram" value={search.q ?? ""}
        onChange={(event) => navigate({ search: (previous) => ({ ...previous, q: event.target.value || undefined, page: undefined }) })} />
    </div>
    {query.isRefetchError && <p role="alert" className="mb-4 text-sm text-destructive">Could not refresh FoxGen customers. Showing the last received information.</p>}
    {!query.data.rows.length ? <section className="border-b py-12 text-center">
      <Users className="mx-auto mb-4 size-8 text-muted-foreground" />
      <h2 className="text-lg font-semibold">{search.q ? "No matching customers" : "No FoxGen customers yet"}</h2>
    </section> : <div className="overflow-x-auto"><Table>
      <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Orders</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
      <TableBody>{query.data.rows.map((customer) => {
        const data = orderData(customer.data);
        return <TableRow key={customer.external_id}>
          <TableCell className="min-w-40 max-w-80"><Link to="/foxgen-customers/$id" params={{ id: customer.external_id }} className="font-medium text-primary hover:underline">{customer.name || text(data["name"] ?? data["customer_name"] ?? customer.external_id)}</Link>
            <p className="figure mt-1 break-all text-xs text-muted-foreground">{customer.external_id}</p>
          </TableCell>
          <TableCell className="min-w-48 max-w-80 whitespace-pre-wrap break-words text-sm">
            <p>{text(data["email"] ?? data["customer_email"] ?? data["delivery_emails"])}</p>
            <p className="text-muted-foreground">{text(data["telegram_username"] ?? data["telegram_user_id"])}</p>
          </TableCell>
          <TableCell className="figure text-right">{customer.orderCount}</TableCell>
          <TableCell className="whitespace-nowrap text-sm">{foxgenDate(customer.source_updated_at)}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table></div>}
    {query.data.count > 50 && <div className="mt-4 flex items-center justify-end gap-3">
      <Button variant="outline" disabled={page === 0} onClick={() => navigate({ search: (previous) => ({ ...previous, page: page - 1 }) })}>Previous</Button>
      <span className="figure text-sm">{page + 1} / {Math.ceil(query.data.count / 50)}</span>
      <Button variant="outline" disabled={(page + 1) * 50 >= query.data.count} onClick={() => navigate({ search: (previous) => ({ ...previous, page: page + 1 }) })}>Next</Button>
    </div>}
  </div>;
}