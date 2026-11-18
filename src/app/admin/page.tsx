import { listReviewQueue } from "@/lib/admin/queries";
import { requireStaff, ViewerError } from "@/lib/auth/viewer";
import { ReviewQueueContent } from "@/components/admin/review-queue";
import type { OrderOverview } from "@/lib/orders/context";

export const dynamic = "force-dynamic";

function queueItem(order: OrderOverview) {
  const { id, status, listing_title, game_slug, amount_wei, chain_order_id, review_expired, in_review_at, deadline, resolved_at } = order;
  return { id, status, listing_title, game_slug, amount_wei, chain_order_id, review_expired, in_review_at, deadline, resolved_at };
}

export default async function ReviewQueue() {
  try { await requireStaff(); }
  catch (error) { if (error instanceof ViewerError) return null; throw error; }
  const { review, overdue, resolved } = await listReviewQueue();
  return <ReviewQueueContent review={review.map(queueItem)} overdue={overdue.map(queueItem)} resolved={resolved.map(queueItem)} />;
}
