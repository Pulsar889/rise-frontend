import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24">

      {/* Hero */}
      <div className="mb-16 text-center">
        <h1 className="text-4xl sm:text-6xl font-bold text-[#F1F5F9] mb-6 tracking-tight">
          Built for <span className="text-[#60A5FA]">Solana.</span>
          <br />Designed for everyone.
        </h1>
        <p className="text-lg sm:text-xl text-[#94A3B8] max-w-2xl mx-auto leading-relaxed">
          RISE is a DeFi protocol on the Solana Blockchain that lets you compound staking
          rewards AND lending yields. Stake it, borrow against it, govern it, and earn from it.
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-16">

        <Link href="/stake" className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 hover:border-[#60A5FA] transition-colors">
          <div className="text-2xl mb-3">⚡</div>
          <h2 className="text-lg font-semibold text-[#F1F5F9] mb-2">Liquid Staking</h2>
          <p className="text-[#94A3B8] text-sm leading-relaxed">
            Stake SOL and receive riseSOL, a value-accruing token that grows in exchange rate
            as validator rewards flow in. Your balance stays fixed while its worth increases.
          </p>
        </Link>

        <Link href="/borrow" className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 hover:border-[#60A5FA] transition-colors">
          <div className="text-2xl mb-3">🏦</div>
          <h2 className="text-lg font-semibold text-[#F1F5F9] mb-2">Borrow</h2>
          <p className="text-[#94A3B8] text-sm leading-relaxed">
            Deposit collateral and borrow riseSOL without selling your assets. A kinked interest
            rate model keeps borrowing costs predictable and the system solvent.
          </p>
        </Link>

        <Link href="/governance" className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 hover:border-[#60A5FA] transition-colors">
          <div className="text-2xl mb-3">🗳️</div>
          <h2 className="text-lg font-semibold text-[#F1F5F9] mb-2">Governance</h2>
          <p className="text-[#94A3B8] text-sm leading-relaxed">
            Lock RISE tokens to receive veRISE, vote on proposals, direct liquidity emissions
            through gauge voting, and earn a share of protocol revenue.
          </p>
        </Link>

        <Link href="/rewards" className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 hover:border-[#60A5FA] transition-colors">
          <div className="text-2xl mb-3">🌱</div>
          <h2 className="text-lg font-semibold text-[#F1F5F9] mb-2">Rewards</h2>
          <p className="text-[#94A3B8] text-sm leading-relaxed">
            Provide liquidity to Rise-paired pools and stake your LP tokens to earn RISE
            emissions. Gauges distribute rewards weekly based on veRISE votes.
          </p>
        </Link>

      </div>

      {/* How it fits together */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-8 mb-16">
        <h2 className="text-xl font-semibold text-[#F1F5F9] mb-4">How it fits together</h2>
        <p className="text-[#94A3B8] leading-relaxed mb-4">
          Every part of Rise reinforces the others. Staking generates riseSOL, which backs
          CDP borrowing. Interest paid by borrowers flows back to stakers, raising the riseSOL
          exchange rate. Protocol fees are allocated to veRISE holders, so governance
          participants are directly rewarded for keeping the system healthy.
        </p>
        <p className="text-[#94A3B8] leading-relaxed">
          The result is a self-reinforcing flywheel: more stakers means more liquidity,
          more liquidity enables more borrowing, more borrowing generates more fees,
          more fees attract more governance participation.
        </p>
      </div>

      {/* CTA */}
      <div className="text-center">
        <p className="text-[#94A3B8] mb-6">Ready to get started?</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/stake"
            className="w-full sm:w-auto px-8 py-3 rounded-full bg-[#60A5FA] text-[#0F172A] font-semibold hover:bg-[#93C5FD] transition-colors"
          >
            Start Staking
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-8 py-3 rounded-full border border-[#334155] text-[#94A3B8] hover:text-[#F1F5F9] hover:border-[#60A5FA] transition-colors"
          >
            View Dashboard
          </Link>
        </div>
      </div>

    </div>
  );
}
