"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { connect, createConfig, disconnect, getAccount, http, injected, signMessage, switchChain, watchAccount } from "@wagmi/core";
import { sepolia } from "viem/chains";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import type { Viewer } from "@marketplace/shared";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";

const walletConfig = createConfig({
  chains: [sepolia],
  connectors: [injected({ target: "metaMask" })],
  multiInjectedProviderDiscovery: false,
  transports: { [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || undefined) },
});

const roleLabels = { USER: "Buyer / Seller", ADMIN: "Admin", SUPER_ADMIN: "Super Admin" } as const;

function subscribeToAccount(onChange: () => void) {
  return watchAccount(walletConfig, { onChange });
}

function navigateToLocalWalletHost() {
  const url = new URL(window.location.href);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]") return false;

  // Supabase's SIWE parser accepts localhost but rejects numeric loopback hosts.
  // Switch origins before requesting a signature so the signed host matches the browser.
  url.hostname = "localhost";
  window.location.replace(url);
  return true;
}

export function WalletAccount({ viewer }: { viewer: Viewer | null }) {
  const config = getSupabaseConfig();
  const router = useRouter();
  const address = useSyncExternalStore(subscribeToAccount, () => getAccount(walletConfig).address, () => undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const connector = walletConfig.connectors[0];

  useEffect(() => {
    navigateToLocalWalletHost();
  }, []);

  async function signIn() {
    if (!config || !connector || navigateToLocalWalletHost()) return;
    setError("");
    setPending(true);
    try {
      if (!(await connector.getProvider())) {
        setError("Open this page in a browser with MetaMask installed.");
        return;
      }

      const current = getAccount(walletConfig);
      const connection = current.address && current.connector === connector
        ? { accounts: [current.address], chainId: current.chainId }
        : await connect(walletConfig, { connector });
      const wallet = connection.accounts[0];
      if (!wallet) throw new Error("Missing wallet address");
      if (connection.chainId !== sepolia.id) await switchChain(walletConfig, { chainId: sepolia.id, connector });

      const message = createSiweMessage({
        domain: window.location.host,
        uri: window.location.origin,
        address: wallet,
        chainId: sepolia.id,
        version: "1",
        nonce: generateSiweNonce(),
        statement: "Sign in to NOTBIT on Sepolia.",
      });
      const signature = await signMessage(walletConfig, { message, account: wallet, connector });
      const client = createBrowserClient(config.url, config.key);
      const result = await client.auth.signInWithWeb3({ chain: "ethereum", message, signature });
      if (result.error) {
        setError("Wallet verification failed. Try again or check the Supabase configuration.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not connect or sign with MetaMask. Check your wallet and try again.");
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    if (!config) return;
    setError("");
    setPending(true);
    try {
      const client = createBrowserClient(config.url, config.key);
      const result = await client.auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
      if (getAccount(walletConfig).connector) await disconnect(walletConfig);
      router.refresh();
    } catch {
      setError("Could not sign out. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="Wallet settings" className="flex max-w-xl flex-col items-start gap-4 border-t border-border pt-6">
      {viewer ? (
        <>
          <p className="font-semibold">{roleLabels[viewer.role]}</p>
          <p className="max-w-full font-mono text-sm break-all text-muted-foreground">{viewer.wallet}</p>
          {address && address.toLowerCase() !== viewer.wallet && (
            <p role="status">Your MetaMask account changed. Sign out and sign in with the new account.</p>
          )}
          <Button type="button" variant="outline" onClick={signOut} disabled={pending}>Sign out</Button>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            {config
              ? "Choose an account in MetaMask and sign a message to verify ownership of your wallet."
              : "You’re browsing demo data. Set up Supabase to enable MetaMask sign-in."}
          </p>
          <Button type="button" onClick={signIn} disabled={!config || pending || !connector}>
            {pending ? "Waiting for MetaMask…" : "Sign in with MetaMask"}
          </Button>
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
