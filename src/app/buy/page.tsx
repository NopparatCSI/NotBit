import type { Metadata } from "next";
import { OrdersPage } from "@/components/orders-page";

export const metadata: Metadata = { title: "Purchases | NOTBIT" };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  return <OrdersPage side="buy" pageValue={(await searchParams).page} />;
}
