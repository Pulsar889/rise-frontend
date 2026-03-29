"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { VeNft } from "@/hooks/useGovernance";

interface LockCardProps {
  lock: VeNft;
  onUnlock: (lockId: string) => Promise<void>;
  loading: boolean;
}

export function LockCard({ lock, onUnlock, loading }: LockCardProps) {
  const [earlyWarning, setEarlyWarning] = useState(false);
  const expired = lock.expiresAt <= new Date();

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#8C8880] tracking-wider">veRISE Lock #{lock.lockNumber}</p>
        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${expired ? "bg-amber-950 text-amber-400" : "bg-[#1E3A5F] text-[#60A5FA]"}`}>
          {expired ? "Expired" : "Active"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-[#94A3B8] mb-0.5">Locked RISE</p>
          <p className="font-semibold text-[#F1F5F9]">{lock.lockedRise.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-[#94A3B8] mb-0.5">veRISE Power</p>
          <p className="font-semibold text-[#60A5FA]">{lock.veRisePower.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-[#94A3B8] mb-0.5">Duration</p>
          <p className="font-semibold text-[#F1F5F9]">{lock.lockWeeks} Weeks</p>
        </div>
        <div>
          <p className="text-xs text-[#94A3B8] mb-0.5">{expired ? "Expired" : "Expires"}</p>
          <p className="font-semibold text-[#F1F5F9]">
            {lock.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
      </div>

      <button
        onClick={() => expired ? onUnlock(lock.id) : setEarlyWarning(true)}
        disabled={loading}
        className={`w-full rounded-full py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
          expired
            ? "bg-[#60A5FA] text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40"
            : "bg-[#60A5FA]/40 text-[#F0F9FF] cursor-not-allowed"
        }`}
      >
        {loading ? "Unlocking…" : "Unlock RISE"}
      </button>

      {earlyWarning && !expired && (
        <p className="text-xs text-amber-400 text-center -mt-2">
          Available on {lock.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      )}
    </Card>
  );
}
