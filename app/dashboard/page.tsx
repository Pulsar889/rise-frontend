"use client";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card } from "@/components/ui/Card";
import { StatBox } from "@/components/ui/StatBox";
import { HealthBar } from "@/components/ui/HealthBar";
import { useStaking } from "@/hooks/useStaking";
import { useCdp } from "@/hooks/useCdp";
import { useGovernance } from "@/hooks/useGovernance";
import { useRewards } from "@/hooks/useRewards";

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const connected = !!publicKey;

  const { data: staking } = useStaking();
  const { positions } = useCdp();
  const { veRiseBalance, claimableRevenue } = useGovernance();
  const { totalClaimable, gauges } = useRewards();

  const totalDebt   = positions.reduce((s, p) => s + p.debtRiseSol, 0);
  const worstHealth = positions.length > 0 ? Math.min(...positions.map((p) => p.healthFactor)) : null;
  const activeGaugeCount = gauges.filter((g) => g.active).length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
      {/* Header */}
      <div className="mb-8 sm:mb-10">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#F1F5F9]">Portfolio</h1>
        <p className="mt-1 text-[#94A3B8]">Your positions across Rise Protocol</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 mb-6 sm:mb-8">
        <Card>
          <StatBox
            label="riseSOL Balance"
            value={connected && staking.riseSolBalance > 0 ? staking.riseSolBalance.toFixed(2) : "—"}
            sub={connected && staking.riseSolBalance > 0 ? `≈ ${staking.myStakedSol.toFixed(2)} SOL` : undefined}
          />
        </Card>
        <Card>
          <StatBox
            label="Total Debt"
            value={connected && totalDebt > 0 ? `${totalDebt.toFixed(4)} riseSOL` : "—"}
            sub={connected && positions.length > 0 ? `${positions.length} position${positions.length !== 1 ? "s" : ""}` : undefined}
          />
        </Card>
        <Card>
          <StatBox
            label="veRISE Power"
            value={connected && veRiseBalance > 0 ? veRiseBalance.toLocaleString() : "—"}
            sub="Voting balance"
          />
        </Card>
        <Card>
          <StatBox
            label="Claimable"
            value={connected && totalClaimable > 0 ? `${totalClaimable.toFixed(2)} RISE` : "—"}
            sub={connected && claimableRevenue > 0 ? `+ ${claimableRevenue.toFixed(4)} SOL revenue` : undefined}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Staking */}
        <Card>
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[#F1F5F9]">Staking</h2>
              <Link href="/stake" className="text-sm text-[#60A5FA] hover:text-[#2563EB] font-medium">
                Manage →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <StatBox label="Exchange Rate" value={staking.exchangeRate.toFixed(4)} sub="SOL per riseSOL" />
              <StatBox label="APY" value={staking.apy > 0 ? `${staking.apy}%` : "—"} sub="Current rate" accent />
            </div>
            <div className="rounded-xl bg-[#1E293B] border border-[#334155] px-4 py-3 flex justify-between text-sm">
              <span className="text-[#94A3B8]">Protocol TVL</span>
              <span className="font-medium text-[#F1F5F9]">{staking.totalStaked.toLocaleString()} SOL</span>
            </div>
          </div>
        </Card>

        {/* CDP positions */}
        <Card>
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[#F1F5F9]">Borrow Positions</h2>
              <Link href="/borrow" className="text-sm text-[#60A5FA] hover:text-[#2563EB] font-medium">
                Manage →
              </Link>
            </div>

            {!connected ? (
              <div className="rounded-xl bg-[#1E293B] border border-dashed border-[#334155] py-8 text-center">
                <p className="text-sm text-[#94A3B8]">Connect wallet to view positions</p>
              </div>
            ) : positions.length === 0 ? (
              <div className="rounded-xl bg-[#1E293B] border border-dashed border-[#334155] py-8 text-center">
                <p className="text-sm text-[#94A3B8]">No open positions</p>
                <Link href="/borrow" className="mt-2 inline-block text-sm text-[#60A5FA] font-medium">
                  Open one →
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {positions.map((p) => {
                  const hf = p.healthFactor;
                  const hfColor = hf >= 1.5 ? "text-emerald-400" : hf >= 1.2 ? "text-amber-400" : "text-red-400";
                  return (
                  <div
                    key={p.id}
                    className="rounded-xl bg-[#1E293B] border border-[#334155] px-4 py-3 flex flex-col gap-2"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-[#F1F5F9]">
                        {p.collateralToken} → {p.debtRiseSol.toFixed(4)} riseSOL
                      </span>
                      <span className={`font-semibold ${hfColor}`}>HF {hf.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#94A3B8]">
                      <span>${p.collateralValueUsd.toLocaleString()}</span>
                    </div>
                    <HealthBar value={p.healthFactor} />
                  </div>
                  );
                })}
              </div>
            )}

            {worstHealth !== null && worstHealth < 1.3 && (
              <div className="rounded-xl bg-amber-950 border border-amber-800 px-4 py-3">
                <p className="text-sm text-amber-400 font-medium">
                  Warning: a position is approaching liquidation
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Governance */}
        <Card>
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[#F1F5F9]">Governance</h2>
              <Link href="/governance" className="text-sm text-[#60A5FA] hover:text-[#2563EB] font-medium">
                Manage →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <StatBox label="veRISE Balance" value={connected && veRiseBalance > 0 ? veRiseBalance.toLocaleString() : "—"} />
              <StatBox
                label="Revenue Share"
                value={connected && claimableRevenue > 0 ? `${claimableRevenue.toFixed(4)} SOL` : "—"}
                sub="Claimable"
                accent
              />
            </div>
          </div>
        </Card>

        {/* Rewards */}
        <Card>
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[#F1F5F9]">Rewards</h2>
              <Link href="/rewards" className="text-sm text-[#60A5FA] hover:text-[#2563EB] font-medium">
                Claim →
              </Link>
            </div>
            <div className="rounded-xl bg-[#1E293B] border border-[#334155] px-4 py-4">
              <p className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">Claimable RISE</p>
              <p className="text-4xl font-semibold text-[#60A5FA] tabular-nums">
                {connected && totalClaimable > 0 ? totalClaimable.toFixed(2) : "—"}
              </p>
              <p className="text-sm text-[#94A3B8] mt-1">
                from {activeGaugeCount} active gauge{activeGaugeCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
