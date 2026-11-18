import { listReviewQueue } from "@/lib/admin/queries";
import { requireStaff, ViewerError } from "@/lib/auth/viewer";
import { OrderList, overdueDetail, resolvedDetail, reviewDetail } from "@/components/admin/order-list";

export const dynamic = "force-dynamic";

export default async function ReviewQueue() {
  try {
    await requireStaff();
  } catch (error) {
    if (error instanceof ViewerError) return null; // The layout shows the access message.
    throw error;
  }
  const { review, overdue, resolved } = await listReviewQueue();

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="review-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 id="review-heading" className="text-3xl font-semibold tracking-tight">Review queue</h1>
          <p role="status" className="text-sm text-muted-foreground">{review.length} waiting for a decision</p>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Disputes and overdue orders stay in escrow until a staff member decides. Oldest first.
        </p>
        <OrderList orders={review} empty="No orders are waiting for review." detail={reviewDetail} />
      </section>

      <section aria-labelledby="overdue-heading" className="flex flex-col gap-3">
        <h2 id="overdue-heading" className="text-xl font-semibold">Past deadline, not yet in review</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The contract already blocks the normal path for these orders. The background job moves them to review,
          or open one to move it with your wallet. Nothing is paid or refunded automatically.
        </p>
        <OrderList orders={overdue} empty="No overdue orders." detail={overdueDetail} />
      </section>

      <section aria-labelledby="resolved-heading" className="flex flex-col gap-3">
        <h2 id="resolved-heading" className="text-xl font-semibold">Recent decisions</h2>
        <OrderList orders={resolved} empty="No decisions yet." detail={resolvedDetail} />
      </section>
    </div>
  );
}