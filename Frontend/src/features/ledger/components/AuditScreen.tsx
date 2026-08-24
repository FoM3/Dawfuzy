import { useState } from "react";
import { Package, PencilLine, Trash2, UserCheck, UserMinus, UserPen, UserPlus, UserX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/pagination";
import { PAGE_SIZE, useAuditPage } from "@/features/ledger/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { formatDay } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import type { AuditAction, AuditEntry } from "@/features/ledger/types";

const th = "px-4 py-3 text-left text-xs2 font-bold tracking-[1.4px] text-subtle uppercase whitespace-nowrap";
const td = "px-4 py-4 text-md2 align-middle";

const look: Record<AuditAction, { label: string; Icon: typeof Package; tone: string }> = {
  "product.added": { label: "Added product", Icon: Package, tone: "bg-pos-soft text-pos" },
  "product.updated": { label: "Edited product", Icon: PencilLine, tone: "bg-info-soft text-info" },
  "person.added": { label: "Added person", Icon: UserPlus, tone: "bg-pos-soft text-pos" },
  "person.updated": { label: "Edited person", Icon: UserPen, tone: "bg-info-soft text-info" },
  "person.removed": { label: "Removed person", Icon: UserMinus, tone: "bg-neg-soft text-neg" },
  "person.disabled": { label: "Disabled person", Icon: UserX, tone: "bg-neg-soft text-neg" },
  "person.enabled": { label: "Enabled person", Icon: UserCheck, tone: "bg-pos-soft text-pos" },
  "sale.updated": { label: "Corrected sale", Icon: PencilLine, tone: "bg-info-soft text-info" },
  "sale.deleted": { label: "Removed sale", Icon: Trash2, tone: "bg-neg-soft text-neg" }
};

// embedded drops the page heading so the account page can host it as one more card.
export function AuditScreen({ audit, embedded = false }: { audit: AuditEntry[]; embedded?: boolean }) {
  const [page, setPage] = useState(0);
  const query = useAuditPage(page, isSupabaseConfigured);

  // Without a backend the trail lives in memory; it is append-only, so reversing gives
  // newest first. With one, the server does the ordering and the paging.
  const local = [...audit].reverse();
  const trail = isSupabaseConfigured ? query.data?.rows ?? [] : local.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const total = isSupabaseConfigured ? query.data?.total ?? 0 : local.length;

  return (
    <div
      className={cn(
        !embedded &&
          "mx-auto max-w-[1450px] px-[clamp(22px,4vw,55px)] pt-9 pb-[calc(var(--nav-height)+var(--safe-bottom)+32px)] lg:pb-15"
      )}
    >
      {!embedded && (
        <div className="mb-6 lg:mb-8">
          <Eyebrow>Audit log</Eyebrow>
          <h2 className="m-0 font-serif text-[clamp(32px,4vw,54px)] leading-none font-medium tracking-[-2px]">
            Who changed
            <br />
            <em className="font-medium text-accent">what, and when.</em>
          </h2>
        </div>
      )}

      <Card className="gap-0 overflow-hidden rounded-none border-line bg-panel p-0 shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4.5 py-4 min-[431px]:px-6">
          <h3 className="m-0 font-serif text-2xl2 font-medium">Every change</h3>
          <span className="text-xs2 whitespace-nowrap text-subtle">{total} events</span>
        </div>

        {trail.length === 0 ? (
          <p className="m-0 px-4.5 py-12 text-center text-md2 text-subtle min-[431px]:px-6">
            Nothing yet. Adding or editing a product or a person will show up here.
          </p>
        ) : (
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line bg-band">
                  <th className={th}>Action</th>
                  <th className={th}>Item</th>
                  <th className={th}>By</th>
                  <th className={th}>When</th>
                </tr>
              </thead>
              <tbody>
                {trail.map(entry => {
                  const row = look[entry.action];
                  return (
                    <tr key={entry.id} className="border-b border-line-soft last:border-b-0">
                      <td className={cn(td, "whitespace-nowrap")}>
                        <span className="flex items-center gap-3">
                          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", row.tone)}>
                            <row.Icon className="size-4.5" aria-hidden="true" />
                          </span>
                          {row.label}
                        </span>
                      </td>
                      <td className={cn(td, "min-w-45")}>
                        <strong className="block font-semibold">{entry.subject}</strong>
                        {entry.detail && <span className="mt-0.5 block text-sm2 text-subtle">{entry.detail}</span>}
                      </td>
                      <td className={cn(td, "whitespace-nowrap text-subtle")}>{entry.actorName}</td>
                      <td className={cn(td, "whitespace-nowrap text-subtle")}>
                        {formatDay(entry.date)}
                        <span className="block text-sm2 text-faint">{entry.time}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          setPage={setPage}
          busy={query.isFetching}
          noun="events"
        />
      </Card>
    </div>
  );
}
