import { WalletAccount } from "@/components/wallet-account";
import { requireViewer, ViewerError } from "@/lib/auth/viewer";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Viewer } from "@marketplace/shared";

export default async function Account() {
  let viewer: Viewer | null = null;
  let message = "";
  if (getSupabaseConfig()) {
    try {
      viewer = await requireViewer();
    } catch (error) {
      if (!(error instanceof ViewerError)) throw error;
      if (error.status !== 401) message = error.message;
    }
  }
  return (
    <div className="page-width flex flex-col gap-6 py-12 sm:py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Wallet account</h1>
      {message && <p role="alert" className="text-destructive">{message}</p>}
      <WalletAccount viewer={viewer} />
    </div>
  );
}
