"use client";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { TokenInput } from "@/components/ui/TokenInput";
import { useStaking } from "@/hooks/useStaking";

export function StakeForm() {
  const [amount, setAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState(false);
  const { publicKey } = useWallet();
  const { data, loading, stake } = useStaking();

  const num = parseFloat(amount) || 0;
  const riseSolReceived = num > 0 ? (num / data.exchangeRate).toFixed(4) : "0.0000";

  async function handleStake() {
    if (num <= 0) return;
    setTxError(null);
    setTxSuccess(false);
    try {
      await stake(num);
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
        label="You stake"
        token="SOL"
        value={amount}
        onChange={setAmount}
        max={data.solBalance}
      />

      <div className="rounded-xl border border-[#334155] bg-[#1E293B] px-4 py-4 flex flex-col gap-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-[#94A3B8]">You receive</span>
          <span className="font-semibold text-[#F1F5F9] tabular-nums">{riseSolReceived} riseSOL</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#94A3B8]">Exchange rate</span>
          <span className="text-[#F1F5F9] tabular-nums">1 riseSOL = {data.exchangeRate.toFixed(4)} SOL</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#94A3B8]">Current APY</span>
          <span className="font-medium text-emerald-400">
            {data.apy > 0 ? `${data.apy}%` : "—"}
          </span>
        </div>
      </div>

      {txSuccess && (
        <p className="text-sm font-medium text-emerald-400">Stake confirmed!</p>
      )}
      {txError && (
        <p className="text-sm font-medium text-red-400 break-all">{txError}</p>
      )}

      <button
        onClick={handleStake}
        disabled={loading || !publicKey || num <= 0}
        className="w-full rounded-full bg-[#60A5FA] py-3.5 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Staking…" : "Stake SOL"}
      </button>
    </div>
  );
}
