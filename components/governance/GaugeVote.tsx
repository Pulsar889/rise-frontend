"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { useGovernance } from "@/hooks/useGovernance";

export function GaugeVote() {
  const { gauges, locks, setGaugeWeights, loadingGauge: loading } = useGovernance();
  const hasActiveLock = locks.some((l) => l.expiresAt > new Date());
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && gauges.length > 0) {
      setWeights(Object.fromEntries(gauges.map((g) => [g.id, g.myWeight])));
      setInitialized(true);
    }
  }, [gauges, initialized]);

  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  const valid = Math.abs(total - 100) < 0.01;

  function update(id: string, value: number) {
    setWeights((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit() {
    if (!valid) return;
    await setGaugeWeights(weights);
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[#F1F5F9]">Gauge Votes</h3>
          <span className={`text-sm font-medium tabular-nums ${valid ? "text-emerald-400" : "text-[#94A3B8]"}`}>
            {total}% / 100%
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {gauges.map((gauge) => (
            <div key={gauge.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-[#F1F5F9]">{gauge.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#94A3B8]">Protocol {gauge.weight}%</span>
                  <span className="font-semibold text-[#60A5FA] tabular-nums w-10 text-right">
                    {weights[gauge.id]}%
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={weights[gauge.id]}
                onChange={(e) => update(gauge.id, parseInt(e.target.value))}
                className="w-full accent-[#60A5FA] h-5 cursor-pointer"
              />
              <div className="h-1 bg-[#334155] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#60A5FA] rounded-full"
                  style={{ width: `${weights[gauge.id]}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {!hasActiveLock && (
          <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">You need an active veRISE lock to vote on gauges.</p>
        )}
        {hasActiveLock && !valid && (
          <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">Weights must sum to exactly 100%.</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !valid || !hasActiveLock}
          className="w-full rounded-full bg-[#60A5FA] py-3 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Submitting…" : "Submit Gauge Votes"}
        </button>
      </div>
    </Card>
  );
}
