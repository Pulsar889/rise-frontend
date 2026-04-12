"use client";
import { Card } from "@/components/ui/Card";
import { StatBox } from "@/components/ui/StatBox";
import { LockForm } from "@/components/governance/LockForm";
import { LockCard } from "@/components/governance/LockCard";
import { ProposalCard } from "@/components/governance/ProposalCard";
import { GaugeVote } from "@/components/governance/GaugeVote";
import { CreateProposalForm } from "@/components/governance/CreateProposalForm";
import { useGovernance } from "@/hooks/useGovernance";
import { useWallet } from "@solana/wallet-adapter-react";

export default function GovernancePage() {
  const { publicKey } = useWallet();
  const connected = !!publicKey;
  const {
    veRiseBalance, totalLockedRise, locks, claimableRevenue, proposals,
    vote, claimRevenue, unlockRise, loadingUnlock, loadingVote, loadingClaim,
    lockRise, loadingLock, riseBalance,
    gauges, setGaugeWeights, loadingGauge,
    createProposal, loadingProposal, userVerise,
  } = useGovernance();

  const activeProposals = proposals.filter((p) => p.status === "active");
  const pastProposals   = proposals.filter((p) => p.status !== "active");

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-8 sm:mb-10">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#F1F5F9]">Governance</h1>
        <p className="mt-1 text-[#94A3B8]">
          Lock RISE to earn veRISE voting power, vote on proposals, and claim your revenue share
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 mb-6 sm:mb-8">
        <Card>
          <StatBox label="veRISE Balance" value={connected && veRiseBalance > 0 ? veRiseBalance.toLocaleString() : "—"} sub="Total voting power" />
        </Card>
        <Card>
          <StatBox label="Total Locked RISE" value={connected && totalLockedRise > 0 ? totalLockedRise.toLocaleString() : "—"} sub={connected && locks.length > 0 ? `${locks.length} position${locks.length !== 1 ? "s" : ""}` : undefined} />
        </Card>
        <Card>
          <div className="flex flex-col gap-3 h-full justify-between">
            <StatBox label="Revenue Share" value={connected && claimableRevenue > 0 ? `${claimableRevenue} SOL` : "—"} sub="Claimable" />
            <button
              onClick={claimRevenue}
              disabled={loadingClaim || claimableRevenue === 0}
              className="w-full rounded-full bg-[#60A5FA] py-2.5 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loadingClaim ? "Claiming…" : "Claim SOL"}
            </button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: Lock form + My Positions + Gauge voting */}
        <div className="flex flex-col gap-6">
          <Card padding="lg">
            <h2 className="font-semibold text-[#F1F5F9] mb-5">Lock RISE</h2>
            <LockForm lockRise={lockRise} loading={loadingLock} riseBalance={riseBalance} />
          </Card>

          {locks.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="font-semibold text-[#F1F5F9]">My Lock Positions ({locks.length})</h2>
              {locks.map((lock) => (
                <LockCard key={lock.id} lock={lock} onUnlock={unlockRise} loading={loadingUnlock === lock.id} />
              ))}
            </div>
          )}

          <GaugeVote gauges={gauges} locks={locks} setGaugeWeights={setGaugeWeights} loading={loadingGauge} />
        </div>

        {/* Right column: Proposals */}
        <div className="md:col-span-2 flex flex-col gap-6">
          <Card padding="lg">
            <h2 className="font-semibold text-[#F1F5F9] mb-5">Create Proposal</h2>
            <CreateProposalForm createProposal={createProposal} loadingProposal={loadingProposal} locks={locks} userVerise={userVerise} />
          </Card>

          {activeProposals.length > 0 && (
            <div>
              <h2 className="font-semibold text-[#F1F5F9] mb-3">Active Proposals ({activeProposals.length})</h2>
              <div className="flex flex-col gap-3">
                {activeProposals.map((p) => (
                  <ProposalCard key={p.id} proposal={p} vote={vote} loading={loadingVote === p.id} />
                ))}
              </div>
            </div>
          )}

          {pastProposals.length > 0 && (
            <div>
              <h2 className="font-semibold text-[#F1F5F9] mb-3">Past Proposals</h2>
              <div className="flex flex-col gap-3">
                {pastProposals.map((p) => (
                  <ProposalCard key={p.id} proposal={p} vote={vote} loading={loadingVote === p.id} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
