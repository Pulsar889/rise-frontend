"use client";
import { Card } from "@/components/ui/Card";
import { StatBox } from "@/components/ui/StatBox";
import { GaugeCard } from "@/components/rewards/GaugeCard";
import { ClaimPanel } from "@/components/rewards/ClaimPanel";
import { useRewards } from "@/hooks/useRewards";

export default function RewardsPage() {
  const { gauges, totalWeeklyEmissions, fetchError, fetching, totalClaimable, stakeClaimable, claimAll, loading } = useRewards();

  const totalTvl   = gauges.reduce((s, g) => s + g.tvl, 0);
  const myDeposits = gauges.reduce((s, g) => s + g.myDeposit, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-8 sm:mb-10">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#F1F5F9]">Rewards</h1>
        <p className="mt-1 text-[#94A3B8]">
          Earn RISE by staking, borrowing, and providing liquidity
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 mb-6 sm:mb-8">
        <Card>
          <StatBox label="Total TVL" value={`$${(totalTvl / 1_000_000).toFixed(1)}M`} sub="Across all users" />
        </Card>

        <Card>
          <StatBox
            label="My Deposits"
            value={myDeposits > 0 ? `$${myDeposits.toLocaleString()}` : "—"}
            sub={myDeposits > 0 ? `${((myDeposits / totalTvl) * 100).toFixed(3)}% of TVL` : undefined}
          />
        </Card>
        <Card>
          <StatBox
            label="Weekly Emissions"
            value={totalWeeklyEmissions > 0 ? `${(totalWeeklyEmissions / 1000).toFixed(0)}K` : "—"}
            sub="RISE / week (all sources)"
          />
        </Card>
      </div>

      {fetchError && (
        <div className="mb-6 rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400 break-all">
          {fetchError}
        </div>
      )}

      {/* Claim panel */}
      <div className="mb-8">
        <ClaimPanel
          totalClaimable={totalClaimable}
          stakeClaimable={stakeClaimable}
          gauges={gauges}
          claimAll={claimAll}
          loading={loading}
        />
      </div>

      {/* Gauge list */}
      <h2 className="font-semibold text-[#F1F5F9] mb-4">LP Gauges ({gauges.length})</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gauges.map((gauge) => (
          <GaugeCard key={gauge.id} gauge={gauge} />
        ))}
      </div>
    </div>
  );
}
