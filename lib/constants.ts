export const PROGRAM_IDS = {
  RISE_STAKING:    "BnQc6jJMT6mt3mvWuQFAd9vf2T2wWkAYD2uGjCXud6Lo",
  RISE_CDP:        "3snPJTuZP9XHNciH7Q5KZzsvk2doxpuoYqWXf8JofEPR",
  RISE_GOVERNANCE: "CtMKhgY5xKiwLB5jmQ44PRF9QsUqXqSbiyVbFsidskHz",
  RISE_REWARDS:    "8d3UidB3Ent4493deoozPYDC48XG2SRj7EdD7xW67uj8",
} as const;

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";

/**
 * The riseSOL SPL token mint address.
 * Set NEXT_PUBLIC_RISE_SOL_MINT after deploying the staking program.
 * At runtime this is also fetched from GlobalPool.rise_sol_mint, but the env
 * var is needed for the collateral selection UI before the pool is loaded.
 */
if (!process.env.NEXT_PUBLIC_RISE_SOL_MINT)
  throw new Error("NEXT_PUBLIC_RISE_SOL_MINT is not set in your .env.local");
export const RISE_SOL_MINT = process.env.NEXT_PUBLIC_RISE_SOL_MINT;

/** RISE governance token mint. Set NEXT_PUBLIC_RISE_MINT in .env.local. */
export const RISE_MINT =
  process.env.NEXT_PUBLIC_RISE_MINT ?? "2TysJ9Tw5WLh7hBLmC6iZp73bm6akogYEushJEf8K49Q";

export const TOKEN_SYMBOLS = {
  RISE_SOL: "riseSOL",
  RISE: "RISE",
  VE_RISE: "veRISE",
} as const;

/** Pyth price feed IDs (hex, no 0x prefix) keyed by collateral symbol. */
export const PYTH_FEED_IDS: Record<string, string> = {
  SOL:     "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  mSOL:    "c2289a6a43d2ce91c6f55caec370f4acc38a2ed477f58813334c6d03749ff2a4",
  JitoSOL: "67be9f519b95cf24338801051f9a808eff0a578ceaaa36102453d13a72b3c87b",
  wETH:    "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  wBTC:    "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  USDC:    "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  USDT:    "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
};

export const PYTH_HERMES_URL = "https://hermes.pyth.network";

/** Jupiter v6 program ID. */
export const JUPITER_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

/** Jupiter v6 shared-accounts authority PDA. */
export const JUPITER_PROGRAM_AUTHORITY = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";

/** Native SOL (Wrapped SOL) mint. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";
