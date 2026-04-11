"use client";
import { useState, useCallback, useEffect } from "react";
import { useWallet, useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { getProvider, getStakingProgram } from "@/lib/programs";
import {
  deriveGlobalPool,
  derivePoolVault,
  deriveWithdrawalTicket,
} from "@/lib/pdas";

export interface StakingData {
  riseSolBalance: number;   // user's riseSOL SPL token balance
  solBalance: number;       // user's native SOL balance
  exchangeRate: number;     // SOL per riseSOL (exchange_rate / 1e9)
  apy: number;              // annualized % from prev_exchange_rate → exchange_rate delta
  totalStaked: number;      // total_sol_staked / LAMPORTS_PER_SOL
  myStakedSol: number;      // riseSolBalance * exchangeRate
  liquidBufferSol: number;  // liquid_buffer_lamports / LAMPORTS_PER_SOL
}

export interface WithdrawalTicket {
  nonce: bigint;
  address: PublicKey;
  solAmount: number;
  claimableEpoch: number;
}

const EMPTY_DATA: StakingData = {
  riseSolBalance: 0,
  solBalance: 0,
  exchangeRate: 1,
  apy: 0,
  totalStaked: 0,
  myStakedSol: 0,
  liquidBufferSol: 0,
};

export function useStaking() {
  const [data, setData] = useState<StakingData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // null = unknown (initial load); true/false = pool exists or not
  const [protocolInitialized, setProtocolInitialized] = useState<boolean | null>(null);

  const [pendingTickets, setPendingTickets] = useState<WithdrawalTicket[]>([]);

  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  const refresh = useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const pool = deriveGlobalPool();

      // Build a read-only provider so we can fetch pool data even before a wallet is connected.
      const readWallet: AnchorWallet = wallet ?? ({
        publicKey: Keypair.generate().publicKey,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      } as AnchorWallet);

      const provider = getProvider(readWallet);
      const program  = getStakingProgram(provider);

      // Check pool existence first to detect uninitialized protocol
      const poolInfo = await connection.getAccountInfo(pool);
      if (!poolInfo) {
        setProtocolInitialized(false);
        setData(EMPTY_DATA);
        return;
      }
      setProtocolInitialized(true);

      const raw = await (program.account as any)["globalPool"].fetch(pool) as {
        riseSolMint: PublicKey;
        totalSolStaked: BN;
        exchangeRate: BN;
        liquidBufferLamports: BN;
        prevExchangeRate: BN;
        prevRateUpdateSlot: BN;
      };

      const RATE_SCALE      = 1_000_000_000;
      const SLOTS_PER_YEAR  = 78_840_000;

      const exchangeRate    = raw.exchangeRate.toNumber() / RATE_SCALE;
      const totalStaked     = raw.totalSolStaked.toNumber() / LAMPORTS_PER_SOL;
      const liquidBufferSol = raw.liquidBufferLamports.toNumber() / LAMPORTS_PER_SOL;

      // APY: annualize the rate growth between the two most recent update_exchange_rate calls.
      // Formula: ((current / prev) ^ (SLOTS_PER_YEAR / slot_delta) - 1) * 100
      let apy = 0;
      const prevRate = raw.prevExchangeRate.toNumber();
      const prevSlot = raw.prevRateUpdateSlot.toNumber();
      if (prevRate > 0 && prevSlot > 0) {
        const currentSlot = await connection.getSlot();
        const slotDelta = currentSlot - prevSlot;
        if (slotDelta > 0) {
          const rateRatio = raw.exchangeRate.toNumber() / prevRate;
          const periodsPerYear = SLOTS_PER_YEAR / slotDelta;
          apy = (Math.pow(rateRatio, periodsPerYear) - 1) * 100;
        }
      }

      let riseSolBalance = 0;
      let solBalance     = 0;

      if (publicKey) {
        solBalance = (await connection.getBalance(publicKey)) / LAMPORTS_PER_SOL;

        const { getAssociatedTokenAddress } = await import("@solana/spl-token");
        const ata     = await getAssociatedTokenAddress(raw.riseSolMint, publicKey);
        const ataInfo = await connection.getTokenAccountBalance(ata).catch(() => null);
        if (ataInfo) riseSolBalance = ataInfo.value.uiAmount ?? 0;

        // Fetch all WithdrawalTicket accounts owned by this wallet.
        // Layout: [8 discriminator][32 owner] → memcmp at offset 8.
        const rawTickets = await (program.account as any)["withdrawalTicket"].all([
          { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
        ]);
        const tickets: WithdrawalTicket[] = rawTickets.map((raw: any) => {
          const nonce = BigInt(raw.account.nonce.toString());
          return {
            nonce,
            address:        deriveWithdrawalTicket(publicKey, nonce),
            solAmount:      raw.account.solAmount.toNumber() / LAMPORTS_PER_SOL,
            claimableEpoch: raw.account.claimableEpoch.toNumber(),
          };
        });
        setPendingTickets(tickets);
      }

      setData({
        riseSolBalance,
        solBalance,
        exchangeRate,
        apy,
        totalStaked,
        myStakedSol:    riseSolBalance * exchangeRate,
        liquidBufferSol,
      });
    } catch (err: any) {
      setFetchError(err?.message ?? "Failed to load staking data");
    } finally {
      setFetching(false);
    }
  }, [wallet, publicKey, connection]);

  // Refresh whenever wallet connects or disconnects
  useEffect(() => {
    refresh();
  }, [refresh]);

  const stake = useCallback(async (solAmount: number) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    setLoading(true);
    try {
      const provider  = getProvider(wallet);
      const program   = getStakingProgram(provider);
      const pool      = deriveGlobalPool();
      const poolVault = derivePoolVault();

      const poolData    = await (program.account as any)["globalPool"].fetch(pool);
      const riseSolMint = (poolData as { riseSolMint: PublicKey }).riseSolMint;

      const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } =
        await import("@solana/spl-token");
      const userRiseSolAccount = await getAssociatedTokenAddress(riseSolMint, publicKey);
      const ataInfo            = await connection.getAccountInfo(userRiseSolAccount);
      const preIx = ataInfo
        ? []
        : [createAssociatedTokenAccountInstruction(publicKey, userRiseSolAccount, publicKey, riseSolMint)];

      // PDA debug — compare these against on-chain accounts if simulation fails
      console.log("[stake_sol] PDAs", {
        pool:               pool.toBase58(),
        poolVault:          poolVault.toBase58(),
        riseSolMint:        riseSolMint.toBase58(),
        userRiseSolAccount: userRiseSolAccount.toBase58(),
        ataExists:          ataInfo !== null,
        lamports:           Math.round(solAmount * LAMPORTS_PER_SOL),
      });

      try {
        await program.methods
          .stakeSol(new BN(solAmount * LAMPORTS_PER_SOL))
          .accounts({
            user:               publicKey,
            pool,
            poolVault,
            riseSolMint,
            userRiseSolAccount,
            systemProgram:      SystemProgram.programId,
            tokenProgram:       TOKEN_PROGRAM_ID,
            stakeRewardsConfig: null,
            userStakeRewards:   null,
          } as any)
          .preInstructions(preIx)
          .rpc();
      } catch (txErr: any) {
        console.error("[stake_sol] transaction failed", txErr);
        // Anchor wraps the on-chain error; log the inner logs if present
        if (txErr?.logs) {
          console.error("[stake_sol] program logs:", txErr.logs);
        }
        throw txErr;
      }

      await refresh();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey, connection, refresh]);

  /**
   * Burns riseSOL and creates a WithdrawalTicket claimable after ~2 epochs.
   * Returns the nonce used so the caller can pass it to claimUnstake later.
   */
  const unstake = useCallback(async (riseSolAmount: number): Promise<bigint> => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    setLoading(true);
    try {
      const provider = getProvider(wallet);
      const program  = getStakingProgram(provider);
      const poolPda  = deriveGlobalPool();

      // Read pool.unstake_nonce before sending so we know exactly which PDA the
      // program will create (it seeds the ticket with the pre-increment value).
      const poolData    = await (program.account as any)["globalPool"].fetch(poolPda) as {
        riseSolMint: PublicKey;
        unstakeNonce: BN;
      };
      const riseSolMint = poolData.riseSolMint;
      const nonce       = BigInt(poolData.unstakeNonce.toString());
      const ticket      = deriveWithdrawalTicket(publicKey, nonce);

      const { getAssociatedTokenAddress } = await import("@solana/spl-token");
      const userRiseSolAccount = await getAssociatedTokenAddress(riseSolMint, publicKey);

      await program.methods
        .unstakeRiseSol(new BN(riseSolAmount * LAMPORTS_PER_SOL))
        .accounts({
          user:              publicKey,
          pool:              poolPda,
          ticket,
          riseSolMint,
          userRiseSolAccount,
          systemProgram:     SystemProgram.programId,
          tokenProgram:      TOKEN_PROGRAM_ID,
        })
        .rpc();

      const ticketData = await (program.account as any)["withdrawalTicket"].fetch(ticket);
      const t = ticketData as { solAmount: BN; claimableEpoch: BN };
      setPendingTickets((prev) => [
        ...prev,
        {
          nonce,
          address:        ticket,
          solAmount:      t.solAmount.toNumber() / LAMPORTS_PER_SOL,
          claimableEpoch: t.claimableEpoch.toNumber(),
        },
      ]);
      await refresh();
      return nonce;
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey, refresh]);

  /**
   * Redeems a matured WithdrawalTicket and returns SOL to the user.
   */
  const claimUnstake = useCallback(async (nonce: bigint) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    setLoading(true);
    try {
      const provider  = getProvider(wallet);
      const program   = getStakingProgram(provider);
      const pool      = deriveGlobalPool();
      const poolVault = derivePoolVault();
      const ticket    = deriveWithdrawalTicket(publicKey, nonce);

      await program.methods
        .claimUnstake()
        .accounts({
          user:          publicKey,
          pool,
          ticket,
          poolVault,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setPendingTickets((prev) => prev.filter((t) => t.nonce !== nonce));
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey, refresh]);

  return {
    data,
    loading,
    fetching,
    fetchError,
    protocolInitialized,
    pendingTickets,
    stake,
    unstake,
    claimUnstake,
    refresh,
  };
}
