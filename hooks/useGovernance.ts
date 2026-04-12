"use client";
import { useState, useCallback, useEffect } from "react";
import { useWallet, useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { getProvider, getGovernanceProgram, getRewardsProgram } from "@/lib/programs";
import { RISE_MINT } from "@/lib/constants";
import {
  deriveGovernanceConfig,
  deriveRiseVaultGov,
  deriveVeLock,
  deriveGaugeVotePda,
  deriveProposal,
  deriveVoteRecord,
  deriveProtocolTreasury,
  deriveRewardsConfig,
  STAKING_PROGRAM_ID,
} from "@/lib/pdas";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// 1 week in slots, matching GovernanceConfig::SLOTS_PER_WEEK on-chain
const SLOTS_PER_WEEK = 604_800;
// Approximate ms between slots on Solana (used only for Date estimation)
const MS_PER_SLOT = 400;
// RISE token has 6 decimals (NOT 9 like SOL)
const RISE_SCALE = 1_000_000;

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface VeNft {
  id: string;                   // VeLock PDA address (base58)
  nonce: number;
  lockNumber: number;           // sequential NFT display number ("veRISE Lock #N")
  lockedRise: number;           // RISE locked, in human units (/ 1e9)
  veRisePower: number;          // current time-decayed veRISE, in human units (/ 1e9)
  lockWeeks: number;            // approximate original lock duration in weeks
  lockStartSlot: number;
  lockEndSlot: number;
  expiresAt: Date;              // estimated from slots + current time
  nftMint: string;
  lastRevenueIndex: bigint;     // u128 raw for claimable computation
  totalRevenueClaimed: number;  // SOL claimed across this lock's lifetime
}

export interface Proposal {
  id: string;         // Proposal PDA address (base58) — passed to vote()
  title: string;      // first 70 chars of description
  description: string;
  status: "active" | "passed" | "failed" | "pending";
  votesFor: number;     // veRISE human units (/ 1e9) — ProposalCard divides by 1_000_000 for "M" display
  votesAgainst: number;
  totalVotes: number;
  endsAt: Date;
  myVote?: "for" | "against";
}

export interface GaugeAllocationEntry {
  pool: string;       // pool PublicKey base58
  weightBps: number;  // 0–10000
}

export interface GaugeVoteData {
  epoch: number;
  gauges: GaugeAllocationEntry[];
}

export interface Gauge {
  id: string;       // gauge PDA base58
  pool: string;     // pool pubkey base58 — used when submitting gauge votes
  name: string;
  weight: number;   // protocol weight % (from on-chain weightBps)
  myWeight: number; // user's last submitted weight %
}

// Mirrors placeholderPool() in useRewards — seed padded to 32 bytes
function placeholderPool(seed: string): string {
  const buf = Buffer.alloc(32, 0);
  Buffer.from(seed).copy(buf);
  return Keypair.fromSeed(buf).publicKey.toBase58();
}

const GAUGE_NAMES: Record<string, string> = {
  [placeholderPool("rise-pool-risesol-sol")]:  "riseSOL / SOL",
  [placeholderPool("rise-pool-risesol-usdc")]: "riseSOL / USDC",
  [placeholderPool("rise-pool-rise-sol")]:     "RISE / SOL",
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGovernance() {
  const [locks, setLocks] = useState<VeNft[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [gaugeVote, setGaugeVote] = useState<GaugeVoteData | null>(null);
  const [gauges, setGauges] = useState<Gauge[]>([]);
  const [totalVerise, setTotalVerise] = useState(0);
  const [claimableRevenue, setClaimableRevenue] = useState(0);

  // Track highest-seen nonce so new locks always get a fresh slot
  const [nextLockNonce, setNextLockNonce] = useState(0);

  const [riseBalance, setRiseBalance] = useState(0);

  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadingLock, setLoadingLock] = useState(false);
  const [loadingUnlock, setLoadingUnlock] = useState<string | null>(null);
  const [loadingVote, setLoadingVote] = useState<string | null>(null);
  const [loadingClaim, setLoadingClaim] = useState(false);
  const [loadingGauge, setLoadingGauge] = useState(false);
  const [loadingProposal, setLoadingProposal] = useState(false);

  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  // Derived values kept for backward compat with governance page + dashboard
  const veRiseBalance   = locks.reduce((s, l) => s + l.veRisePower, 0);
  const userVerise      = veRiseBalance;
  const totalLockedRise = locks.reduce((s, l) => s + l.lockedRise, 0);

  // ── On-chain reads ──────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      // Use a dummy read wallet so public data (proposals, config) loads before connecting
      const readWallet: AnchorWallet = wallet ?? {
        publicKey: Keypair.generate().publicKey,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      };
      const provider = getProvider(readWallet);
      const gov = getGovernanceProgram(provider);

      const currentSlot = await connection.getSlot();
      const nowMs = Date.now();

      // Estimate a wall-clock Date for an on-chain slot
      function slotToDate(slot: number): Date {
        return new Date(nowMs + (slot - currentSlot) * MS_PER_SLOT);
      }

      // ── GovernanceConfig ────────────────────────────────────────────────────
      const configPda  = deriveGovernanceConfig();
      const configInfo = await connection.getAccountInfo(configPda);
      if (!configInfo) {
        // Governance program not yet initialized on this validator
        setLocks([]);
        setProposals([]);
        setTotalVerise(0);
        setClaimableRevenue(0);
        return;
      }

      const config        = await (gov.account as any)["governanceConfig"].fetch(configPda);
      const totalVeriseBig = BigInt(config.totalVerise.toString());
      // Human-readable veRISE: RISE has 6 decimals
      const totalVeriseDisplay = Number((totalVeriseBig * 1000n) / BigInt(RISE_SCALE)) / 1000;
      setTotalVerise(totalVeriseDisplay);

      const proposalCount: number = config.proposalCount.toNumber();
      const quorumBps: number     = config.quorumBps;

      // ── VeLock accounts ─────────────────────────────────────────────────────
      // VeLock accounts are closed (space reclaimed) on unlock, so .all() only
      // returns active locks — no need to filter by is_open.
      let mappedLocks: VeNft[] = [];
      let totalClaimableLamports = 0n;

      if (publicKey) {
        // Fetch RISE token balance
        try {
          const riseMint = new PublicKey(RISE_MINT);
          const riseAta = await getAssociatedTokenAddress(riseMint, publicKey);
          const riseAccountInfo = await connection.getTokenAccountBalance(riseAta);
          setRiseBalance(riseAccountInfo.value.uiAmount ?? 0);
        } catch {
          setRiseBalance(0); // ATA doesn't exist yet — user has no RISE
        }

        // Layout: [8 discriminator][32 owner] → memcmp at offset 8
        const rawLocks = await (gov.account as any)["veLock"].all([
          { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
        ]);

        if (rawLocks.length > 0) {
          const maxNonce = Math.max(...rawLocks.map((l: any) => l.account.nonce as number));
          setNextLockNonce((prev) => Math.max(prev, maxNonce + 1));
        }

        // Revenue index: bytes 108–124 of the staking ProtocolTreasury account (u128 LE)
        let revenueIndex = 0n;
        try {
          const treasuryInfo = await connection.getAccountInfo(deriveProtocolTreasury());
          if (treasuryInfo && treasuryInfo.data.length >= 124) {
            const slice = treasuryInfo.data.slice(108, 124);
            for (let i = 15; i >= 0; i--) {
              revenueIndex = revenueIndex * 256n + BigInt(slice[i]);
            }
          }
        } catch {
          // Treasury not yet initialized — claimableRevenue stays 0
        }

        mappedLocks = rawLocks.map((raw: any) => {
          const acc = raw.account;
          const nonce: number      = acc.nonce;
          const lockNumber: number = acc.lockNumber.toNumber();
          const lockStartSlot      = acc.lockStartSlot.toNumber();
          const lockEndSlot        = acc.lockEndSlot.toNumber();
          const veriseAmountRaw    = acc.veriseAmount.toNumber();
          const lastRevIdx         = BigInt(acc.lastRevenueIndex.toString());

          // Mirror on-chain VeLock::current_verise(): linear decay over the lock period
          let currentVeriseRaw = 0;
          if (currentSlot < lockEndSlot) {
            const remaining = lockEndSlot - currentSlot;
            const total     = lockEndSlot - lockStartSlot;
            if (total > 0) currentVeriseRaw = Math.floor(veriseAmountRaw * remaining / total);
          }

          // claimable = (revenueIndex - last_revenue_index) * current_verise / total_verise
          const indexDelta = revenueIndex > lastRevIdx ? revenueIndex - lastRevIdx : 0n;
          if (indexDelta > 0n && totalVeriseBig > 0n) {
            totalClaimableLamports += indexDelta * BigInt(currentVeriseRaw) / totalVeriseBig;
          }

          return {
            id:                  raw.publicKey.toBase58(),
            nonce,
            lockNumber,
            lockedRise:          acc.riseLocked.toNumber() / RISE_SCALE,
            veRisePower:         currentVeriseRaw / RISE_SCALE,
            lockWeeks:           Math.round((lockEndSlot - lockStartSlot) / SLOTS_PER_WEEK),
            lockStartSlot,
            lockEndSlot,
            expiresAt:           slotToDate(lockEndSlot),
            nftMint:             acc.nftMint.toBase58(),
            lastRevenueIndex:    lastRevIdx,
            totalRevenueClaimed: acc.totalRevenueClaimed.toNumber() / LAMPORTS_PER_SOL,
          };
        });

        setClaimableRevenue(Number(totalClaimableLamports) / LAMPORTS_PER_SOL);

        // ── GaugeVote for this user ───────────────────────────────────────────
        try {
          const gvData = await (gov.account as any)["gaugeVote"].fetch(deriveGaugeVotePda(publicKey));
          const gaugeEntries: GaugeAllocationEntry[] = (gvData.gauges as any[])
            .filter((g: any) => g.weightBps > 0)
            .map((g: any) => ({
              pool:      (g.pool as PublicKey).toBase58(),
              weightBps: g.weightBps as number,
            }));
          setGaugeVote({ epoch: gvData.epoch.toNumber(), gauges: gaugeEntries });
        } catch {
          setGaugeVote(null);
        }
      }

      setLocks(mappedLocks);

      // ── Gauges (from rewards program) ───────────────────────────────────────
      try {
        const rewardsProgram = getRewardsProgram(provider);
        const rewardsConfig = await (rewardsProgram.account as any)["rewardsConfig"].fetch(deriveRewardsConfig());
        const gaugeCount: number = rewardsConfig.gaugeCount.toNumber();
        const rawGauges = ((await (rewardsProgram.account as any)["gauge"].all()) as any[])
          .filter((raw: any) => raw.account.index.toNumber() < gaugeCount);

        // Build user's last submitted weights by pool pubkey
        const myWeightByPool: Record<string, number> = {};
        if (gaugeVote) {
          for (const entry of gaugeVote.gauges) {
            myWeightByPool[entry.pool] = Math.round(entry.weightBps / 100);
          }
        }

        const mappedGauges: Gauge[] = rawGauges
          .sort((a: any, b: any) => a.account.index.toNumber() - b.account.index.toNumber())
          .map((raw: any) => {
            const index: number = raw.account.index.toNumber();
            const pool = (raw.account.pool as PublicKey).toBase58();
            const weightBps: number = raw.account.weightBps;
            return {
              id:       raw.publicKey.toBase58(),
              pool,
              name:     GAUGE_NAMES[pool] ?? `Gauge #${index}`,
              weight:   Math.round(weightBps / 100),
              myWeight: myWeightByPool[pool] ?? 0,
            };
          });
        setGauges(mappedGauges);
      } catch {
        // Rewards program not initialized — leave gauges empty
      }

      // ── Proposals ───────────────────────────────────────────────────────────
      if (proposalCount === 0) {
        setProposals([]);
        return;
      }

      // VoteRecord layout: [8 discriminator][32 voter] → build map proposalPDA → vote_for
      const voteRecordMap = new Map<string, boolean>();
      if (publicKey) {
        try {
          const voteRecords = await (gov.account as any)["voteRecord"].all([
            { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
          ]);
          for (const vr of voteRecords) {
            voteRecordMap.set((vr.account.proposal as PublicKey).toBase58(), vr.account.voteFor as boolean);
          }
        } catch {
          // No vote records yet
        }
      }

      // Fetch proposals 0 … proposalCount-1 in parallel
      const rawProposals = await Promise.all(
        Array.from({ length: proposalCount }, (_, i) => deriveProposal(i)).map(async (pda) => {
          try {
            const data = await (gov.account as any)["proposal"].fetch(pda);
            return { pda, data };
          } catch {
            return null;
          }
        })
      );

      const mappedProposals: Proposal[] = rawProposals
        .filter((p): p is { pda: PublicKey; data: any } => p !== null)
        .map(({ pda, data }) => {
          // Decode [u8; 128] description, strip trailing null bytes
          const description = Buffer.from(data.description as number[])
            .toString("utf8")
            .replace(/\0+$/, "")
            .trim();
          const title = description.length > 70 ? description.slice(0, 67) + "…" : description;

          const votingEndSlot: number = data.votingEndSlot.toNumber();
          const isActive = currentSlot <= votingEndSlot && !(data.executed as boolean);

          // votes_for / votes_against are u128 (BN); convert via BigInt then divide by 1e9
          const votesForBig     = BigInt(data.votesFor.toString());
          const votesAgainstBig = BigInt(data.votesAgainst.toString());
          const totalVotesBig   = votesForBig + votesAgainstBig;

          // Mirror Proposal::is_passed(): quorum check + majority
          const quorum   = totalVeriseBig * BigInt(quorumBps) / 10_000n;
          const isPassed = totalVotesBig >= quorum && votesForBig > votesAgainstBig;

          let status: Proposal["status"];
          if (data.executed as boolean) {
            status = "passed";
          } else if (isActive) {
            status = "active";
          } else if (isPassed) {
            status = "pending"; // passed but awaiting execute_proposal timelock
          } else {
            status = "failed";
          }

          const pdaStr    = pda.toBase58();
          const myVoteFor = voteRecordMap.get(pdaStr);

          return {
            id:          pdaStr,
            title,
            description,
            status,
            votesFor:     Number(votesForBig)     / RISE_SCALE,
            votesAgainst: Number(votesAgainstBig) / RISE_SCALE,
            totalVotes:   Number(totalVotesBig)   / RISE_SCALE,
            endsAt:      slotToDate(votingEndSlot),
            myVote:      myVoteFor !== undefined ? (myVoteFor ? "for" : "against") : undefined,
          };
        });

      setProposals(mappedProposals);
    } catch (err: any) {
      setFetchError(err?.message ?? "Failed to load governance data");
    } finally {
      setFetching(false);
    }
  }, [wallet, publicKey, connection]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Transactions ────────────────────────────────────────────────────────────

  /**
   * Locks RISE tokens and mints a veRISE Lock NFT.
   * @param amount       RISE tokens in human units (multiplied by 1e9 internally)
   * @param durationDays lock duration in days (LockForm passes weeksNum * 7)
   */
  const lockRise = useCallback(async (amount: number, durationDays: number) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    setLoadingLock(true);
    try {
      const provider  = getProvider(wallet);
      const gov       = getGovernanceProgram(provider);
      const configPda = deriveGovernanceConfig();
      const config    = await (gov.account as any)["governanceConfig"].fetch(configPda);
      const riseMint  = config.riseMint as PublicKey;

      // Convert days → slots: SLOTS_PER_WEEK / 7 days
      const lockSlots = Math.floor(durationDays * SLOTS_PER_WEEK / 7);
      const nonce     = nextLockNonce;

      const userRiseAccount = await getAssociatedTokenAddress(riseMint, publicKey);

      // Each lock gets a fresh NFT mint keypair (0-decimal, supply = 1)
      const nftMintKp  = Keypair.generate();
      const userNftAta = await getAssociatedTokenAddress(nftMintKp.publicKey, publicKey);

      // Metaplex metadata PDA: seeds = ["metadata", TOKEN_METADATA_PROGRAM_ID, nft_mint]
      const [nftMetadata] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          nftMintKp.publicKey.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      );

      try {
        await gov.methods
          .lockRise(new BN(Math.round(amount * RISE_SCALE)), new BN(lockSlots), nonce)
          .accounts({
            user:                   publicKey,
            config:                 configPda,
            lock:                   deriveVeLock(publicKey, nonce),
            userRiseAccount,
            riseVault:              deriveRiseVaultGov(),
            nftMint:                nftMintKp.publicKey,
            userNftAta,
            nftMetadata,
            tokenMetadataProgram:   TOKEN_METADATA_PROGRAM_ID,
            treasury:               deriveProtocolTreasury(),
            tokenProgram:           TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram:          SystemProgram.programId,
            rent:                   SYSVAR_RENT_PUBKEY,
          })
          .signers([nftMintKp])
          .rpc();
      } catch (err: unknown) {
        // "already processed" means the tx landed on the first attempt but the
        // SDK got a duplicate-submission error when retrying confirmation.
        // Treat it as success and let refresh() pick up the new lock.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("already been processed")) throw err;
      }

      setNextLockNonce((n) => n + 1);
      await refresh();
    } finally {
      setLoadingLock(false);
    }
  }, [wallet, publicKey, nextLockNonce, refresh]);

  /**
   * Burns the veRISE NFT and returns locked RISE once the lock has expired.
   * @param lockId  VeLock PDA address (the lock.id from VeNft)
   */
  const unlockRise = useCallback(async (lockId: string) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    const lock = locks.find((l) => l.id === lockId);
    if (!lock) throw new Error("Lock not found — try refreshing");

    setLoadingUnlock(lockId);
    try {
      const provider  = getProvider(wallet);
      const gov       = getGovernanceProgram(provider);
      const configPda = deriveGovernanceConfig();
      const config    = await (gov.account as any)["governanceConfig"].fetch(configPda);
      const riseMint  = config.riseMint as PublicKey;
      const nftMint   = new PublicKey(lock.nftMint);

      await gov.methods
        .unlockRise()
        .accounts({
          user:            publicKey,
          config:          configPda,
          lock:            new PublicKey(lockId),
          userRiseAccount: await getAssociatedTokenAddress(riseMint, publicKey),
          riseVault:       deriveRiseVaultGov(),
          nftMint,
          userNftAta:      await getAssociatedTokenAddress(nftMint, publicKey),
          tokenProgram:    TOKEN_PROGRAM_ID,
        })
        .rpc();

      await refresh();
    } finally {
      setLoadingUnlock(null);
    }
  }, [wallet, publicKey, locks, refresh]);

  /**
   * Extends an active lock by additional slots.
   * @param lockId          VeLock PDA address
   * @param additionalSlots slots to add onto the current lock_end_slot
   */
  const extendLock = useCallback(async (lockId: string, additionalSlots: number) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    if (!locks.find((l) => l.id === lockId)) throw new Error("Lock not found");

    const provider = getProvider(wallet);
    const gov      = getGovernanceProgram(provider);

    await gov.methods
      .extendLock(new BN(additionalSlots))
      .accounts({
        user:   publicKey,
        config: deriveGovernanceConfig(),
        lock:   new PublicKey(lockId),
      })
      .rpc();

    await refresh();
  }, [wallet, publicKey, locks, refresh]);

  /**
   * Casts a vote using the first active (non-expired) lock.
   * @param proposalId  Proposal PDA address (proposal.id from the Proposal interface)
   * @param support     true = for, false = against
   */
  const vote = useCallback(async (proposalId: string, support: boolean) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");

    const activeLock = locks.find((l) => l.expiresAt > new Date()) ?? locks[0];
    if (!activeLock) throw new Error("No lock found — lock RISE first to vote");

    setLoadingVote(proposalId);
    try {
      const provider    = getProvider(wallet);
      const gov         = getGovernanceProgram(provider);
      const proposalPda = new PublicKey(proposalId);

      await gov.methods
        .castVote(support)
        .accounts({
          voter:         publicKey,
          config:        deriveGovernanceConfig(),
          lock:          deriveVeLock(publicKey, activeLock.nonce),
          proposal:      proposalPda,
          voteRecord:    deriveVoteRecord(deriveVeLock(publicKey, activeLock.nonce), proposalPda),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Optimistically update myVote so the UI responds immediately
      setProposals((prev) =>
        prev.map((p) => p.id === proposalId ? { ...p, myVote: support ? "for" : "against" } : p)
      );

      // Refresh in background — don't await so errors don't swallow the success
      refresh().catch(() => {});
    } finally {
      setLoadingVote(null);
    }
  }, [wallet, publicKey, locks, refresh]);

  /**
   * Claims accrued SOL revenue share for every active lock.
   * Individual lock failures (nothing to claim yet) are silently skipped.
   */
  const claimRevenue = useCallback(async () => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    setLoadingClaim(true);
    try {
      const provider   = getProvider(wallet);
      const gov        = getGovernanceProgram(provider);
      const configPda  = deriveGovernanceConfig();
      const treasuryPda = deriveProtocolTreasury();

      const [veriseVaultPda, tvBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("verise_vault")],
        STAKING_PROGRAM_ID
      );

      for (const lock of locks) {
        if (lock.veRisePower <= 0) continue;
        try {
          await gov.methods
            .claimRevenueShare(tvBump)
            .accounts({
              user:         publicKey,
              config:       configPda,
              lock:         deriveVeLock(publicKey, lock.nonce),
              treasury:     treasuryPda,
              veriseVault:  veriseVaultPda,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
        } catch {
          // Lock has no claimable revenue yet — continue to next
        }
      }

      await refresh();
    } finally {
      setLoadingClaim(false);
    }
  }, [wallet, publicKey, locks, refresh]);

  /**
   * Submits gauge weight allocations using the first active lock.
   * @param weights  { gaugeId: percentage } from GaugeVote component — must sum to 100
   */
  const setGaugeWeights = useCallback(async (weights: Record<string, number>) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");

    const activeLock = locks.find((l) => l.expiresAt > new Date()) ?? locks[0];
    if (!activeLock) throw new Error("No active lock — lock RISE first to vote on gauges");

    setLoadingGauge(true);
    try {
      const provider = getProvider(wallet);
      const gov      = getGovernanceProgram(provider);

      // Normalise percentages → bps; make last entry absorb any rounding residual
      const entries  = Object.entries(weights).filter(([, pct]) => pct > 0);
      const totalPct = entries.reduce((s, [, pct]) => s + pct, 0);
      let bpsSum = 0;
      const allocations = entries.map(([gaugeId, pct], i) => {
        const bps = i === entries.length - 1
          ? 10_000 - bpsSum
          : Math.round((pct / totalPct) * 10_000);
        bpsSum += bps;
        // gaugeId is either a gauge PDA (from on-chain) or legacy static id
        const gauge = gauges.find((g) => g.id === gaugeId);
        return {
          pool:      new PublicKey(gauge?.pool ?? SystemProgram.programId.toBase58()),
          weightBps: bps,
        };
      });

      await gov.methods
        .voteGauge(allocations)
        .accounts({
          user:          publicKey,
          config:        deriveGovernanceConfig(),
          lock:          deriveVeLock(publicKey, activeLock.nonce),
          gaugeVote:     deriveGaugeVotePda(publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await refresh();
    } finally {
      setLoadingGauge(false);
    }
  }, [wallet, publicKey, locks, gauges, refresh]);

  /**
   * Creates an on-chain governance proposal.
   * @param description    Text description (max 128 bytes UTF-8)
   * @param targetProgram  Program pubkey the proposal targets (use SystemProgram if general)
   */
  const createProposal = useCallback(async (description: string, targetProgram: string) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    const activeLock = locks.find((l) => l.expiresAt > new Date()) ?? locks[0];
    if (!activeLock) throw new Error("You must lock RISE before creating a proposal");

    setLoadingProposal(true);
    try {
      const provider  = getProvider(wallet);
      const gov       = getGovernanceProgram(provider);
      const configPda = deriveGovernanceConfig();
      const config    = await (gov.account as any)["governanceConfig"].fetch(configPda);

      // Encode description as [u8; 128] — pad with nulls, truncate if too long
      const encoded = Buffer.alloc(128, 0);
      Buffer.from(description.slice(0, 128), "utf8").copy(encoded);
      const descBytes = Array.from(encoded) as number[];

      const proposalPda = deriveProposal(config.proposalCount.toNumber());
      const target = new PublicKey(targetProgram);

      await gov.methods
        .createProposal(descBytes, target)
        .accounts({
          proposer:      publicKey,
          config:        configPda,
          lock:          deriveVeLock(publicKey, activeLock.nonce),
          proposal:      proposalPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Optimistically prepend the new proposal so it appears immediately
      const votingPeriodSlots = config.votingPeriodSlots.toNumber();
      const endsAt = new Date(Date.now() + votingPeriodSlots * MS_PER_SLOT);
      const optimisticProposal: Proposal = {
        id:           proposalPda.toBase58(),
        title:        description.slice(0, 70),
        description,
        status:       "active",
        votesFor:     0,
        votesAgainst: 0,
        totalVotes:   0,
        endsAt,
        myVote:       undefined,
      };
      setProposals((prev) => [optimisticProposal, ...prev]);

      await refresh();
    } finally {
      setLoadingProposal(false);
    }
  }, [wallet, publicKey, locks, refresh]);

  return {
    // Reads
    riseBalance,
    locks,
    proposals,
    gaugeVote,
    gauges,
    totalVerise,
    userVerise,
    veRiseBalance,      // alias — kept for dashboard + governance page compat
    totalLockedRise,
    claimableRevenue,
    fetching,
    fetchError,
    refresh,
    // Per-operation loading states
    loadingLock,
    loadingUnlock,
    loadingVote,
    loadingClaim,
    loadingGauge,
    loadingProposal,
    // Transactions
    lockRise,
    unlockRise,
    extendLock,
    vote,
    claimRevenue,
    setGaugeWeights,
    createProposal,
  };
}
