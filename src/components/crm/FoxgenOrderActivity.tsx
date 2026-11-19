import { useQuery } from "@tanstack/react-query";
import { foxgenOrderActivityOptions } from "@/lib/foxgen-queries";
import { FoxgenStatus } from "./FoxgenStatus";
import { Link } from "@tanstack/react-router";
import { orderTimeline } from "@/lib/foxgen-presentation";
import { customerExternalId } from "@/lib/foxgen-customers";
import { orderData, text, type FoxgenOrder } from "@/lib/foxgen-orders";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function FoxgenOrderActivity({ id, order }: { id: string; order: FoxgenOrder }) {
  const query = useQuery(foxgenOrderActivityOptions(id));
  const events = orderTimeline(order, query.data);
  return (
    <>
      <section className="mt-5 rounded-lg border bg-card p-4 shadow-card">
        <h2 className="mb-3 text-lg font-extrabold">Order activity</h2>
        {events.length ? (
          <ol className="ml-1 border-l">
            {events.map((event) => (
              <li key={event.label} className="relative pb-3 pl-4 last:pb-0">
                <span className="absolute -left-1 top-1.5 size-2 rounded-full bg-primary" />
                <p className="text-sm font-bold">{event.label}</p>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={new Date(event.time).toISOString()}
                >
                  {new Date(event.time).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No event timestamps received.</p>
        )}
      </section>
      <section className="mt-5 rounded-lg border bg-card p-4 shadow-card">
        <h2 className="mb-4 text-lg font-semibold">Payment & refund history</h2>
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : query.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load activity. Refresh this order.
          </p>
        ) : !query.data.length ? (
          <p className="text-sm text-muted-foreground">
            No linked payment or refund records received.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Record</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((r) => {
                  const d = orderData(r.data);
                  const memberId = customerExternalId(r.data) ?? customerExternalId(order.data);
                  return (
                    <TableRow key={`${r.entity}:${r.external_id}`}>
                      <TableCell className="max-w-64 break-all">
                        {r.entity === "refunds" ? "Refund" : "Payment"}
                        {memberId && (
                          <Link
                            to="/foxgen-customers/$id"
                            params={{ id: memberId }}
                            className="ml-2 font-semibold text-primary hover:underline"
                          >
                            Member profile
                          </Link>
                        )}
                        <p className="figure text-xs text-muted-foreground">{r.external_id}</p>
                      </TableCell>
                      <TableCell>
                        <FoxgenStatus status={r.status} />
                      </TableCell>
                      <TableCell className="figure whitespace-nowrap">
                        {r.amount === null ? "—" : `${r.currency ?? ""} ${r.amount.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="max-w-64 break-all">
                        {text(d["transaction_id"] ?? d["reference"] ?? d["payment_reference"])}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(r.source_updated_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
