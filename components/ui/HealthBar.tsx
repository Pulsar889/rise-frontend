interface HealthBarProps {
  value: number; // 1.0 – 3.0+ range
  showLabel?: boolean;
}

function getHealthColors(value: number) {
  if (value >= 1.5) return { bar: "bg-emerald-500", text: "text-emerald-400", label: "Healthy" };
  if (value >= 1.2) return { bar: "bg-amber-400",   text: "text-amber-400",   label: "At Risk" };
  return              { bar: "bg-red-500",     text: "text-red-400",     label: "Danger"  };
}

export function HealthBar({ value, showLabel = true }: HealthBarProps) {
  const colors = getHealthColors(value);
  const pct = Math.min((value / 3) * 100, 100);

  return (
    <div className="flex flex-col gap-1.5">
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#94A3B8] uppercase tracking-wider">Health Factor</span>
          <span className={`text-sm font-semibold tabular-nums ${colors.text}`}>
            {value.toFixed(2)} — {colors.label}
          </span>
        </div>
      )}
      <div className="h-1.5 bg-[#334155] rounded-full overflow-hidden">
        <div
          className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
