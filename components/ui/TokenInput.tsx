"use client";

interface TokenInputProps {
  label?: string;
  token: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
}

export function TokenInput({
  label,
  token,
  value,
  onChange,
  max,
  placeholder = "0.00",
  disabled,
}: TokenInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium tracking-wide text-[#94A3B8]">
          {label}
        </label>
      )}
      <div className="flex items-center gap-3 rounded-xl border border-[#334155] bg-[#1E293B] px-4 py-3 min-h-[44px] focus-within:border-[#60A5FA] transition-colors">
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent text-lg font-medium text-[#F1F5F9] outline-none placeholder:text-[#475569] tabular-nums disabled:opacity-50"
        />
        <span className="shrink-0 rounded-full bg-[#334155] px-3 py-1 text-sm font-semibold text-[#F1F5F9]">
          {token}
        </span>
      </div>
      {max !== undefined && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onChange(max.toFixed(6))}
            className="text-xs text-[#60A5FA] hover:text-[#2563EB] font-medium"
          >
            MAX: {max.toFixed(4)}
          </button>
        </div>
      )}
    </div>
  );
}
