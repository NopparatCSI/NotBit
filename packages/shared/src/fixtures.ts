import { toChainId, type EscrowReader, type OrderSnapshot } from "./escrow";
import type { Viewer } from "./model";

export const demoGames = [
  { slug: "counter-strike-2", name: "Counter-Strike 2", category: "สกินอาวุธ" },
  { slug: "team-fortress-2", name: "Team Fortress 2", category: "หมวกและไอเทม" },
  { slug: "warframe", name: "Warframe", category: "Mods และชิ้นส่วน Prime" },
  { slug: "dota-2", name: "Dota 2", category: "Hero cosmetics and treasures" },
  { slug: "rust", name: "Rust", category: "Clothing, weapon, and deployable skins" },
  { slug: "unturned", name: "Unturned", category: "Cosmetics and weapon skins" },
] as const;

export const demoViewers = {
  buyer: { id: "10000000-0000-4000-8000-000000000001", wallet: "0x0000000000000000000000000000000000000001", role: "USER" },
  seller: { id: "10000000-0000-4000-8000-000000000002", wallet: "0x0000000000000000000000000000000000000002", role: "USER" },
  admin: { id: "10000000-0000-4000-8000-000000000003", wallet: "0x0000000000000000000000000000000000000003", role: "ADMIN" },
  superAdmin: { id: "10000000-0000-4000-8000-000000000004", wallet: "0x0000000000000000000000000000000000000004", role: "SUPER_ADMIN" },
} as const satisfies Record<string, Viewer>;

export const demoOrder = {
  orderId: toChainId("20000000-0000-4000-8000-000000000001"),
  listingId: toChainId("30000000-0000-4000-8000-000000000001"),
  buyer: demoViewers.buyer.wallet,
  seller: demoViewers.seller.wallet,
  amountWei: "10000000000000000",
  deadline: 1893456000,
  status: "FUNDED",
} as const satisfies OrderSnapshot;

export function createMockEscrowReader(
  orders: readonly OrderSnapshot[] = [demoOrder],
  fundingPaused = false,
): EscrowReader {
  const byId = new Map(orders.map((order) => [order.orderId.toLowerCase(), order]));
  return {
    async getOrder(orderId) {
      const order = byId.get(orderId.toLowerCase());
      return order ? { ...order } : null;
    },
    async isFundingPaused() {
      return fundingPaused;
    },
  };
}
