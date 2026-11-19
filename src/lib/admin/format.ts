import { formatEther } from "viem";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
});

export function formatTime(value: string | null | undefined) {
  return value ? `${dateFormat.format(new Date(value))} (UTC+7)` : "—";
}

export function formatEth(wei: string | null | undefined) {
  return wei ? `${formatEther(BigInt(wei))} ETH` : "—";
}

export function shortHex(value: string | null | undefined, size = 6) {
  if (!value) return "—";
  return value.length <= size * 2 + 2 ? value : `${value.slice(0, size + 2)}…${value.slice(-size)}`;
}

export function timeLeft(deadline: string, now = Date.now()) {
  const ms = new Date(deadline).getTime() - now;
  const hours = Math.floor(Math.abs(ms) / 3_600_000);
  const minutes = Math.floor((Math.abs(ms) % 3_600_000) / 60_000);
  const text = hours ? `${hours} h ${minutes} min` : `${minutes} min`;
  return ms > 0 ? `${text} left` : `${text} overdue`;
}

export const statusLabels = {
  FUNDED: "Funded · awaiting delivery",
  DELIVERED: "Delivered · awaiting receipt",
  IN_REVIEW: "In review",
  RELEASED: "Released to seller",
  REFUNDED: "Refunded to buyer",
} as const;

export const actionLabels: Record<string, string> = {
  ORDER_REVIEWED: "Opened order review",
  EVIDENCE_VIEWED: "Viewed evidence",
  EVIDENCE_VERIFIED: "Verified evidence hash",
  DECISION_PREPARED: "Prepared decision",
  DECISION_SUBMITTED: "Sent decision transaction",
  ESCALATION_SUBMITTED: "Sent escalation transaction",
  FUNDING_PAUSE_SUBMITTED: "Sent funding pause transaction",
  DECISION_CONFIRMED: "Decision confirmed on-chain",
  ESCALATION_CONFIRMED: "Escalation confirmed on-chain",
  FUNDING_PAUSE_CONFIRMED: "Funding change confirmed on-chain",
  TRANSACTION_FAILED: "Transaction reverted on-chain",
  TRANSACTION_REORGED: "Transaction requires re-verification after a chain reorganization",
  CHAT_IMAGE_VIEWED: "Viewed private chat image",
  CHAT_PAGE_VIEWED: "Read conversation history",
};
