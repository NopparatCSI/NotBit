import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff, ViewerError } from "@/lib/auth/viewer";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Staff console | NOTBIT", robots: { index: false } };
export const dynamic = "force-dynamic";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="page-width flex flex-col items-start gap-4 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

// Every admin page re-checks the role on the server. Hiding links is not the access check.
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!getSupabaseConfig()) {
    return <Notice title="Staff console"><p className="text-muted-foreground">Set up Supabase to use the staff console.</p></Notice>;
  }
  let role: "ADMIN" | "SUPER_ADMIN";
  try {
    role = (await requireStaff()).role as "ADMIN" | "SUPER_ADMIN";
  } catch (error) {
    if (!(error instanceof ViewerError)) throw error;
    return (
      <Notice title="Staff console">
        <p role="alert" className="text-muted-foreground">
          {error.status === 401 ? "Sign in with your staff wallet to continue."
            : error.status === 403 ? "This wallet is not an Admin or Super Admin." : error.message}
        </p>
        <Button asChild variant="outline"><Link href="/account">Go to Wallet</Link></Button>
      </Notice>
    );
  }

  return (
    <div className="page-width flex flex-col gap-8 py-10 sm:py-12">
      <div className="flex flex-col gap-3 border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">{role === "SUPER_ADMIN" ? "Super Admin" : "Admin"} · Sepolia testnet, no real funds</p>
        <nav aria-label="Staff navigation" className="flex flex-wrap gap-1">
          <Button asChild variant="quiet" size="compact"><Link href="/admin">Review queue</Link></Button>
          <Button asChild variant="quiet" size="compact"><Link href="/admin/history">Staff history</Link></Button>
          {role === "SUPER_ADMIN" && (
            <Button asChild variant="quiet" size="compact"><Link href="/admin/super">Super Admin</Link></Button>
          )}
        </nav>
      </div>
      {children}
    </div>
  );
}