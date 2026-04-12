"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Proposal } from "@/hooks/useGovernance";

interface ProposalCardProps {
  proposal: Proposal;
  vote: (proposalId: string, support: boolean) => Promise<void>;
  loading: boolean;
}

function timeLabel(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  return days > 0 ? `${days}d ${hours}h remaining` : `${hours}h remaining`;
}

const STATUS_STYLES: Record<string, string> = {
  active:  "bg-emerald-950 text-emerald-400",
  passed:  "bg-blue-950 text-blue-400",
  failed:  "bg-red-950 text-red-400",
  pending: "bg-amber-950 text-amber-400",
};

export function ProposalCard({ proposal, vote, loading }: ProposalCardProps) {
  const [voteSuccess, setVoteSuccess] = useState<"for" | "against" | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  async function handleVote(support: boolean) {
    setVoteError(null);
    try {
      await vote(proposal.id, support);
      setVoteSuccess(support ? "for" : "against");
      setTimeout(() => setVoteSuccess(null), 4000);
    } catch (err: unknown) {
      setVoteError(err instanceof Error ? err.message : "Vote failed");
    }
  }

  const forPct     = proposal.totalVotes > 0 ? (proposal.votesFor / proposal.totalVotes) * 100 : 0;
  const againstPct = 100 - forPct;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-[#F1F5F9] leading-snug">{proposal.title}</h3>
            <p className="mt-1 text-sm text-[#94A3B8] line-clamp-2">{proposal.description}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[proposal.status]}`}>
            {proposal.status}
          </span>
        </div>

        {/* Vote bar */}
        <div>
          <div className="flex justify-between text-xs text-[#94A3B8] mb-1.5">
            <span>For {forPct.toFixed(1)}%</span>
            <span>Against {againstPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#334155] overflow-hidden flex">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${forPct}%` }} />
            <div className="h-full bg-red-400 transition-all"     style={{ width: `${againstPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-[#94A3B8] mt-1.5">
            <span>{(proposal.votesFor / 1_000_000).toFixed(2)}M veRISE</span>
            <span>{timeLabel(proposal.endsAt)}</span>
          </div>
        </div>

        {/* Vote buttons (active proposals only) */}
        {proposal.status === "active" && (
          <div className="flex flex-col gap-2">
            {voteSuccess && (
              <p className="text-sm font-medium text-emerald-400 text-center">
                Vote cast {voteSuccess === "for" ? "For" : "Against"}!
              </p>
            )}
            {voteError && (
              <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2 break-all">{voteError}</p>
            )}
            {!voteSuccess && proposal.myVote && (
              <p className="text-xs text-[#94A3B8] text-center">
                You voted <span className={`font-semibold ${proposal.myVote === "for" ? "text-emerald-400" : "text-red-400"}`}>
                  {proposal.myVote === "for" ? "For" : "Against"}
                </span>
              </p>
            )}
            {!proposal.myVote && (
              <div className="flex gap-3">
                <button
                  onClick={() => handleVote(true)}
                  disabled={loading}
                  className="flex-1 rounded-full py-2.5 text-sm font-medium transition-colors bg-emerald-950 text-emerald-400 hover:bg-emerald-900 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Vote For
                </button>
                <button
                  onClick={() => handleVote(false)}
                  disabled={loading}
                  className="flex-1 rounded-full py-2.5 text-sm font-medium transition-colors bg-red-950 text-red-400 hover:bg-red-900 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Vote Against
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
