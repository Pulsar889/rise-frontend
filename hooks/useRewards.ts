"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useWallet, useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { getProvider, getRewardsProgram, getStakingProgram } from "@/lib/programs";
import {
  deriveRewardsConfig,
  deriveGaugePda,
  deriveUserStake,
  deriveGaugeLpVault,
  deriveRewardsVault,
  deriveStakeRewardsConfig,
  deriveStakeRewardsVault,
  deriveUserStakeRewards,
  deriveGlobalPool,
  deriveBorrowRewardsConfig,
} from "@/lib/pdas";

// reward_per_token precision scale — matches Gauge::REWARD_SCALE on-chain
const REWARD_SCALE = 1_000_000_000_000n; // 1e12

// Mirrors makePlaceholder() in reset_rewards.mjs — seed padded to 32 bytes
function placeholderPool(seed: string): string {
  const buf = Buffer.alloc(32, 0);
  Buffer.from(seed).copy(buf);
  return Keypair.fromSeed(buf).publicKey.toBase58();
}

// Keyed by pool pubkey so gauge names are correct regardless of on-chain index
const GAUGE_META: Record<string, { name: string }> = {
  [placeholderPool("rise-pool-risesol-sol")]:  { name: "riseSOL / SOL"  },
  [placeholderPool("rise-pool-risesol-usdc")]: { name: "riseSOL / USDC" },
  [placeholderPool("rise-pool-rise-sol")]:     { name: "RISE / SOL"     },
};

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface LpGauge {
  id: string;               // Gauge PDA address (base58)
  pool: string;             // Pool pubkey (base58) — needed to derive LP vault PDA
  index: number;
  name: string;             // Display name — "Gauge #N" until pool metadata is available
  weightBps: number;        // Gauge weight in bps (0–10000)
  active: boolean;
  rewardPerToken: bigint;   // u128, scaled by REWARD_SCALE (1e12)
  totalLpDeposited: number; // LP tokens in human units (/ 1e9)
  lastCheckpointEpoch: number;
  totalDistributed: number; // RISE distributed all time, human units
  weeklyEmission: number;   // Estimated RISE per epoch = epochEmissions * weightBps / 10000
  tvl: number;              // totalLpDeposited (proxy; no USD price feed yet)
  lpMint: string | null;    // LP token mint — read from gauge LP vault account if initialized
  // User-specific fields (zero/null when wallet not connected or no stake)
  myDeposit: number;        // User's LP tokens in human units
  claimableRise: number;    // Calculated pending RISE in human units
}

export interface UserStake {
  id: string;             // UserStake PDA address (base58)
  gauge: string;          // Gauge PDA address (base58)
  lpAmount: number;       // LP tokens in human units
  rewardDebt: bigint;     // u128 reward accumulator checkpoint
  pendingRewards: number; // Settled RISE pending claim, human units
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRewards() {
  const [gauges, setGauges] = useState<LpGauge[]>([]);
  const [userStakes, setUserStakes] = useState<UserStake[]>([]);
  const [totalClaimable, setTotalClaimable] = useState(0);
  const [stakeClaimable, setStakeClaimable] = useState(0);
  const [epochEmissions, setEpochEmissions] = useState(0);
  const [totalWeeklyEmissions, setTotalWeeklyEmissions] = useState(0);

  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  // ── On-chain reads ──────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const readWallet: AnchorWallet = wallet ?? {
        publicKey: Keypair.generate().publicKey,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      };
      const provider = getProvider(readWallet);
      const rewards  = getRewardsProgram(provider);

      // ── RewardsConfig ───────────────────────────────────────────────────────
      const configPda  = deriveRewardsConfig();
      const configInfo = await connection.getAccountInfo(configPda);
      if (!configInfo) {
        // Rewards program not yet initialized on this validator
        setGauges([]);
        setUserStakes([]);
        setTotalClaimable(0);
        setEpochEmissions(0);
        return;
      }

      const config            = await (rewards.account as any)["rewardsConfig"].fetch(configPda);
      const epochEmissionsRaw: number = config.epochEmissions.toNumber();
      const currentEpoch: number      = config.currentEpoch.toNumber();
      const riseMint          = config.riseMint as PublicKey;
      setEpochEmissions(epochEmissionsRaw / LAMPORTS_PER_SOL);

      // ── All Gauge accounts — fetched directly by known PDA, no getProgramAccounts ──
      const gaugeCount: number = config.gaugeCount.toNumber();
      const knownPools = Object.keys(GAUGE_META).map(p => new PublicKey(p));
      const gaugePdas  = knownPools.map(pool => deriveGaugePda(pool));
      const gaugeAccountsRaw = await (rewards.account as any)["gauge"].fetchMultiple(gaugePdas);

      // Pair each result with its PDA; filter nulls and orphans (index >= gauge_count)
      const rawGauges = gaugePdas
        .map((pda, i) => ({ publicKey: pda, account: gaugeAccountsRaw[i] }))
        .filter(({ account }) => account !== null && (account as any).index.toNumber() < gaugeCount);

      // ── UserStake accounts — derived directly from (user, gaugePda) ──────────
      const stakeByGauge = new Map<string, any>();
      const mappedStakes: UserStake[] = [];

      if (publicKey) {
        const userStakePdas = rawGauges.map(({ publicKey: gaugePda }) =>
          deriveUserStake(publicKey, gaugePda)
        );
        const userStakeAccounts = await (rewards.account as any)["userStake"].fetchMultiple(userStakePdas);

        rawGauges.forEach(({ publicKey: gaugePda }, i) => {
          const acc = userStakeAccounts[i];
          if (!acc) return;
          const gaugePdaStr = gaugePda.toBase58();
          stakeByGauge.set(gaugePdaStr, acc);
          mappedStakes.push({
            id:             deriveUserStake(publicKey, gaugePda).toBase58(),
            gauge:          gaugePdaStr,
            lpAmount:       (acc as any).lpAmount.toNumber() / LAMPORTS_PER_SOL,
            rewardDebt:     BigInt((acc as any).rewardDebt.toString()),
            pendingRewards: (acc as any).pendingRewards.toNumber() / LAMPORTS_PER_SOL,
          });
        });
      }

      setUserStakes(mappedStakes);

      // ── Batch-fetch all gauge LP vault accounts in one call ─────────────────
      const vaultPdas = rawGauges.map((raw: any) => deriveGaugeLpVault(raw.account.pool as PublicKey));
      const vaultInfos = vaultPdas.length > 0
        ? await connection.getMultipleAccountsInfo(vaultPdas)
        : [];

      // ── Map gauges + compute pending rewards ────────────────────────────────
      let totalClaimableAccum = 0;

      const mappedGauges: LpGauge[] = rawGauges.map(({ publicKey: gaugePda, account: acc }: any, i: number) => {
          const gaugePdaStr    = gaugePda.toBase58();
          const pool           = acc.pool as PublicKey;
          const poolStr        = pool.toBase58();
          const index: number  = acc.index.toNumber();
          const weightBps: number          = acc.weightBps;
          const rewardPerTokenBig          = BigInt(acc.rewardPerToken.toString());
          const totalLpDepositedRaw: number = acc.totalLpDeposited.toNumber();

          const weeklyEmission = epochEmissionsRaw * weightBps / 10_000 / LAMPORTS_PER_SOL;

          // Read LP mint from the pre-fetched vault account info
          let lpMint: string | null = null;
          const vaultInfo = vaultInfos[i];
          if (vaultInfo && vaultInfo.data.length >= 32) {
            lpMint = new PublicKey((vaultInfo.data as Buffer).slice(0, 32)).toBase58();
          }

          let myDeposit     = 0;
          let claimableRise = 0;

          const stake = stakeByGauge.get(gaugePdaStr);
          if (stake) {
            const lpAmountRaw    = BigInt(stake.lpAmount.toString());
            const rewardDebtBig  = BigInt(stake.rewardDebt.toString());
            const pendingRaw     = BigInt(stake.pendingRewards.toString());

            const accumulated  = lpAmountRaw * rewardPerTokenBig / REWARD_SCALE;
            const newlyAccrued = accumulated > rewardDebtBig ? accumulated - rewardDebtBig : 0n;
            const totalRaw     = pendingRaw + newlyAccrued;

            myDeposit     = stake.lpAmount.toNumber() / LAMPORTS_PER_SOL;
            claimableRise = Number(totalRaw) / LAMPORTS_PER_SOL;
            totalClaimableAccum += claimableRise;
          }

          return {
            id:                  gaugePdaStr,
            pool:                poolStr,
            index,
            name:                (GAUGE_META[poolStr] ?? { name: `Gauge #${index}` }).name,
            weightBps,
            active:              acc.active as boolean,
            rewardPerToken:      rewardPerTokenBig,
            totalLpDeposited:    totalLpDepositedRaw / LAMPORTS_PER_SOL,
            lastCheckpointEpoch: acc.lastCheckpointEpoch.toNumber(),
            totalDistributed:    acc.totalDistributed.toNumber() / LAMPORTS_PER_SOL,
            weeklyEmission,
            tvl:                 totalLpDepositedRaw / LAMPORTS_PER_SOL,
            lpMint,
            myDeposit,
            claimableRise,
          };
        });

      // Sort gauges by index for stable ordering
      mappedGauges.sort((a, b) => a.index - b.index);

      setGauges(mappedGauges);

      // ── Staking RISE rewards ──────────────────────────────────────────────
      let stakeClaimableAccum = 0;
      let stakeEmissions = 0;
      if (publicKey) {
        try {
          const staking = getStakingProgram(provider);
          const stakeConfigPda = deriveStakeRewardsConfig();
          const stakeConfigInfo = await connection.getAccountInfo(stakeConfigPda);

          if (stakeConfigInfo) {
            const stakeConfig = await (staking.account as any)["stakeRewardsConfig"].fetch(stakeConfigPda);
            stakeEmissions = stakeConfig.epochEmissions.toNumber() / LAMPORTS_PER_SOL;
            const rewardPerToken: bigint = BigInt(stakeConfig.rewardPerToken.toString());

            const userStakeRewardsPda = deriveUserStakeRewards(publicKey);
            const userStakeInfo = await connection.getAccountInfo(userStakeRewardsPda);

            if (userStakeInfo) {
              const usr = await (staking.account as any)["userStakeRewards"].fetch(userStakeRewardsPda);
              const riseSolAmount: bigint = BigInt(usr.riseSolAmount.toString());
              const rewardDebt: bigint    = BigInt(usr.rewardDebt.toString());
              const pendingRaw: bigint    = BigInt(usr.pendingRewards.toString());

              const accumulated  = riseSolAmount * rewardPerToken / REWARD_SCALE;
              const newlyAccrued = accumulated > rewardDebt ? accumulated - rewardDebt : 0n;
              stakeClaimableAccum = Number(pendingRaw + newlyAccrued) / LAMPORTS_PER_SOL;
            }
          }
        } catch {
          // Stake rewards not yet initialized — skip
        }
      }
      setStakeClaimable(stakeClaimableAccum);
      setTotalClaimable(totalClaimableAccum + stakeClaimableAccum);

      // ── Total protocol weekly emissions (all three sources) ───────────────
      // stakeEmissions already loaded above; just need borrow emissions.
      let borrowEmissions = 0;
      try {
        const cdp = (await import("@/lib/programs")).getCdpProgram(provider);
        const borrowConfigInfo = await connection.getAccountInfo(deriveBorrowRewardsConfig());
        if (borrowConfigInfo) {
          const bc = await (cdp.account as any)["borrowRewardsConfig"].fetch(deriveBorrowRewardsConfig());
          borrowEmissions = bc.epochEmissions.toNumber() / LAMPORTS_PER_SOL;
        }
      } catch { /* not initialized */ }
      setTotalWeeklyEmissions(epochEmissionsRaw / LAMPORTS_PER_SOL + stakeEmissions + borrowEmissions);
    } catch (err: any) {
      setFetchError(err?.message ?? "Failed to load rewards data");
    } finally {
      setFetching(false);
    }
  }, [wallet, publicKey, connection]);

  const refreshDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (refreshDebounce.current) clearTimeout(refreshDebounce.current);
    refreshDebounce.current = setTimeout(() => { refresh(); }, 150);
  }, [refresh]);

  // ── Internal helpers ────────────────────────────────────────────────────────

  /** Look up a gauge from local state by its PDA address. Throws if not found. */
  function requireGauge(gaugeId: string): LpGauge {
    const gauge = gauges.find((g) => g.id === gaugeId);
    if (!gauge) throw new Error("Gauge not found — try refreshing");
    return gauge;
  }

  /** Fetches the RISE mint from RewardsConfig (needed for claim transactions). */
  async function getRiseMint(gov: ReturnType<typeof getRewardsProgram>): Promise<PublicKey> {
    const config = await (gov.account as any)["rewardsConfig"].fetch(deriveRewardsConfig());
    return config.riseMint as PublicKey;
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  /**
   * Deposits LP tokens into a gauge to start earning RISE rewards.
   * @param gaugeId  Gauge PDA address (gauge.id from LpGauge)
   * @param amount   LP tokens in human units (multiplied by 1e9 internally)
   */
  const depositLp = useCallback(async (gaugeId: string, amount: number) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    const gauge = requireGauge(gaugeId);
    if (!gauge.lpMint) throw new Error("LP token mint unknown for this gauge — vault not yet initialized");

    setLoading(true);
    try {
      const provider   = getProvider(wallet);
      const rewards    = getRewardsProgram(provider);
      const pool       = new PublicKey(gauge.pool);
      const gaugePda   = new PublicKey(gaugeId);
      const lpMint     = new PublicKey(gauge.lpMint);

      const userLpAccount = await getAssociatedTokenAddress(lpMint, publicKey);
      const stakePda      = deriveUserStake(publicKey, gaugePda);
      const vaultPda      = deriveGaugeLpVault(pool);

      await rewards.methods
        .depositLp(new BN(amount * LAMPORTS_PER_SOL))
        .accounts({
          user:          publicKey,
          gauge:         gaugePda,
          userStake:     stakePda,
          userLpAccount,
          gaugeLpVault:  vaultPda,
          tokenProgram:  TOKEN_PROGRAM_ID,
          systemProgram: (await import("@solana/web3.js")).SystemProgram.programId,
        })
        .rpc();

      await refresh();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey, gauges, refresh]);

  /**
   * Withdraws LP tokens from a gauge (settles any pending rewards in the process).
   * @param gaugeId  Gauge PDA address
   * @param amount   LP tokens in human units
   */
  const withdrawLp = useCallback(async (gaugeId: string, amount: number) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    const gauge = requireGauge(gaugeId);
    if (!gauge.lpMint) throw new Error("LP token mint unknown for this gauge — vault not yet initialized");

    setLoading(true);
    try {
      const provider  = getProvider(wallet);
      const rewards   = getRewardsProgram(provider);
      const pool      = new PublicKey(gauge.pool);
      const gaugePda  = new PublicKey(gaugeId);
      const lpMint    = new PublicKey(gauge.lpMint);

      const userLpAccount = await getAssociatedTokenAddress(lpMint, publicKey);
      const stakePda      = deriveUserStake(publicKey, gaugePda);

      await rewards.methods
        .withdrawLp(new BN(amount * LAMPORTS_PER_SOL))
        .accounts({
          user:          publicKey,
          gauge:         gaugePda,
          userStake:     stakePda,
          userLpAccount,
          gaugeLpVault:  deriveGaugeLpVault(pool),
          tokenProgram:  TOKEN_PROGRAM_ID,
        })
        .rpc();

      await refresh();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey, gauges, refresh]);

  /**
   * Claims accumulated RISE rewards from a single gauge.
   * @param gaugeId  Gauge PDA address
   */
  const claimRewards = useCallback(async (gaugeId: string) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    requireGauge(gaugeId);

    setLoading(true);
    try {
      const provider  = getProvider(wallet);
      const rewards   = getRewardsProgram(provider);
      const riseMint  = await getRiseMint(rewards);
      const gaugePda  = new PublicKey(gaugeId);

      const userRiseAccount = await getAssociatedTokenAddress(riseMint, publicKey);
      const stakePda        = deriveUserStake(publicKey, gaugePda);

      await rewards.methods
        .claimRewards()
        .accounts({
          user:             publicKey,
          config:           deriveRewardsConfig(),
          gauge:            gaugePda,
          userStake:        stakePda,
          rewardsVault:     deriveRewardsVault(),
          userRiseAccount,
          tokenProgram:     TOKEN_PROGRAM_ID,
        })
        .rpc();

      await refresh();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey, gauges, refresh]);

  /**
   * Claims accumulated RISE staking rewards.
   */
  const claimStakingRewards = useCallback(async () => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");

    const staking = getStakingProgram(getProvider(wallet));
    const stakeConfigPda = deriveStakeRewardsConfig();
    const stakeConfig = await (staking.account as any)["stakeRewardsConfig"].fetch(stakeConfigPda);
    const riseMint: PublicKey = stakeConfig.riseMint as PublicKey;
    const poolPda = deriveGlobalPool();
    const pool = await (staking.account as any)["globalPool"].fetch(poolPda);

    const userRiseSolAccount = await getAssociatedTokenAddress(pool.riseSolMint as PublicKey, publicKey);
    const userRiseAccount    = await getAssociatedTokenAddress(riseMint, publicKey);

    // Create RISE ATA if it doesn't exist yet
    const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
    const riseAtaInfo = await connection.getAccountInfo(userRiseAccount);
    const preIx = riseAtaInfo
      ? []
      : [createAssociatedTokenAccountInstruction(publicKey, userRiseAccount, publicKey, riseMint)];

    await staking.methods
      .claimStakeRewards()
      .accounts({
        user:               publicKey,
        pool:               poolPda,
        stakeRewardsConfig: stakeConfigPda,
        userStakeRewards:   deriveUserStakeRewards(publicKey),
        userRiseSolAccount,
        rewardsVault:       deriveStakeRewardsVault(),
        userRiseAccount,
        tokenProgram:       TOKEN_PROGRAM_ID,
      })
      .preInstructions(preIx)
      .rpc();
  }, [wallet, publicKey, connection]);

  /**
   * Claims RISE rewards from every gauge where the user has a positive claimable balance,
   * plus any accumulated staking RISE rewards.
   * Individual failures are silently skipped.
   */
  const claimAll = useCallback(async () => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");

    const claimable = gauges.filter((g) => g.claimableRise > 0);
    if (claimable.length === 0 && stakeClaimable === 0) return;

    setLoading(true);
    try {
      const provider = getProvider(wallet);
      const rewards  = getRewardsProgram(provider);
      const riseMint = await getRiseMint(rewards);

      const userRiseAccount = await getAssociatedTokenAddress(riseMint, publicKey);
      const configPda       = deriveRewardsConfig();
      const vaultPda        = deriveRewardsVault();

      // Create RISE ATA if it doesn't exist yet
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      const riseAtaInfo = await connection.getAccountInfo(userRiseAccount);
      const createAtaIx = riseAtaInfo
        ? null
        : createAssociatedTokenAccountInstruction(publicKey, userRiseAccount, publicKey, riseMint);

      // Claim LP gauge rewards
      let ataCreated = riseAtaInfo !== null;
      for (const gauge of claimable) {
        const gaugePda = new PublicKey(gauge.id);
        const stakePda = deriveUserStake(publicKey, gaugePda);
        try {
          const preIx = (!ataCreated && createAtaIx) ? [createAtaIx] : [];
          await rewards.methods
            .claimRewards()
            .accounts({
              user:             publicKey,
              config:           configPda,
              gauge:            gaugePda,
              userStake:        stakePda,
              rewardsVault:     vaultPda,
              userRiseAccount,
              tokenProgram:     TOKEN_PROGRAM_ID,
            })
            .preInstructions(preIx)
            .rpc();
          ataCreated = true;
        } catch {
          // Gauge had no claimable rewards on-chain yet — continue
        }
      }

      // Claim staking RISE rewards (if any)
      if (stakeClaimable > 0) {
        try {
          await claimStakingRewards();
        } catch {
          // Not yet registered or no rewards — skip
        }
      }

      await refresh();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey, gauges, stakeClaimable, claimStakingRewards, refresh]);

  /**
   * Creates the LP token vault for a gauge. Authority only.
   * Must be called once after `create_gauge` before any user can deposit LP tokens.
   * @param gaugeId  Gauge PDA address (base58)
   * @param lpMint   LP token mint address for this pool (base58)
   */
  const initializeGaugeLpVault = useCallback(async (gaugeId: string, lpMint: string) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");

    setLoading(true);
    try {
      const provider  = getProvider(wallet);
      const rewards   = getRewardsProgram(provider);
      const gaugePda  = new PublicKey(gaugeId);
      const lpMintKey = new PublicKey(lpMint);

      // Derive gauge.pool from on-chain account to get the vault PDA
      const gaugeAcc = await (rewards.account as any)["gauge"].fetch(gaugePda);
      const pool     = gaugeAcc.pool as PublicKey;

      await rewards.methods
        .initializeGaugeLpVault()
        .accounts({
          authority:    publicKey,
          config:       deriveRewardsConfig(),
          gauge:        gaugePda,
          lpMint:       lpMintKey,
          gaugeLpVault: deriveGaugeLpVault(pool),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: (await import("@solana/web3.js")).SystemProgram.programId,
        })
        .rpc();

      await refresh();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey, refresh]);

  // Backward-compat aliases for GaugeCard which calls deposit(gaugeId, amount) / withdraw(gaugeId, amount)
  const deposit  = depositLp;
  const withdraw = withdrawLp;

  return {
    // Reads
    gauges,
    userStakes,
    totalClaimable,
    stakeClaimable,
    epochEmissions,
    totalWeeklyEmissions,
    fetching,
    fetchError,
    refresh,
    // Loading
    loading,
    // Transactions
    depositLp,
    withdrawLp,
    claimRewards,
    claimStakingRewards,
    claimAll,
    initializeGaugeLpVault,
    // Backward-compat aliases
    deposit,
    withdraw,
  };
}
