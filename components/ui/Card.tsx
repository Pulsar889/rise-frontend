import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  goldBorder?: boolean;
  padding?: "sm" | "md" | "lg";
}

export function Card({ children, className = "", goldBorder = false, padding = "md" }: CardProps) {
  const pad = { sm: "p-3 sm:p-4", md: "p-4 sm:p-6", lg: "p-4 sm:p-6 md:p-8" }[padding];
  return (
    <div
      className={`bg-[#1E293B] rounded-2xl shadow-sm border transition-colors duration-200 ${
        goldBorder
          ? "border-[#60A5FA]"
          : "border-[#334155] hover:border-[#60A5FA]/40"
      } ${pad} ${className}`}
    >
      {children}
    </div>
  );
}
