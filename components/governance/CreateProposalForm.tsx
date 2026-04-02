"use client";
import { useState } from "react";
import { SystemProgram } from "@solana/web3.js";
import { useGovernance } from "@/hooks/useGovernance";

export function CreateProposalForm() {
  const { createProposal, loadingProposal, locks, userVerise } = useGovernance();

  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasActiveLock = locks.some((l) => l.expiresAt > new Date());
  const charsLeft = 128 - new TextEncoder().encode(description).length;

  const canSubmit =
    description.trim().length > 0 &&
    charsLeft >= 0 &&
    hasActiveLock &&
    !loadingProposal;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      await createProposal(description.trim(), SystemProgram.programId.toBase58());
      setSuccess(true);
      setDescription("");
    } catch (err: any) {
      setError(err?.message ?? "Transaction failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <div className="flex justify-between mb-1.5">
          <label className="text-sm font-medium text-[#CBD5E1]">Description</label>
          <span className={`text-xs ${charsLeft < 10 ? "text-red-400" : "text-[#64748B]"}`}>
            {charsLeft} chars left
          </span>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the proposal — what should change and why"
          rows={4}
          maxLength={128}
          className="w-full rounded-lg bg-[#0F172A] border border-[#334155] text-[#F1F5F9] text-sm px-3 py-2.5 placeholder-[#475569] resize-none focus:outline-none focus:border-[#60A5FA] transition-colors"
        />
      </div>

      {!hasActiveLock && (
        <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
          You need an active veRISE lock to create proposals.
        </p>
      )}
      {hasActiveLock && (
        <p className="text-xs text-[#64748B]">
          Voting power: <span className="text-[#F1F5F9]">{userVerise.toLocaleString()} veRISE</span>
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
      )}
      {success && (
        <p className="text-xs text-emerald-400 bg-emerald-400/10 rounded-lg px-3 py-2">
          Proposal created successfully.
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-full bg-[#60A5FA] py-2.5 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loadingProposal ? "Submitting…" : "Submit Proposal"}
      </button>
    </form>
  );
}
