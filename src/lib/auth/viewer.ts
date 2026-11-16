import "server-only";
import { viewerSchema, type Role, type Viewer } from "@marketplace/shared";
import { createServerSupabase } from "@/lib/supabase/server";

const staffRoles = ["ADMIN", "SUPER_ADMIN"] as const;

export class ViewerError extends Error {
  constructor(public readonly status: 401 | 403 | 503, message: string) {
    super(message);
  }
}

export async function requireViewer(allowedRoles?: readonly Role[]): Promise<Viewer> {
  const supabase = await createServerSupabase();
  if (!supabase) throw new ViewerError(503, "Supabase is not configured.");

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && (!authError.status || authError.status >= 500)) {
    throw new ViewerError(503, "Sign-in verification is currently unavailable.");
  }
  if (!user) throw new ViewerError(401, "Sign in with MetaMask to continue.");

  const { data, error } = await supabase.rpc("get_marketplace_viewer").maybeSingle();
  if (error) throw new ViewerError(503, "Could not verify your permissions. Try again.");
  const viewer = viewerSchema.safeParse(data);
  if (!viewer.success || viewer.data.id !== user.id) {
    throw new ViewerError(403, "This account has no verified wallet.");
  }

  const providerId = `web3:ethereum:${viewer.data.wallet}`;
  const ownsWallet = user.identities?.some(({ provider, id }) =>
    provider === "web3" && id.toLowerCase() === providerId,
  );
  if (!ownsWallet || (allowedRoles && !allowedRoles.includes(viewer.data.role))) {
    throw new ViewerError(403, "This account does not have access.");
  }

  return viewer.data;
}

export function requireTradeUser() {
  return requireViewer(["USER"]);
}

export function requireStaff() {
  return requireViewer(staffRoles);
}

export function requireSuperAdmin() {
  return requireViewer(["SUPER_ADMIN"]);
}
