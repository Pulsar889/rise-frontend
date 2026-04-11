"use client";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card } from "@/components/ui/Card";
import { StatBox } from "@/components/ui/StatBox";
import { StakeForm } from "@/components/stake/StakeForm";
import { UnstakeForm } from "@/components/stake/UnstakeForm";
import { useStaking } from "@/hooks/useStaking";

function SkeletonBox() {
  return <div className="h-6 w-24 rounded-md bg-[#334155] animate-pulse" />;
}

export default function StakePage() {
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const { data, loading, fetching, fetchError, protocolInitialized, stake, unstake } = useStaking();
  const { connected } = useWallet();

  const isInitialLoad = fetching && protocolInitialized === null;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-8 sm:mb-10">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#F1F5F9]">Stake</h1>
        <p className="mt-1 text-[#94A3B8]">Stake SOL to receive riseSOL and earn protocol yield</p>
      </div>

      {/* Protocol not initialized */}
      {!isInitialLoad && protocolInitialized === false && (
        <div className="mb-6 rounded-xl border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-400">
          Protocol not initialized. Run <code className="font-mono">anchor test</code> against the local validator first.
        </div>
      )}

      {/* Wallet not connected hint */}
      {!connected && protocolInitialized !== false && (
        <div className="mb-6 rounded-xl border border-[#334155] bg-[#1E293B] px-4 py-3 text-sm text-[#94A3B8]">
          Connect your wallet to see your balances and stake.
        </div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div className="mb-6 rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400 break-all">
          {fetchError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 mb-6 sm:mb-8">
        <Card>
          <StatBox
            label="APY"
            value={isInitialLoad ? <SkeletonBox /> : data.apy > 0 ? `${data.apy}%` : "—"}
          />
        </Card>
        <Card>
          <StatBox
            label="Exchange Rate"
            value={isInitialLoad ? <SkeletonBox /> : data.exchangeRate.toFixed(4)}
            sub="SOL per riseSOL"
          />
        </Card>
        <Card>
          <StatBox
            label="Total Staked"
            value={
              isInitialLoad
                ? <SkeletonBox />
                : data.totalStaked >= 1000
                  ? `${(data.totalStaked / 1000).toFixed(1)}K SOL`
                  : `${data.totalStaked.toFixed(2)} SOL`
            }
            sub="Across all users"
          />
        </Card>
        <Card>
          <StatBox
            label="My riseSOL"
            value={
              isInitialLoad
                ? <SkeletonBox />
                : connected
                  ? data.riseSolBalance.toFixed(4)
                  : "—"
            }
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Form */}
        <Card padding="lg">
          <div className="flex rounded-xl bg-[#334155] p-1 gap-1 mb-6">
            <button
              onClick={() => setMode("stake")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                mode === "stake" ? "bg-[#0F172A] text-[#F1F5F9] shadow-sm" : "text-[#94A3B8]"
              }`}
            >
              Stake
            </button>
            <button
              onClick={() => setMode("unstake")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                mode === "unstake" ? "bg-[#0F172A] text-[#F1F5F9] shadow-sm" : "text-[#94A3B8]"
              }`}
            >
              Unstake
            </button>
          </div>
          {mode === "stake"
            ? <StakeForm data={data} loading={loading} stake={stake} />
            : <UnstakeForm data={data} loading={loading} unstake={unstake} />
          }
        </Card>

        {/* Info panel */}
        <Card>
          <div className="flex flex-col gap-5">
            <h2 className="font-semibold text-[#F1F5F9]">How it works</h2>
            <ol className="flex flex-col gap-5">
              {[
                {
                  step: "1",
                  title: "Stake SOL",
                  desc: "Deposit SOL into the Rise staking pool and receive riseSOL tokens representing your proportional share of the pool.",
                },
                {
                  step: "2",
                  title: "Earn automatically",
                  desc: "The protocol earns staking rewards from Solana validators. The riseSOL exchange rate appreciates over time — no manual claiming needed.",
                },
                {
                  step: "3",
                  title: "Unstake anytime",
                  desc: "Burn riseSOL to reclaim your SOL plus all accrued yield. Unstaking is subject to the standard Solana unstaking period (~2–3 epochs).",
                },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#60A5FA]/10 text-sm font-semibold text-[#60A5FA]">
                    {step}
                  </span>
                  <div>
                    <p className="font-medium text-[#F1F5F9]">{title}</p>
                    <p className="mt-0.5 text-sm text-[#94A3B8]">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="rounded-xl bg-[#1E293B] border border-[#334155] px-4 py-4">
              <p className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">riseSOL use cases</p>
              <ul className="flex flex-col gap-1.5 text-sm text-[#64748B]">
                <li>→ Repay CDP debt directly (burn riseSOL 1:1 against debt)</li>
                <li>→ Provide liquidity in riseSOL / USDC gauge</li>
                <li>→ Hold and earn yield passively</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
