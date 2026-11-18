"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminNavigation({ superAdmin }: { superAdmin: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/admin", label: "Review queue", icon: "inbox" as const },
    { href: "/admin/history", label: "Staff history", icon: "history" as const },
    ...(superAdmin ? [{ href: "/admin/super", label: "Super Admin", icon: "settings" as const }] : []),
  ];
  return <nav aria-label="Staff navigation" className="admin-navigation">
    {items.map(item => {
      const active = item.href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/orders/") : pathname === item.href;
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("admin-nav-link", active && "admin-nav-active")}>
        <MarketplaceIcon name={item.icon} /><span>{item.label}</span><MarketplaceIcon name="chevron" className="admin-nav-chevron" />
      </Link>;
    })}
  </nav>;
}

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
    <MarketplaceIcon name="refresh" data-icon="inline-start" />{pending ? "Refreshing…" : "Refresh"}
  </Button>;
}
