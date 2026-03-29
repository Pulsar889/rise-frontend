"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { TokenInput } from "@/components/ui/TokenInput";
import { LpGauge, useRewards } from "@/hooks/useRewards";

interface GaugeCardProps {
  gauge: LpGauge;
}

type Mode = "deposit" | "withdraw" | null;

export function GaugeCard({ gauge }: GaugeCardProps) {
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState("");
  const { deposit, withdraw, loading } = useRewards();

  function toggleMode(m: Mode) {
    setMode((prev) => (prev === m ? null : m));
    setAmount("");
  }

  async function handleAction() {
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    if (mode === "deposit") await deposit(gauge.id, num);
    else if (mode === "withdraw") await withdraw(gauge.id, num);
    setAmount("");
    setMode(null);
  }

  return (
    <Card className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {gauge.poolTokens.map((t, i) => (
              <div
                key={i}
                className="h-9 w-9 rounded-full border-2 border-[#1E293B] bg-[#334155] flex items-center justify-center text-xs font-bold text-[#94A3B8]"
              >
                {t[0]}
              </div>
            ))}
          </div>
          <div>
            <p className="font-semibold text-[#F1F5F9]">{gauge.name}</p>
            <p className="text-xs text-[#94A3B8]">LP Gauge</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold text-emerald-400 tabular-nums">{gauge.apy}%</p>
          <p className="text-xs text-[#94A3B8]">APY</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 rounded-xl bg-[#1E293B] p-3 text-center">
        <div>
          <p className="text-xs text-[#94A3B8] mb-0.5">TVL</p>
          <p className="text-sm font-semibold text-[#F1F5F9]">${(gauge.tvl / 1_000_000).toFixed(1)}M</p>
        </div>
        <div>
          <p className="text-xs text-[#94A3B8] mb-0.5">My Deposit</p>
          <p className="text-sm font-semibold text-[#F1F5F9]">
            {gauge.myDeposit > 0 ? `$${gauge.myDeposit.toLocaleString()}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#94A3B8] mb-0.5">Claimable</p>
          <p className={`text-sm font-semibold ${gauge.claimableRise > 0 ? "text-[#60A5FA]" : "text-[#8C8880]"}`}>
            {gauge.claimableRise > 0 ? `${gauge.claimableRise} RISE` : "—"}
          </p>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => toggleMode("deposit")}
          className={`flex-1 rounded-full py-2.5 text-sm font-medium border transition-colors ${
            mode === "deposit"
              ? "border-[#60A5FA] bg-[#1E3A5F] text-[#60A5FA]"
              : "border-[#334155] text-[#64748B] hover:border-[#60A5FA]/50"
          }`}
        >
          Deposit
        </button>
        <button
          onClick={() => toggleMode("withdraw")}
          disabled={gauge.myDeposit === 0}
          className={`flex-1 rounded-full py-2.5 text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            mode === "withdraw"
              ? "border-[#60A5FA] bg-[#1E3A5F] text-[#60A5FA]"
              : "border-[#334155] text-[#64748B] hover:border-[#60A5FA]/50"
          }`}
        >
          Withdraw
        </button>
      </div>

      {/* Inline form */}
      {mode && (
        <div className="flex flex-col gap-3 border-t border-[#334155] pt-3">
          <TokenInput
            token="LP"
            value={amount}
            onChange={setAmount}
            max={mode === "withdraw" ? gauge.myDeposit : undefined}
          />
          <button
            onClick={handleAction}
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="w-full rounded-full bg-[#60A5FA] py-3 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Processing…" : mode === "deposit" ? "Deposit LP" : "Withdraw LP"}
          </button>
        </div>
      )}
    </Card>
  );
}
