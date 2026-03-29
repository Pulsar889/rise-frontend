"use client";
import { useWallet as useSolanaWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect, useState } from "react";

export function useWallet() {
  const { publicKey, connected, connecting, disconnect, wallet } = useSolanaWallet();
  const { connection } = useConnection();
  const [solBalance, setSolBalance] = useState(0);

  useEffect(() => {
    if (!publicKey) { setSolBalance(0); return; }
    connection.getBalance(publicKey).then((b) => setSolBalance(b / LAMPORTS_PER_SOL));
  }, [publicKey, connection]);

  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;

  return { publicKey, connected, connecting, disconnect, wallet, solBalance, shortAddress };
}
