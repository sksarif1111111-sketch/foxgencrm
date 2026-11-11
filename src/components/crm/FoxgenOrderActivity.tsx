import { useQuery } from "@tanstack/react-query";
import { foxgenOrderActivityOptions } from "@/lib/foxgen-queries";
import { FoxgenStatus } from "./FoxgenStatus";
import { orderData, text } from "@/lib/foxgen-orders";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function FoxgenOrderActivity({ id }: { id: string }) {
  const query = useQuery(foxgenOrderActivityOptions(id));
  return (
    <section className="mt-6 border-t pt-4">
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
                return (
                  <TableRow key={`${r.entity}:${r.external_id}`}>
                    <TableCell className="max-w-64 break-all">
                      {r.entity === "refunds" ? "Refund" : "Payment"}
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
  );
}
