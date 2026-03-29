"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  if (connecting) {
    return (
      <button
        disabled
        className="rounded-full bg-[#60A5FA]/60 px-3 sm:px-5 py-2.5 text-sm font-semibold text-[#F0F9FF] cursor-wait"
      >
        <span className="hidden sm:inline">Connecting…</span>
        <span className="sm:hidden">…</span>
      </button>
    );
  }

  if (publicKey) {
    const addr = publicKey.toBase58();
    const short = `${addr.slice(0, 4)}…${addr.slice(-4)}`;
    return (
      <button
        onClick={disconnect}
        className="flex items-center gap-2 rounded-full border border-[#60A5FA]/40 bg-[#1E293B] px-3 sm:px-5 py-2.5 text-sm font-semibold text-[#F1F5F9] hover:bg-[#1E3A5F] transition-colors"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {short}
      </button>
    );
  }

  return (
    <button
      onClick={() => setVisible(true)}
      className="rounded-full bg-[#60A5FA] px-3 sm:px-5 py-2.5 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] transition-colors"
    >
      <span className="hidden sm:inline">Connect Wallet</span>
      <span className="sm:hidden">Connect</span>
    </button>
  );
}
