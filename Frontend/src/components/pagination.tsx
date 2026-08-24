import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  total: number;
  pageSize: number;
  setPage: (page: number) => void;
  busy?: boolean;
  noun?: string;
};

const button =
  "inline-flex items-center gap-1.5 rounded border border-line bg-field px-3 py-2 text-sm2 whitespace-nowrap text-ink transition-colors hover:border-brandtext disabled:pointer-events-none disabled:opacity-40";

// Says what is on screen out of what exists, so a page is never mistaken for the whole.
export function Pagination({ page, total, pageSize, setPage, busy = false, noun = "records" }: Props) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);

  if (total <= pageSize) {
    return (
      <div className="flex items-center justify-end border-t border-line px-4.5 py-3 min-[431px]:px-6">
        <span className="text-xs2 text-subtle">
          {total} {noun}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4.5 py-3 min-[431px]:px-6">
      <span className={cn("text-xs2 text-subtle", busy && "opacity-60")}>
        {first}–{last} of {total} {noun}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={button} onClick={() => setPage(page - 1)} disabled={page === 0 || busy}>
          <ChevronLeft className="size-3.5" aria-hidden="true" /> Previous
        </button>
        <span className="text-xs2 whitespace-nowrap text-subtle">
          Page {page + 1} of {pages}
        </span>
        <button type="button" className={button} onClick={() => setPage(page + 1)} disabled={page + 1 >= pages || busy}>
          Next <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
