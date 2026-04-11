"use client";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { TokenInput } from "@/components/ui/TokenInput";
import type { StakingData } from "@/hooks/useStaking";

interface UnstakeFormProps {
  data: StakingData;
  loading: boolean;
  unstake: (riseSolAmount: number) => Promise<bigint>;
}

export function UnstakeForm({ data, loading, unstake }: UnstakeFormProps) {
  const [amount, setAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState(false);
  const { publicKey } = useWallet();

  const num = parseFloat(amount) || 0;
  const solReceived = num > 0 ? (num * data.exchangeRate).toFixed(4) : "0.0000";

  async function handleUnstake() {
    if (num <= 0) return;
    setTxError(null);
    setTxSuccess(false);
    try {
      await unstake(num);
      setAmount("");
      setTxSuccess(true);
      setTimeout(() => setTxSuccess(false), 4000);
    } catch (err: any) {
      setTxError(err?.message ?? "Transaction failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <TokenInput
        label="You unstake"
        token="riseSOL"
        value={amount}
        onChange={setAmount}
        max={data.riseSolBalance}
      />

      <div className="rounded-xl border border-[#334155] bg-[#1E293B] px-4 py-4 flex flex-col gap-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-[#94A3B8]">You receive</span>
          <span className="font-semibold text-[#F1F5F9] tabular-nums">{solReceived} SOL</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#94A3B8]">Exchange rate</span>
          <span className="text-[#F1F5F9] tabular-nums">1 riseSOL = {data.exchangeRate.toFixed(4)} SOL</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#94A3B8]">Unstake period</span>
          <span className="text-[#F1F5F9]">~2–3 epochs (~4–6 days)</span>
        </div>
      </div>

      {txSuccess && (
        <p className="text-sm font-medium text-emerald-400">Unstake submitted — ticket created.</p>
      )}
      {txError && (
        <p className="text-sm font-medium text-red-400 break-all">{txError}</p>
      )}

      <button
        onClick={handleUnstake}
        disabled={loading || !publicKey || num <= 0}
        className="w-full rounded-full bg-[#60A5FA] py-3.5 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Unstaking…" : "Unstake riseSOL"}
      </button>
    </div>
  );
}
