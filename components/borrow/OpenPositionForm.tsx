"use client";
import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TokenInput } from "@/components/ui/TokenInput";
import { useCdp } from "@/hooks/useCdp";
import { useStaking } from "@/hooks/useStaking";
import { WSOL_MINT } from "@/lib/constants";

export function OpenPositionForm() {
  const [collateral, setCollateral] = useState("");
  const [borrow, setBorrow] = useState("");
  const [selectedCollateral, setSelectedCollateral] = useState("SOL");
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { collaterals, pricesLoaded, openPosition, loading } = useCdp();
  const { data: staking } = useStaking();
  const [walletBalance, setWalletBalance] = useState<number | undefined>(undefined);
  const [txError, setTxError] = useState<string | null>(null);

  const config = collaterals.find((c) => c.symbol === selectedCollateral);
  const solPriceUsd = collaterals.find((c) => c.symbol === "SOL")?.priceUsd ?? 0;
  const exchangeRate = staking.exchangeRate;

  useEffect(() => {
    if (!publicKey || !config) { setWalletBalance(undefined); return; }
    const mint = config.mint;
    if (mint === WSOL_MINT) {
      connection.getBalance(publicKey).then((lamports) => {
        setWalletBalance(Math.max(0, lamports / LAMPORTS_PER_SOL - 0.01));
      }).catch(() => setWalletBalance(undefined));
    } else {
      getAssociatedTokenAddress(new PublicKey(mint), publicKey)
        .then((ata) => connection.getTokenAccountBalance(ata))
        .then((res) => setWalletBalance(res.value.uiAmount ?? 0))
        .catch(() => setWalletBalance(0));
    }
  }, [publicKey, selectedCollateral]); // eslint-disable-line react-hooks/exhaustive-deps

  const collateralNum = parseFloat(collateral) || 0;
  const borrowNum = parseFloat(borrow) || 0;

  // SOL-equivalent value of collateral
  const collateralValueSol = config && solPriceUsd > 0
    ? collateralNum * (config.priceUsd / solPriceUsd)
    : 0;

  // Max borrowable riseSOL given entered collateral
  const maxBorrow = config && collateralValueSol > 0
    ? (collateralValueSol * config.ltv) / (100 * exchangeRate)
    : 0;

  // LTV = (debt_riseSOL * exchangeRate) / collateral_sol
  const currentLtv = collateralValueSol > 0
    ? ((borrowNum * exchangeRate) / collateralValueSol) * 100
    : 0;

  const overLtv = currentLtv > (config?.ltv ?? 75);

  // Typing borrow → autofill minimum collateral needed
  function handleBorrowChange(val: string) {
    setBorrow(val);
    const num = parseFloat(val) || 0;
    if (num > 0 && config && exchangeRate > 0 && solPriceUsd > 0 && config.priceUsd > 0) {
      // minCollateral = (borrow * exchangeRate * solPriceUsd) / (collateralPriceUsd * ltv/100)
      const needed = (num * exchangeRate * solPriceUsd) / (config.priceUsd * (config.ltv / 100));
      setCollateral(needed.toFixed(4));
    }
  }

  // Typing collateral → just update collateral; max borrow updates reactively
  function handleCollateralChange(val: string) {
    setCollateral(val);
  }

  // Switching collateral type resets both fields
  function handleCollateralTypeChange(symbol: string) {
    setSelectedCollateral(symbol);
    setCollateral("");
    setBorrow("");
  }

  async function handleOpen() {
    if (!collateral || !borrow) return;
    setTxError(null);
    try {
      await openPosition(selectedCollateral, collateralNum, borrowNum);
      setCollateral("");
      setBorrow("");
    } catch (err: any) {
      setTxError(err?.message ?? "Transaction failed");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Collateral type */}
      <div>
        <label className="text-xs font-medium tracking-wide text-[#94A3B8] mb-2 block">
          Collateral Type
        </label>
        <div className="flex gap-2 flex-wrap">
          {collaterals.map((c) => (
            <button
              key={c.symbol}
              onClick={() => handleCollateralTypeChange(c.symbol)}
              className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                selectedCollateral === c.symbol
                  ? "border-[#60A5FA] bg-[#1E3A5F] text-[#60A5FA]"
                  : "border-[#334155] text-[#64748B] hover:border-[#60A5FA]/50"
              }`}
            >
              {c.symbol}
            </button>
          ))}
        </div>
      </div>

      {config && (
        <div className="rounded-xl bg-[#1E293B] border border-[#334155] px-4 py-3 grid grid-cols-2 sm:flex sm:flex-wrap gap-x-6 gap-y-2 text-sm">
          <div><span className="text-[#94A3B8]">Max LTV </span><span className="font-semibold text-[#F1F5F9]">{config.ltv}%</span></div>
          <div><span className="text-[#94A3B8]">Liquidation </span><span className="font-semibold text-[#F1F5F9]">{config.liquidationThreshold}%</span></div>
          <div><span className="text-[#94A3B8]">Price </span><span className="font-semibold text-[#F1F5F9]">{pricesLoaded ? `$${config.priceUsd.toLocaleString()}` : "—"}</span></div>
        </div>
      )}

      {/* Borrow first — max updates as collateral changes */}
      <TokenInput
        label="Borrow riseSOL"
        token="riseSOL"
        value={borrow}
        onChange={handleBorrowChange}
        max={pricesLoaded && maxBorrow > 0 ? maxBorrow : undefined}
      />

      {/* Collateral — autofills when borrow is typed */}
      <TokenInput
        label="Deposit Collateral"
        token={selectedCollateral}
        value={collateral}
        onChange={handleCollateralChange}
        max={walletBalance}
      />

      {pricesLoaded && currentLtv > 0 && (
        <div className={`rounded-xl border px-4 py-3 flex justify-between text-sm ${overLtv ? "border-red-800 bg-red-950" : "border-[#334155]"}`}>
          <span className="text-[#94A3B8]">Current LTV</span>
          <span className={`font-semibold ${overLtv ? "text-red-400" : "text-[#F1F5F9]"}`}>
            {currentLtv.toFixed(1)}% / {config?.ltv}% max
          </span>
        </div>
      )}

      {txError && (
        <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400 break-all">
          {txError}
        </div>
      )}

      <button
        onClick={handleOpen}
        disabled={loading || !publicKey || !collateral || !borrow || (pricesLoaded && overLtv)}
        className="w-full rounded-full bg-[#60A5FA] py-3.5 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Opening…" : "Open Position"}
      </button>
    </div>
  );
}
