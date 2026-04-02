"use client";
import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { TokenInput } from "@/components/ui/TokenInput";
import { useCdp } from "@/hooks/useCdp";
import { useStaking } from "@/hooks/useStaking";

export function OpenPositionForm() {
  const [collateral, setCollateral] = useState("");
  const [borrow, setBorrow] = useState("");
  const [selectedCollateral, setSelectedCollateral] = useState("SOL");
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { collaterals, pricesLoaded, openPosition, loading } = useCdp();
  const { data: staking } = useStaking();
  const [walletBalance, setWalletBalance] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!publicKey || !config) { setWalletBalance(undefined); return; }
    const mint = config.mint;
    if (mint === SystemProgram.programId.toBase58()) {
      // Native SOL — reserve 0.01 SOL for fees
      connection.getBalance(publicKey).then((lamports) => {
        setWalletBalance(Math.max(0, lamports / LAMPORTS_PER_SOL - 0.01));
      }).catch(() => setWalletBalance(undefined));
    } else {
      // SPL token
      getAssociatedTokenAddress(new PublicKey(mint), publicKey)
        .then((ata) => connection.getTokenAccountBalance(ata))
        .then((res) => setWalletBalance(res.value.uiAmount ?? 0))
        .catch(() => setWalletBalance(0));
    }
  }, [publicKey, selectedCollateral]); // eslint-disable-line react-hooks/exhaustive-deps

  const config = collaterals.find((c) => c.symbol === selectedCollateral);
  const solPriceUsd = collaterals.find((c) => c.symbol === "SOL")?.priceUsd ?? 0;

  const collateralNum = parseFloat(collateral) || 0;
  const borrowNum = parseFloat(borrow) || 0;

  // SOL-equivalent value of collateral — used only for LTV/health calculations.
  // Collateral is held in its original currency on-chain.
  const collateralValueSol = config ? collateralNum * (config.priceUsd / solPriceUsd) : 0;

  // riseSOL price in SOL terms = exchange rate (e.g. 1 riseSOL = 1.0842 SOL)
  const exchangeRate = staking.exchangeRate;

  // Max borrowable riseSOL = collateral_sol * ltv% / exchange_rate
  const maxBorrow = config && collateralValueSol > 0
    ? (collateralValueSol * config.ltv) / (100 * exchangeRate)
    : 0;

  // LTV = (debt_riseSOL * exchange_rate) / collateral_sol
  const currentLtv = collateralValueSol > 0
    ? ((borrowNum * exchangeRate) / collateralValueSol) * 100
    : 0;

  const overLtv = currentLtv > (config?.ltv ?? 75);

  async function handleOpen() {
    if (!collateral || !borrow) return;
    await openPosition(selectedCollateral, collateralNum, borrowNum);
    setCollateral("");
    setBorrow("");
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
              onClick={() => setSelectedCollateral(c.symbol)}
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
          <div><span className="text-[#94A3B8]">≈ SOL value </span><span className="font-semibold text-[#F1F5F9]">{pricesLoaded ? `${collateralValueSol.toFixed(4)} SOL` : "—"}</span></div>
          <div><span className="text-[#94A3B8]">Held as </span><span className="font-semibold text-[#F1F5F9]">{config.symbol}</span></div>
        </div>
      )}

      <TokenInput
        label="Deposit Collateral"
        token={selectedCollateral}
        value={collateral}
        onChange={setCollateral}
        max={walletBalance}
      />

      <TokenInput
        label="Borrow riseSOL"
        token="riseSOL"
        value={borrow}
        onChange={setBorrow}
        max={pricesLoaded && maxBorrow > 0 ? maxBorrow : undefined}
      />

      {pricesLoaded && currentLtv > 0 && (
        <div className={`rounded-xl border px-4 py-3 flex justify-between text-sm ${overLtv ? "border-red-800 bg-red-950" : "border-[#334155]"}`}>
          <span className="text-[#94A3B8]">Current LTV</span>
          <span className={`font-semibold ${overLtv ? "text-red-400" : "text-[#F1F5F9]"}`}>
            {currentLtv.toFixed(1)}% / {config?.ltv}% max
          </span>
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
