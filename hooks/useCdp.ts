"use client";
import { useState, useCallback, useEffect } from "react";
import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { getProvider, getCdpProgram, getStakingProgram, getProgramPublicKeys } from "@/lib/programs";
import { RISE_SOL_MINT, PYTH_FEED_IDS, PYTH_HERMES_URL, JUPITER_PROGRAM_ID, JUPITER_PROGRAM_AUTHORITY, WSOL_MINT } from "@/lib/constants";
import {
  deriveGlobalPool,
  derivePoolVault,
  deriveTreasuryVault,
  deriveCdpConfig,
  deriveCdpFeeVault,
  deriveCollateralConfig,
  deriveCollateralVault,
  derivePaymentConfig,
  deriveCdpPosition,
  deriveCdpWsolVault,
  deriveCdpWsolBuybackVault,
  deriveProtocolTreasury,
  deriveJupiterEventAuthority,
} from "@/lib/pdas";

export type HealthStatus = "healthy" | "warning" | "danger";

export interface CdpPosition {
  id: string;         // position PDA public key string
  nonce: number;      // required to re-derive the PDA for any subsequent instruction
  collateralToken: string;
  collateralMint: string;
  collateralAmount: number;
  collateralValueUsd: number;
  debtRiseSol: number;
  debtValueUsd: number;
  healthFactor: number;
  liquidationThreshold: number;
  maxLtv: number;
  status: HealthStatus;
}

export interface CollateralType {
  symbol: string;
  name: string;
  mint: string;
  ltv: number;
  liquidationThreshold: number;
  priceUsd: number;
  decimals: number;
}


const MOCK_COLLATERALS: CollateralType[] = [
  { symbol: "SOL",     name: "Solana",       mint: SystemProgram.programId.toBase58(), ltv: 75, liquidationThreshold: 85, priceUsd: 182,    decimals: 9 },
  { symbol: "mSOL",    name: "Marinade SOL", mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", ltv: 78, liquidationThreshold: 87, priceUsd: 195, decimals: 9 },
  { symbol: "JitoSOL", name: "Jito SOL",     mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", ltv: 78, liquidationThreshold: 87, priceUsd: 190, decimals: 9 },
  { symbol: "wETH",    name: "Wrapped ETH",  mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", ltv: 70, liquidationThreshold: 80, priceUsd: 3_180,  decimals: 8 },
  { symbol: "wBTC",    name: "Wrapped BTC",  mint: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", ltv: 65, liquidationThreshold: 75, priceUsd: 87_400, decimals: 8 },
  { symbol: "USDC",    name: "USD Coin",     mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", ltv: 88, liquidationThreshold: 93, priceUsd: 1,      decimals: 6 },
  { symbol: "USDT",    name: "Tether USD",   mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", ltv: 88, liquidationThreshold: 93, priceUsd: 1,      decimals: 6 },
];

// Collateral is held in its original currency (e.g. wETH stays wETH).
// SOL-denominated values are used only for LTV and health factor calculations.
//
// riseSOL redemption priority:
//   1. Process the redemption queue (pending unstakes from validators)
//   2. Refund from the SOL reserve
//   3. Convert CDP collateral to SOL via Jupiter (last resort)
export function useCdp() {
  const [positions, setPositions] = useState<CdpPosition[]>([]);
  const [collaterals, setCollaterals] = useState<CollateralType[]>(MOCK_COLLATERALS);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Each borrower can have multiple positions keyed by nonce (0–255).
  // Derived from on-chain data after refresh; incremented locally on openPosition.
  const [nextPositionNonce, setNextPositionNonce] = useState(0);

  // Fetch live USD prices from Pyth Hermes once on mount; mock prices are the fallback.
  useEffect(() => {
    const feedIds = [...new Set(
      MOCK_COLLATERALS.map((c) => PYTH_FEED_IDS[c.symbol]).filter(Boolean)
    )];
    if (feedIds.length === 0) return;

    const query = feedIds.map((id) => `ids[]=${id}`).join("&");
    fetch(`${PYTH_HERMES_URL}/v2/updates/price/latest?${query}&parsed=true`)
      .then((res) => res.json())
      .then((data: { parsed: Array<{ id: string; price: { price: string; expo: number } }> }) => {
        const priceMap: Record<string, number> = {};
        for (const entry of data.parsed) {
          priceMap[entry.id] = parseInt(entry.price.price, 10) * Math.pow(10, entry.price.expo);
        }
        setCollaterals((prev) =>
          prev.map((c) => {
            const feedId = PYTH_FEED_IDS[c.symbol];
            const livePrice = feedId ? priceMap[feedId] : undefined;
            return livePrice && livePrice > 0 ? { ...c, priceUsd: livePrice } : c;
          })
        );
      })
      .catch(() => {/* keep mock prices on network failure */})
      .finally(() => setPricesLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();

  // ── On-chain reads ─────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setPositions([]);
      return;
    }
    setFetching(true);
    setFetchError(null);
    try {
      const readWallet: AnchorWallet = wallet ?? {
        publicKey,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      };
      const provider = getProvider(readWallet);
      const cdp = getCdpProgram(provider);

      // Fetch all CdpPosition accounts owned by this wallet.
      // Account layout: [8 discriminator][32 owner] → memcmp at offset 8.
      const rawAll = await (cdp.account as any)["cdpPosition"].all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]);

      // Derive nextPositionNonce from all known positions (open or closed) so
      // we never reuse a nonce whose PDA account still exists on-chain.
      if (rawAll.length > 0) {
        const maxNonce = Math.max(...rawAll.map((p: any) => p.account.nonce as number));
        setNextPositionNonce((prev) => Math.max(prev, maxNonce + 1));
      }

      const openRaw = rawAll.filter((p: any) => p.account.isOpen);
      if (openRaw.length === 0) {
        setPositions([]);
        return;
      }

      // Batch-fetch CollateralConfig for each unique mint.
      const uniqueMints = [...new Set<string>(openRaw.map((p: any) => p.account.collateralMint.toBase58()))];
      const configMap = new Map<string, any>();
      await Promise.all(
        uniqueMints.map(async (mintStr) => {
          try {
            const config = await (cdp.account as any)["collateralConfig"].fetch(
              deriveCollateralConfig(new PublicKey(mintStr))
            );
            configMap.set(mintStr, config);
          } catch {
            // Config not found — position will use fallback LTV values.
          }
        })
      );

      // health_factor is u128 scaled by 1e18; collateral_usd_value is u128 scaled by 1e6.
      // Use BigInt arithmetic to avoid floating-point overflow before scaling down.
      const RATE_SCALE = 1_000_000_000_000_000_000n; // 1e18
      const PRICE_SCALE = 1_000_000n;                 // 1e6

      const mapped: CdpPosition[] = openRaw.map((raw: any) => {
        const acc = raw.account;
        const mintStr: string = acc.collateralMint.toBase58();
        const config = configMap.get(mintStr);

        const collateralInfo = MOCK_COLLATERALS.find((c) => c.mint === mintStr);
        const collateralToken = collateralInfo?.symbol ?? mintStr.slice(0, 6);
        const decimals = collateralInfo?.decimals ?? 9;

        // Collateral amount in human-readable token units.
        const collateralAmount = acc.collateralAmountOriginal.toNumber() / Math.pow(10, decimals);

        // Collateral USD value (u128, scaled by 1e6 → 6 decimal places).
        const collUsdBig = BigInt(acc.collateralUsdValue.toString());
        const collateralValueUsd = Number(collUsdBig / PRICE_SCALE) +
          Number(collUsdBig % PRICE_SCALE) / 1_000_000;

        // Total riseSOL debt (principal + accrued interest), in SOL units.
        const debtLamports = acc.riseSolDebtPrincipal.toNumber() + acc.interestAccrued.toNumber();
        const debtRiseSol = debtLamports / LAMPORTS_PER_SOL;

        // Health factor (u128, scaled by 1e18).
        const hfBig = BigInt(acc.healthFactor.toString());
        // Multiply by 1000 before integer division to preserve 3 decimal places.
        const healthFactor = Number((hfBig * 1000n) / RATE_SCALE) / 1000;

        // On-chain LTV params from CollateralConfig (in bps) → percentage.
        const liqThresholdBps: number = config?.liquidationThresholdBps ?? 8500;
        const maxLtvBps: number = config?.maxLtvBps ?? 7500;

        // Derive debt USD from health factor definition:
        //   health_factor = (collateral_usd * liq_threshold / 10000) / debt_usd
        //   => debt_usd   = (collateral_usd * liq_threshold / 10000) / health_factor
        const debtValueUsd = healthFactor > 0 && collateralValueUsd > 0
          ? (collateralValueUsd * liqThresholdBps / 10_000) / healthFactor
          : 0;

        const status: HealthStatus =
          healthFactor >= 1.5 ? "healthy" :
          healthFactor >= 1.2 ? "warning"  : "danger";

        return {
          id:                   raw.publicKey.toBase58(),
          nonce:                acc.nonce as number,
          collateralToken,
          collateralMint:       mintStr,
          collateralAmount,
          collateralValueUsd,
          debtRiseSol,
          debtValueUsd,
          healthFactor,
          liquidationThreshold: liqThresholdBps / 100,
          maxLtv:               maxLtvBps / 100,
          status,
        };
      });

      setPositions(mapped);
    } catch (err: any) {
      setFetchError(err?.message ?? "Failed to load CDP positions");
    } finally {
      setFetching(false);
    }
  }, [wallet, publicKey]);

  // Refresh whenever wallet connects or disconnects.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Fetches price feed pubkeys from the on-chain collateral config and SOL payment config. */
  async function getPriceFeeds(cdp: ReturnType<typeof getCdpProgram>, collateralMint: PublicKey) {
    const [collateralConfigData, solPaymentConfigData] = await Promise.all([
      (cdp.account as any)["collateralConfig"].fetch(deriveCollateralConfig(collateralMint)),
      (cdp.account as any)["paymentConfig"].fetch(derivePaymentConfig(SystemProgram.programId)),
    ]);
    return {
      pythPriceFeed: collateralConfigData.pythPriceFeed as PublicKey,
      solPriceFeed:  solPaymentConfigData.pythPriceFeed as PublicKey,
    };
  }

  /** Returns the riseSOL mint from GlobalPool. */
  async function getRiseSolMint(staking: ReturnType<typeof getStakingProgram>) {
    const pool = await (staking.account as any)["globalPool"].fetch(deriveGlobalPool());
    return pool.riseSolMint as PublicKey;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Opens a new CDP position. Derives all accounts from collateral symbol. */
  const openPosition = useCallback(async (
    collateralSymbol: string,
    collateralAmount: number,  // token native units (e.g. USDC: 1_000_000 = $1)
    borrowAmount: number,       // riseSOL lamports to mint
  ) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    const collateralInfo = MOCK_COLLATERALS.find((c) => c.symbol === collateralSymbol);
    if (!collateralInfo?.mint) throw new Error("Unsupported collateral");

    setLoading(true);
    try {
      const provider    = getProvider(wallet);
      const cdp         = getCdpProgram(provider);
      const staking     = getStakingProgram(provider);
      const nonce       = nextPositionNonce;

      const collateralMint  = new PublicKey(collateralInfo.mint);
      const globalPool      = deriveGlobalPool();
      const cdpConfig       = deriveCdpConfig();
      const collateralVault = deriveCollateralVault(collateralMint);
      const position        = deriveCdpPosition(publicKey, nonce);
      const riseSolMint     = await getRiseSolMint(staking);
      const { pythPriceFeed, solPriceFeed } = await getPriceFeeds(cdp, collateralMint);

      const borrowerCollateralAccount = await getAssociatedTokenAddress(collateralMint, publicKey);
      const borrowerRiseSolAccount    = await getAssociatedTokenAddress(riseSolMint, publicKey);

      await cdp.methods
        .openPosition(new BN(collateralAmount), new BN(borrowAmount), nonce)
        .accounts({
          borrower: publicKey,
          cdpConfig,
          globalPool,
          position,
          collateralConfig:          deriveCollateralConfig(collateralMint),
          collateralMint,
          borrowerCollateralAccount,
          collateralVault,
          pythPriceFeed,
          solPriceFeed,
          riseSolMint,
          borrowerRiseSolAccount,
          stakingProgram:            getProgramPublicKeys().staking,
          tokenProgram:              TOKEN_PROGRAM_ID,
          systemProgram:             SystemProgram.programId,
        })
        .rpc();

      setNextPositionNonce((n) => n + 1);
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey, nextPositionNonce, refresh]);

  /**
   * Calls Jupiter v6 quote → swap-instructions to get the pre-serialized
   * route plan bytes and the two shared token accounts for this route.
   *
   * Returns null if either API call fails (e.g. on devnet with no liquidity).
   */
  async function getJupiterRoute(
    inputMint: string,
    outputMint: string,
    amountLamports: number,
    slippageBps: number,
  ): Promise<{
    routePlanData: Buffer;
    quotedOutAmount: number;
    jupiterSourceToken: PublicKey;
    jupiterDestinationToken: PublicKey;
  } | null> {
    try {
      const quoteRes = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}` +
        `&amount=${amountLamports}&slippageBps=${slippageBps}`
      );
      if (!quoteRes.ok) return null;
      const quote = await quoteRes.json();

      const swapRes = await fetch("https://quote-api.jup.ag/v6/swap-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: JUPITER_PROGRAM_AUTHORITY, // placeholder — overridden by signer
          wrapAndUnwrapSol: false,
        }),
      });
      if (!swapRes.ok) return null;
      const swapData = await swapRes.json();

      // swapInstruction.data is base64-encoded instruction data:
      //   [8 disc][1 id][N route_plan_data][8 in_amount][8 quoted_out][2 slippage][1 fee]
      // routePlanData = bytes [9 .. data.length - 19]
      const rawData = Buffer.from(swapData.swapInstruction.data, "base64");
      const routePlanData = rawData.slice(9, rawData.length - 19);
      const quotedOutAmount = Number(quote.outAmount);

      const accounts: string[] = swapData.swapInstruction.accounts.map((a: { pubkey: string }) => a.pubkey);
      const jupiterSourceToken      = new PublicKey(accounts[4]);
      const jupiterDestinationToken = new PublicKey(accounts[5]);

      return { routePlanData, quotedOutAmount, jupiterSourceToken, jupiterDestinationToken };
    } catch {
      return null;
    }
  }

  /**
   * Repays debt on a position.
   *
   * Routes based on currency:
   *   "riseSOL" → rise_cdp::repay_debt_rise_sol  (burns riseSOL 1:1, no swap)
   *   "SOL"     → rise_cdp::repay_debt            (native SOL path)
   *   others    → rise_cdp::repay_debt            (SPL → SOL via Jupiter)
   */
  const repayDebt = useCallback(async (
    position: CdpPosition,
    amount: number,
    currency: string,
  ) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    setLoading(true);
    try {
      const provider       = getProvider(wallet);
      const cdp            = getCdpProgram(provider);
      const staking        = getStakingProgram(provider);
      const collateralMint = new PublicKey(position.collateralMint);
      const positionPda    = deriveCdpPosition(publicKey, position.nonce);
      const collateralConfig  = deriveCollateralConfig(collateralMint);
      const collateralVault   = deriveCollateralVault(collateralMint);
      const cdpConfig         = deriveCdpConfig();
      const globalPool        = deriveGlobalPool();
      const { pythPriceFeed, solPriceFeed } = await getPriceFeeds(cdp, collateralMint);
      const borrowerCollateralAccount = await getAssociatedTokenAddress(collateralMint, publicKey);

      // Shared Jupiter accounts needed by both repay paths
      const jupiterProgram          = new PublicKey(JUPITER_PROGRAM_ID);
      const jupiterProgramAuthority = new PublicKey(JUPITER_PROGRAM_AUTHORITY);
      const jupiterEventAuthority   = deriveJupiterEventAuthority();
      const cdpWsolVault            = deriveCdpWsolVault();
      const cdpWsolBuybackVault     = deriveCdpWsolBuybackVault();
      const wsolMint                = new PublicKey(WSOL_MINT);

      if (currency === "riseSOL") {
        // Burns riseSOL 1:1 against debt — no swap needed
        const riseSolMint            = await getRiseSolMint(staking);
        const borrowerRiseSolAccount = await getAssociatedTokenAddress(riseSolMint, publicKey);

        await cdp.methods
          .repayDebtRiseSol(new BN(amount), Buffer.alloc(0), new BN(0), 0)
          .accounts({
            borrower:                        publicKey,
            position:                        positionPda,
            collateralConfig,
            riseSolMint,
            borrowerRiseSolAccount,
            collateralVault,
            borrowerCollateralAccount,
            collateralMint,
            cdpConfig,
            globalPool,
            treasury:                        deriveProtocolTreasury(),
            treasuryVault:                   deriveTreasuryVault(),
            wsolMint,
            cdpWsolBuybackVault,
            pythPriceFeed,
            solPriceFeed,
            jupiterProgram,
            jupiterProgramAuthority,
            jupiterEventAuthority,
            shortfallJupiterSourceToken:     cdpWsolBuybackVault, // placeholder — unused when no shortfall
            shortfallJupiterDestinationToken: cdpWsolBuybackVault,
            stakingProgram:                  getProgramPublicKeys().staking,
            tokenProgram:                    TOKEN_PROGRAM_ID,
            systemProgram:                   SystemProgram.programId,
          })
          .rpc();

      } else if (currency === "SOL") {
        // Native SOL path — no swap, borrower transfers SOL directly
        const paymentMint   = new PublicKey(WSOL_MINT);
        const paymentConfig = derivePaymentConfig(paymentMint);

        await cdp.methods
          .repayDebt(new BN(amount), Buffer.alloc(0), new BN(0), 0, Buffer.alloc(0), new BN(0), 0)
          .accounts({
            borrower:                        publicKey,
            position:                        positionPda,
            collateralConfig,
            paymentConfig,
            globalPool,
            cdpConfig,
            cdpFeeVault:                     deriveCdpFeeVault(),
            poolVault:                       derivePoolVault(),
            collateralVault,
            borrowerCollateralAccount,
            collateralMint,
            pythPriceFeed,
            solPriceFeed,
            paymentMint:                     PublicKey.default,
            borrowerPaymentAccount:          PublicKey.default,
            wsolMint,
            cdpWsolVault,
            cdpWsolBuybackVault,
            jupiterProgram,
            jupiterProgramAuthority,
            jupiterEventAuthority,
            jupiterSourceToken:              cdpWsolVault,       // unused for SOL path
            jupiterDestinationToken:         cdpWsolVault,
            shortfallJupiterSourceToken:     cdpWsolBuybackVault, // placeholder — unused when no shortfall
            shortfallJupiterDestinationToken: cdpWsolBuybackVault,
            tokenProgram:                    TOKEN_PROGRAM_ID,
            systemProgram:                   SystemProgram.programId,
          })
          .rpc();

      } else {
        // SPL token path — swap payment token → SOL via Jupiter
        const paymentMint   = new PublicKey(
          MOCK_COLLATERALS.find((c) => c.symbol === currency)?.mint ?? ""
        );
        const paymentConfig = derivePaymentConfig(paymentMint);
        const borrowerPaymentAccount = await getAssociatedTokenAddress(paymentMint, publicKey);

        const route = await getJupiterRoute(
          paymentMint.toBase58(),
          WSOL_MINT,
          amount,
          50, // 0.5% slippage
        );

        const routePlanData       = route?.routePlanData       ?? Buffer.alloc(0);
        const quotedOutAmount     = route?.quotedOutAmount      ?? 0;
        const jupiterSourceToken  = route?.jupiterSourceToken   ?? cdpWsolVault;
        const jupiterDestToken    = route?.jupiterDestinationToken ?? cdpWsolVault;

        await cdp.methods
          .repayDebt(new BN(amount), routePlanData, new BN(quotedOutAmount), 50, Buffer.alloc(0), new BN(0), 0)
          .accounts({
            borrower:                        publicKey,
            position:                        positionPda,
            collateralConfig,
            paymentConfig,
            globalPool,
            cdpConfig,
            cdpFeeVault:                     deriveCdpFeeVault(),
            poolVault:                       derivePoolVault(),
            collateralVault,
            borrowerCollateralAccount,
            collateralMint,
            pythPriceFeed,
            solPriceFeed,
            paymentMint,
            borrowerPaymentAccount,
            wsolMint,
            cdpWsolVault,
            cdpWsolBuybackVault,
            jupiterProgram,
            jupiterProgramAuthority,
            jupiterEventAuthority,
            jupiterSourceToken,
            jupiterDestinationToken:         jupiterDestToken,
            shortfallJupiterSourceToken:     cdpWsolBuybackVault, // placeholder — unused when no shortfall
            shortfallJupiterDestinationToken: cdpWsolBuybackVault,
            tokenProgram:                    TOKEN_PROGRAM_ID,
            systemProgram:                   SystemProgram.programId,
          })
          .rpc();
      }
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey]);

  /** Borrows additional riseSOL against an existing open position. */
  const borrowMore = useCallback(async (
    position: CdpPosition,
    additionalRiseSol: number,
  ) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    setLoading(true);
    try {
      const provider       = getProvider(wallet);
      const cdp            = getCdpProgram(provider);
      const staking        = getStakingProgram(provider);
      const collateralMint = new PublicKey(position.collateralMint);
      const positionPda    = deriveCdpPosition(publicKey, position.nonce);
      const globalPool     = deriveGlobalPool();
      const riseSolMint    = await getRiseSolMint(staking);
      const { solPriceFeed } = await getPriceFeeds(cdp, collateralMint);
      const borrowerRiseSolAccount = await getAssociatedTokenAddress(riseSolMint, publicKey);

      await cdp.methods
        .borrowMore(new BN(additionalRiseSol))
        .accounts({
          borrower: publicKey,
          position:               positionPda,
          collateralConfig:       deriveCollateralConfig(collateralMint),
          globalPool,
          cdpConfig:              deriveCdpConfig(),
          solPriceFeed,
          riseSolMint,
          borrowerRiseSolAccount,
          stakingProgram:         getProgramPublicKeys().staking,
          tokenProgram:           TOKEN_PROGRAM_ID,
        })
        .rpc();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey]);

  /** Deposits additional collateral into an existing open position. */
  const addCollateral = useCallback(async (
    position: CdpPosition,
    amount: number,
  ) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    setLoading(true);
    try {
      const provider       = getProvider(wallet);
      const cdp            = getCdpProgram(provider);
      const collateralMint = new PublicKey(position.collateralMint);
      const positionPda    = deriveCdpPosition(publicKey, position.nonce);
      const { pythPriceFeed, solPriceFeed } = await getPriceFeeds(cdp, collateralMint);
      const borrowerCollateralAccount = await getAssociatedTokenAddress(collateralMint, publicKey);

      await cdp.methods
        .addCollateral(new BN(amount))
        .accounts({
          borrower: publicKey,
          position:                 positionPda,
          collateralConfig:         deriveCollateralConfig(collateralMint),
          collateralMint,
          borrowerCollateralAccount,
          collateralVault:          deriveCollateralVault(collateralMint),
          pythPriceFeed,
          solPriceFeed,
          tokenProgram:             TOKEN_PROGRAM_ID,
        })
        .rpc();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey]);

  /**
   * Withdraws excess collateral immediately (no delay).
   * Safe LTV buffer (80% of max LTV) is enforced on-chain.
   */
  const withdrawExcess = useCallback(async (
    position: CdpPosition,
    amount: number,
  ) => {
    if (!wallet || !publicKey) throw new Error("Wallet not connected");
    setLoading(true);
    try {
      const provider       = getProvider(wallet);
      const cdp            = getCdpProgram(provider);
      const collateralMint = new PublicKey(position.collateralMint);
      const positionPda    = deriveCdpPosition(publicKey, position.nonce);
      const { pythPriceFeed, solPriceFeed } = await getPriceFeeds(cdp, collateralMint);
      const borrowerCollateralAccount = await getAssociatedTokenAddress(collateralMint, publicKey);

      await cdp.methods
        .withdrawExcess(new BN(amount))
        .accounts({
          borrower: publicKey,
          position:                 positionPda,
          collateralConfig:         deriveCollateralConfig(collateralMint),
          collateralMint,
          borrowerCollateralAccount,
          collateralVault:          deriveCollateralVault(collateralMint),
          pythPriceFeed,
          solPriceFeed,
          tokenProgram:             TOKEN_PROGRAM_ID,
        })
        .rpc();
    } finally {
      setLoading(false);
    }
  }, [wallet, publicKey]);

  return {
    positions,
    collaterals,
    pricesLoaded,
    loading,
    fetching,
    fetchError,
    refresh,
    openPosition,
    repayDebt,
    borrowMore,
    addCollateral,
    withdrawExcess,
  };
}
