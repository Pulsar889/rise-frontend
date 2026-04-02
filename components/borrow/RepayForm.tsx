"use client";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { TokenInput } from "@/components/ui/TokenInput";
import { CdpPosition, useCdp } from "@/hooks/useCdp";
import { useStaking } from "@/hooks/useStaking";

interface PaymentOption {
  symbol: string;
  note?: string; // shown as a small hint when selected
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { symbol: "SOL" },
  { symbol: "riseSOL", note: "Burned 1:1 against debt — no swap needed" },
  { symbol: "USDC",    note: "Swapped to SOL via Jupiter on-chain" },
  { symbol: "USDT",    note: "Swapped to SOL via Jupiter on-chain" },
  { symbol: "wETH",    note: "Swapped to SOL via Jupiter on-chain" },
  { symbol: "wBTC",    note: "Swapped to SOL via Jupiter on-chain" },
];

interface RepayFormProps {
  position: CdpPosition;
  debtRiseSol: number;
}

export function RepayForm({ position, debtRiseSol }: RepayFormProps) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("SOL");
  const { publicKey } = useWallet();
  const { repayDebt, loading, collaterals } = useCdp();
  const { data: staking } = useStaking();

  const selected = PAYMENT_OPTIONS.find((o) => o.symbol === currency)!;
  const isConvert = currency !== "SOL" && currency !== "riseSOL";

  const solPrice = collaterals.find((c) => c.symbol === "SOL")?.priceUsd ?? 0;

  // Max enforced only for direct repay currencies (no over-repay makes sense there)
  const maxAmount = (() => {
    if (currency === "riseSOL") return debtRiseSol;
    if (currency === "SOL") return debtRiseSol * staking.exchangeRate;
    return undefined; // convert currencies: no cap, excess is refunded as SOL
  })();

  // Exact amount in the selected currency needed to fully repay the debt
  const fullRepayAmount = (() => {
    if (currency === "riseSOL") return debtRiseSol;
    if (currency === "SOL") return debtRiseSol * staking.exchangeRate;
    const tokenPrice = collaterals.find((c) => c.symbol === currency)?.priceUsd;
    if (!tokenPrice || !solPrice) return null;
    return (debtRiseSol * staking.exchangeRate * solPrice) / tokenPrice;
  })();

  const num = parseFloat(amount);
  const isOverMax = maxAmount !== undefined && num > maxAmount;

  const estimate = (() => {
    if (!isConvert || !amount || num <= 0) return null;
    const tokenPrice = collaterals.find((c) => c.symbol === currency)?.priceUsd;
    if (!tokenPrice || !solPrice) return null;
    const inputUsd = num * tokenPrice;
    const solAmount = inputUsd / solPrice;
    const risesolRepaid = solAmount / staking.exchangeRate;
    const excessSol = risesolRepaid > debtRiseSol
      ? (risesolRepaid - debtRiseSol) * staking.exchangeRate
      : 0;
    return { inputUsd, solAmount, risesolRepaid, excessSol };
  })();

  async function handleRepay() {
    if (!num || num <= 0 || isOverMax) return;
    await repayDebt(position, num, currency);
    setAmount("");
  }

  return (
    <div className="flex flex-col gap-4 border-t border-[#334155] pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#F1F5F9]">Repay Debt</p>
        {fullRepayAmount !== null && (
          <button
            type="button"
            onClick={() => setAmount(fullRepayAmount.toFixed(6))}
            className="text-xs font-medium text-[#60A5FA] hover:text-[#2563EB] transition-colors"
          >
            Repay in full
          </button>
        )}
      </div>

      {/* Currency selector */}
      <div className="flex flex-wrap gap-2">
        {PAYMENT_OPTIONS.map(({ symbol }) => (
          <button
            key={symbol}
            onClick={() => { setCurrency(symbol); setAmount(""); }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
              currency === symbol
                ? "border-[#60A5FA] bg-[#1E3A5F] text-[#60A5FA]"
                : "border-[#334155] text-[#64748B] hover:border-[#60A5FA]/50"
            }`}
          >
            {symbol}
          </button>
        ))}
      </div>

      {/* Conversion hint */}
      {selected.note && (
        <p className="text-xs text-[#94A3B8]">{selected.note}</p>
      )}

      <TokenInput
        token={currency}
        value={amount}
        onChange={setAmount}
        max={maxAmount}
      />
      {isOverMax && (
        <p className="text-xs text-red-500 font-medium">
          Amount exceeds your debt. Max: {maxAmount!.toFixed(4)} {currency}
        </p>
      )}

      {/* Convert & Repay estimate */}
      {isConvert && (
        <div className="rounded-xl bg-[#1E293B] border border-[#334155] px-4 py-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">Conversion Estimate</p>
          {estimate ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[#94A3B8]">≈ USD value</span>
                <span className="font-medium">${estimate.inputUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#94A3B8]">≈ SOL after swap</span>
                <span className="font-medium">{estimate.solAmount.toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between text-sm border-t border-[#334155] pt-2">
                <span className="text-[#94A3B8]">Debt repaid</span>
                <span className="font-semibold text-[#F1F5F9]">
                  {Math.min(estimate.risesolRepaid, debtRiseSol).toFixed(4)} riseSOL
                </span>
              </div>
              {estimate.excessSol > 0 ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#94A3B8]">SOL returned to you</span>
                    <span className="font-semibold text-emerald-600">{estimate.excessSol.toFixed(4)} SOL</span>
                  </div>
                  <p className="text-xs text-emerald-600 font-medium">Position fully repaid — excess refunded as SOL</p>
                </>
              ) : estimate.risesolRepaid >= debtRiseSol && (
                <p className="text-xs text-emerald-600 font-medium">This will fully repay your position</p>
              )}
            </>
          ) : (
            <p className="text-sm text-[#94A3B8]">Enter an amount to see the estimate</p>
          )}
        </div>
      )}

      <button
        onClick={handleRepay}
        disabled={loading || !publicKey || !amount || num <= 0 || isOverMax}
        className="w-full rounded-full bg-[#F1F5F9] py-3 text-sm font-semibold text-[#0F172A] hover:bg-[#CBD5E1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Repaying…" : isConvert ? `Convert & Repay with ${currency}` : `Repay with ${currency}`}
      </button>
    </div>
  );
}
