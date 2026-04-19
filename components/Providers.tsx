"use client";
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

if (!(Uint8Array.prototype as any).readUint8) {
  Object.defineProperty(Uint8Array.prototype, "readUint8", {
    value: function (offset: number) { return this[offset]; },
    writable: true, configurable: true,
  });
}
if (!(Uint8Array.prototype as any).readUInt8) {
  Object.defineProperty(Uint8Array.prototype, "readUInt8", {
    value: function (offset: number) { return this[offset]; },
    writable: true, configurable: true,
  });
}
if (!(Uint8Array.prototype as any).readUint16BE) {
  Object.defineProperty(Uint8Array.prototype, "readUint16BE", {
    value: function (offset: number) { return (this[offset] << 8) | this[offset + 1]; },
    writable: true, configurable: true,
  });
}
if (!(Uint8Array.prototype as any).readInt32BE) {
  Object.defineProperty(Uint8Array.prototype, "readInt32BE", {
    value: function (offset: number) {
      return ((this[offset] << 24) | (this[offset+1] << 16) | (this[offset+2] << 8) | this[offset+3]) | 0;
    },
    writable: true, configurable: true,
  });
}
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
