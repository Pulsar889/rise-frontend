"use client";
import Link from "next/link";
import Image from "next/image";
import { Nunito } from "next/font/google";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { WalletButton } from "./WalletButton";

const nunito = Nunito({ weight: "900", subsets: ["latin"] });

const NAV_LINKS = [
  { href: "/dashboard",  label: "Dashboard"  },
  { href: "/stake",      label: "Stake"       },
  { href: "/borrow",     label: "Borrow"      },
  { href: "/governance", label: "Governance"  },
  { href: "/about",      label: "About"       },
  { href: "/rewards",    label: "Rewards"     },
];

export function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-[#334155] bg-[#0F172A]/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-4">

        {/* Logo */}
        <Link href="/about" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Rise" width={36} height={36} className="rounded-full" />
          <span className={`${nunito.className} text-xl sm:text-2xl tracking-widest uppercase text-[#60A5FA]`}>Rise</span>
        </Link>

        {/* Desktop nav links */}
        <ul className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`relative px-4 py-2 text-sm font-medium transition-colors rounded-full ${
                    active ? "text-[#60A5FA]" : "text-[#94A3B8] hover:text-[#F1F5F9]"
                  }`}
                >
                  {label}
                  {active && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#60A5FA]" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Right side: wallet button + hamburger */}
        <div className="flex items-center gap-2">
          <WalletButton />
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            className="md:hidden flex items-center justify-center h-10 w-10 rounded-xl text-[#94A3B8] hover:bg-[#334155] transition-colors"
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <rect y="3" width="20" height="2" rx="1" />
                <rect y="9" width="20" height="2" rx="1" />
                <rect y="15" width="20" height="2" rx="1" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile slide-down menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-[#334155] bg-[#0F172A]/95 backdrop-blur-md">
          <ul className="flex flex-col px-4 py-3 gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center px-4 py-3 text-base font-medium rounded-xl transition-colors ${
                      active
                        ? "text-[#60A5FA] bg-[#1E3A5F]"
                        : "text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1E293B]"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </header>
  );
}
