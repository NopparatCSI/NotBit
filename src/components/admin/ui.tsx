import type { ComponentProps, ReactNode } from "react";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export function AdminHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <header className="admin-page-heading">
    <div className="flex min-w-0 flex-col gap-2">
      {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
      <h1 className="admin-title">{title}</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>;
}

export function AdminPanel({ title, description, action, children, className, id }: {
  title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return <Card className={cn("admin-panel", className)}>
    <CardHeader>
      <CardTitle><h2 id={id}>{title}</h2></CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>;
}

export function AdminEmpty({ icon = "inbox", title, description }: {
  icon?: ComponentProps<typeof MarketplaceIcon>["name"]; title: string; description: string;
}) {
  return <Empty className="admin-empty"><EmptyHeader>
    <EmptyMedia variant="icon"><MarketplaceIcon name={icon} /></EmptyMedia>
    <EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription>
  </EmptyHeader></Empty>;
}

const labels = { FUNDED: "Awaiting delivery", DELIVERED: "Awaiting receipt", IN_REVIEW: "In review", RELEASED: "Paid to seller", REFUNDED: "Refunded" } as const;
export function OrderStatus({ status }: { status: keyof typeof labels }) {
  return <Badge variant={status === "IN_REVIEW" ? "warning" : status === "RELEASED" || status === "REFUNDED" ? "success" : "outline"}>{labels[status]}</Badge>;
}
