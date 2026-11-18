"use client";

import { AdminEmpty } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

export default function AdminError({ retry }: { error: unknown; retry: () => void }) {
  return <div className="admin-page-stack" role="alert">
    <AdminEmpty icon="info" title="We couldn't load the staff console" description="The connection may be temporarily unavailable. Try loading the page again. If it continues, contact the project administrator." />
    <div className="flex justify-center"><Button onClick={() => retry()}>Try again</Button></div>
  </div>;
}
