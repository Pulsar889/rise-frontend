"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { HealthBar } from "@/components/ui/HealthBar";
import { TokenInput } from "@/components/ui/TokenInput";
import { CdpPosition, useCdp } from "@/hooks/useCdp";
import { RepayForm } from "./RepayForm";

interface PositionCardProps {
  position: CdpPosition;
}

export function PositionCard({ position }: PositionCardProps) {
  const [showRepay, setShowRepay] = useState(false);
  const [showBorrow, setShowBorrow] = useState(false);
  const [borrowAmount, setBorrowAmount] = useState("");
  const { borrowMore, loading } = useCdp();

  const statusStyles: Record<string, string> = {
    healthy: "bg-emerald-950 text-emerald-400",
    warning: "bg-amber-950 text-amber-400",
    danger:  "bg-red-950 text-red-400",
  };

  async function handleBorrowMore() {
    const num = parseFloat(borrowAmount);
    if (!num || num <= 0) return;
    await borrowMore(position, num);
    setBorrowAmount("");
    setShowBorrow(false);
  }

  return (
    <Card className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#334155] flex items-center justify-center text-sm font-bold text-[#94A3B8]">
            {position.collateralToken[0]}
          </div>
          <div>
            <p className="font-semibold text-[#F1F5F9]">{position.collateralToken} Position</p>
            <p className="text-xs text-[#94A3B8]">Nonce #{position.nonce}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyles[position.status]}`}>
          {position.status}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">Collateral</p>
          <p className="text-xl font-semibold tabular-nums text-[#F1F5F9]">
            {position.collateralAmount} {position.collateralToken}
          </p>
          <p className="text-sm text-[#94A3B8]">${position.collateralValueUsd.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">Debt</p>
          <p className="text-xl font-semibold tabular-nums text-[#F1F5F9]">
            {position.debtRiseSol} riseSOL
          </p>
          <p className="text-sm text-[#94A3B8]">${position.debtValueUsd.toLocaleString()}</p>
        </div>
      </div>

      <HealthBar value={position.healthFactor} />

      <div className="flex justify-between text-xs text-[#94A3B8]">
        <span>Max LTV: {position.maxLtv}%</span>
        <span>Liquidation at: {position.liquidationThreshold}%</span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => { setShowRepay(!showRepay); setShowBorrow(false); }}
          className={`flex-1 rounded-full border py-2.5 text-sm font-medium transition-colors ${
            showRepay
              ? "border-[#60A5FA] text-[#60A5FA] bg-[#1E3A5F]"
              : "border-[#334155] text-[#F1F5F9] hover:border-[#60A5FA]"
          }`}
        >
          Repay
        </button>
        <button
          onClick={() => { setShowBorrow(!showBorrow); setShowRepay(false); }}
          className={`flex-1 rounded-full border py-2.5 text-sm font-medium transition-colors ${
            showBorrow
              ? "border-[#60A5FA] text-[#60A5FA] bg-[#1E3A5F]"
              : "border-[#334155] text-[#F1F5F9] hover:border-[#60A5FA]"
          }`}
        >
          Borrow More
        </button>
      </div>

      {showRepay && (
        <RepayForm position={position} debtRiseSol={position.debtRiseSol} />
      )}

      {showBorrow && (
        <div className="flex flex-col gap-3 border-t border-[#334155] pt-4">
          <p className="text-sm font-medium text-[#F1F5F9]">Borrow More riseSOL</p>
          <TokenInput token="riseSOL" value={borrowAmount} onChange={setBorrowAmount} />
          <button
            onClick={handleBorrowMore}
            disabled={loading || !borrowAmount || parseFloat(borrowAmount) <= 0}
            className="w-full rounded-full bg-[#60A5FA] py-3 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 transition-colors"
          >
            {loading ? "Processing…" : "Borrow riseSOL"}
          </button>
        </div>
      )}
    </Card>
  );
}
