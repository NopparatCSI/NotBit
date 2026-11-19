export function projectionMatches(row: { on_chain: boolean; status: string; chain_order_id: string; deadline: string } | null,
  chain: { status: string; orderId: string; deadline: number }) {
  return Boolean(row?.on_chain && row.status === chain.status && row.chain_order_id === chain.orderId
    && Date.parse(row.deadline) === chain.deadline * 1000);
}
