"use client";
import { Card } from "@/components/ui/Card";
import { useRewards } from "@/hooks/useRewards";

export function ClaimPanel() {
  const { totalClaimable, gauges, claimAll, loading } = useRewards();

  return (
    <Card goldBorder className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-[#94A3B8]">Total Claimable</p>
          <p className="mt-1 text-5xl font-semibold tabular-nums text-[#60A5FA]">{totalClaimable}</p>
          <p className="text-base text-[#94A3B8] mt-0.5">RISE</p>
        </div>
        <button
          onClick={claimAll}
          disabled={loading || totalClaimable === 0}
          className="w-full sm:w-auto rounded-full bg-[#60A5FA] px-8 py-3.5 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Claiming…" : "Claim All"}
        </button>
      </div>

      {gauges.some((g) => g.claimableRise > 0) && (
        <div className="border-t border-[#334155] pt-4 flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-[#94A3B8]">Breakdown</p>
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
