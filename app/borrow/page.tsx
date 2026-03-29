"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { PositionCard } from "@/components/borrow/PositionCard";
import { OpenPositionForm } from "@/components/borrow/OpenPositionForm";
import { useCdp } from "@/hooks/useCdp";

export default function BorrowPage() {
  const [showOpen, setShowOpen] = useState(false);
  const { positions, collaterals } = useCdp();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 sm:mb-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#F1F5F9]">Borrow</h1>
          <p className="mt-1 text-[#94A3B8]">Deposit collateral to borrow riseSOL against it</p>
        </div>
        <button
          onClick={() => setShowOpen(!showOpen)}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
            showOpen
              ? "bg-[#334155] text-[#94A3B8] hover:bg-[#475569]"
              : "bg-[#60A5FA] text-[#F0F9FF] hover:bg-[#3B82F6]"
          }`}
        >
          {showOpen ? "Cancel" : "+ Open Position"}
        </button>
      </div>

      {/* Open position form */}
      {showOpen && (
        <div className="mb-8">
          <Card padding="lg">
            <h2 className="font-semibold text-[#F1F5F9] mb-5">Open New Position</h2>
            <OpenPositionForm />
          </Card>
        </div>
      )}

      {/* Existing positions */}
      {positions.length > 0 && (
        <div className="mb-10">
          <h2 className="font-semibold text-[#F1F5F9] mb-4">Your Positions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {positions.map((position) => (
              <PositionCard key={position.id} position={position} />
            ))}
          </div>
        </div>
      )}

      {positions.length === 0 && !showOpen && (
        <Card>
          <div className="py-16 text-center">
            <p className="text-[#94A3B8] text-base mb-4">No open positions</p>
            <button
              onClick={() => setShowOpen(true)}
              className="rounded-full bg-[#60A5FA] px-6 py-3 text-sm font-semibold text-[#F0F9FF] hover:bg-[#3B82F6] transition-colors"
            >
              Open your first position
            </button>
          </div>
        </Card>
      )}

      {/* Collateral info */}
      <div className="mt-6">
        <h2 className="font-semibold text-[#F1F5F9] mb-4">Accepted Collateral</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {collaterals.map((c) => (
            <Card key={c.symbol}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-[#334155] flex items-center justify-center text-sm font-bold text-[#94A3B8]">
                    {c.symbol[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-[#F1F5F9]">{c.symbol}</p>
                    <p className="text-xs text-[#94A3B8]">{c.name}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center border-t border-[#334155] pt-3">
                  <div>
                    <p className="text-xs text-[#94A3B8]">Max LTV</p>
                    <p className="text-sm font-semibold text-[#F1F5F9]">{c.ltv}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#94A3B8]">Liquidation</p>
                    <p className="text-sm font-semibold text-[#F1F5F9]">{c.liquidationThreshold}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#94A3B8]">Price</p>
                    <p className="text-sm font-semibold text-[#F1F5F9]">${c.priceUsd}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
