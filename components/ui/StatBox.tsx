import { ReactNode } from "react";

interface StatBoxProps {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: boolean;
}

export function StatBox({ label, value, sub, accent = false }: StatBoxProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-[#94A3B8]">{label}</span>
      <span
        className={`text-2xl sm:text-3xl font-semibold tabular-nums leading-tight ${
          accent ? "text-[#60A5FA]" : "text-[#F1F5F9]"
        }`}
      >
        {value}
      </span>
      {sub && <span className="text-sm text-[#94A3B8]">{sub}</span>}
    </div>
  );
}
