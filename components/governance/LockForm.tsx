"use client";
import { useState } from "react";
import { TokenInput } from "@/components/ui/TokenInput";
import { useGovernance } from "@/hooks/useGovernance";

const MAX_WEEKS = 208; // 4 years

export function LockForm() {
  const [amount, setAmount] = useState("");
  const [Weeks, setWeeks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { lockRise, loadingLock: loading, riseBalance } = useGovernance();

  const num = parseFloat(amount) || 0;
  const WeeksNum = parseInt(Weeks) || 0;
  const WeeksValid = WeeksNum >= 1 && WeeksNum <= MAX_WEEKS;

  // Multiplier scales linearly: 52 Weeks = 1x, 208 Weeks = 4x
  const multiplier = WeeksValid ? (WeeksNum / 52) : 0;
  const veRiseReceived = num > 0 && WeeksValid ? (num * multiplier).toFixed(2) : "0.00";

  function handleWeeksChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val === "" || /^\d+$/.test(val)) setWeeks(val);
  }

  async function handleLock() {
    if (num <= 0 || !WeeksValid) return;
    setError(null);
    setSuccess(false);
    try {
      await lockRise(num, WeeksNum * 7);
      setAmount("");
      setWeeks("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <TokenInput
        label="Lock RISE"
        token="RISE"
        value={amount}
        onChange={setAmount}
        max={riseBalance}
      />

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium tracking-wide text-[#94A3B8]">
            Lock Duration (Weeks)
          </label>
          <span className="text-xs text-[#94A3B8]">Max {MAX_WEEKS} Weeks (4 years)</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[#334155] bg-[#1E293B] px-4 py-3 min-h-[44px] focus-within:border-[#60A5FA] transition-colors">
          <input
            type="number"
            min={1}
            max={MAX_WEEKS}
            value={Weeks}
            onChange={handleWeeksChange}
            placeholder="e.g. 52"
            className="flex-1 bg-transparent text-lg font-medium text-[#F1F5F9] outline-none placeholder:text-[#475569] tabular-nums"
          />
          <span className="shrink-0 rounded-full bg-[#334155] px-3 py-1 text-sm font-semibold text-[#F1F5F9]">
            Weeks
          </span>
        </div>
        {Weeks !== "" && !WeeksValid && (
          <p className="text-xs text-red-400 mt-1.5">Enter a value between 1 and {MAX_WEEKS} Weeks</p>
        )}
      </div>

      <div className="rounded-xl bg-[#1E293B] border border-[#334155] px-4 py-4 flex flex-col gap-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-[#94A3B8]">You receive</span>
          <span className="font-semibold text-[#F1F5F9] tabular-nums">{veRiseReceived} veRISE</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#8C8880]">Power multiplier</span>
          <span className="font-medium text-[#60A5FA]">{WeeksValid ? multiplier.toFixed(2) : "—"}×</span>
        </div>
      </div>

      {riseBalance === 0 && (
        <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">You have no RISE to lock.</p>
      )}

      {success && (
        <p className="text-sm font-medium text-emerald-400">RISE locked successfully!</p>
      )}
      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2 break-all">{error}</p>
      )}

      <button
        onClick={handleLock}
        disabled={loading || num <= 0 || !WeeksValid || riseBalance === 0}
        className="w-full rounded-full bg-[#60A5FA] py-3.5 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Locking…" : "Lock RISE"}
      </button>
    </div>
  );
}
