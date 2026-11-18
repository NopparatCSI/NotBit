import type { Metadata } from "next";
import { OrdersPage } from "@/components/orders-page";

export const metadata: Metadata = { title: "Sales orders | NOTBIT" };

export default async function SalesOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  return <OrdersPage side="sell" pageValue={(await searchParams).page} />;
}
