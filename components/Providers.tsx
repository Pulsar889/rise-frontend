"use client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";
import { RPC_ENDPOINT } from "@/lib/constants";

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => RPC_ENDPOINT, []);
  // Pass empty array — WalletProvider auto-detects all standard wallets (Phantom,
  // Solflare, MetaMask, etc.) via the Wallet Standard. Passing adapters explicitly
  // causes duplicates when the same wallet is also auto-detected.
  const wallets = useMemo(() => [] as never[], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
