"use client";
import { Card } from "@/components/ui/Card";
import type { LpGauge } from "@/hooks/useRewards";

interface ClaimPanelProps {
  totalClaimable: number;
  stakeClaimable: number;
  gauges: LpGauge[];
  claimAll: () => Promise<void>;
  loading: boolean;
}

export function ClaimPanel({ totalClaimable, stakeClaimable, gauges, claimAll, loading }: ClaimPanelProps) {

  const hasBreakdown = stakeClaimable > 0 || gauges.some((g) => g.claimableRise > 0);

  return (
    <Card goldBorder className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-[#94A3B8]">Total Claimable</p>
          <p className="mt-1 text-5xl font-semibold tabular-nums text-[#60A5FA]">{totalClaimable.toFixed(2)}</p>
          <p className="text-base text-[#94A3B8] mt-0.5">RISE</p>
          <p className="text-xs text-[#64748B] mt-1">From staking, borrowing, and LP rewards</p>
        </div>
        <button
          onClick={claimAll}
          disabled={loading || totalClaimable === 0}
          className="w-full sm:w-auto rounded-full bg-[#60A5FA] px-8 py-3.5 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Claiming…" : "Claim All"}
        </button>
      </div>

      {hasBreakdown && (
        <div className="border-t border-[#334155] pt-4 flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-[#94A3B8]">Breakdown</p>
          {stakeClaimable > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#64748B]">Staking</span>
              <span className="font-medium tabular-nums">{stakeClaimable.toFixed(4)} RISE</span>
            </div>
          )}
          {gauges
            .filter((g) => g.claimableRise > 0)
            .map((g) => (
              <div key={g.id} className="flex justify-between text-sm">
                <span className="text-[#64748B]">{g.name}</span>
                <span className="font-medium tabular-nums">{g.claimableRise} RISE</span>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}
