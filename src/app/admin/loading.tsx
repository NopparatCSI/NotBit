import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return <div className="admin-page-stack" role="status" aria-label="Loading staff console">
    <span className="sr-only">Loading staff console…</span>
    <Skeleton className="h-10 w-56" /><Skeleton className="h-4 w-3/4" />
    <div className="admin-stats">{[0, 1, 2].map(item => <Skeleton key={item} className="h-32 w-full rounded-xl" />)}</div>
    <Skeleton className="h-72 w-full rounded-xl" />
  </div>;
}
