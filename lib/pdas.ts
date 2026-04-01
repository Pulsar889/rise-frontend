import { PublicKey } from "@solana/web3.js";
import { PROGRAM_IDS, JUPITER_PROGRAM_ID } from "./constants";

export const CDP_PROGRAM_ID        = new PublicKey(PROGRAM_IDS.RISE_CDP);
export const STAKING_PROGRAM_ID    = new PublicKey(PROGRAM_IDS.RISE_STAKING);
export const GOVERNANCE_PROGRAM_ID = new PublicKey(PROGRAM_IDS.RISE_GOVERNANCE);
export const REWARDS_PROGRAM_ID    = new PublicKey(PROGRAM_IDS.RISE_REWARDS);

// ── Staking PDAs ─────────────────────────────────────────────────────────────

export function deriveGlobalPool(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_pool")],
    STAKING_PROGRAM_ID
  )[0];
}

export function derivePoolVault(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault")],
    STAKING_PROGRAM_ID
  )[0];
}

export function deriveTreasuryVault(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_vault")],
    STAKING_PROGRAM_ID
  )[0];
}

export function deriveProtocolTreasury(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_treasury")],
    STAKING_PROGRAM_ID
  )[0];
}

/** WithdrawalTicket PDA — one per unstake, keyed by owner + nonce. */
export function deriveWithdrawalTicket(owner: PublicKey, nonce: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("withdrawal_ticket"), owner.toBuffer(), Buffer.from([nonce])],
    STAKING_PROGRAM_ID
  )[0];
}

// ── CDP PDAs ──────────────────────────────────────────────────────────────────

export function deriveCdpConfig(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cdp_config")],
    CDP_PROGRAM_ID
  )[0];
}

export function deriveCdpFeeVault(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cdp_fee_vault")],
    CDP_PROGRAM_ID
  )[0];
}

export function deriveCollateralConfig(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("collateral_config"), mint.toBuffer()],
    CDP_PROGRAM_ID
  )[0];
}

export function deriveCollateralVault(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("collateral_vault"), mint.toBuffer()],
    CDP_PROGRAM_ID
  )[0];
}

export function derivePaymentConfig(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payment_config"), mint.toBuffer()],
    CDP_PROGRAM_ID
  )[0];
}

/**
 * CDP position PDA — one per borrower per nonce.
 * The nonce must be unique per borrower; increment it for each new position.
 */
export function deriveCdpPosition(owner: PublicKey, nonce: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cdp_position"), owner.toBuffer(), Buffer.from([nonce])],
    CDP_PROGRAM_ID
  )[0];
}

/** Protocol WSOL buffer — receives Jupiter's WSOL output, then closed to unwrap. */
export function deriveCdpWsolBuybackVault(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cdp_wsol_buyback_vault")],
    CDP_PROGRAM_ID
  )[0];
}

/** Protocol WSOL buffer — receives Jupiter's WSOL output, then closed to unwrap. */
export function deriveCdpWsolVault(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cdp_wsol_vault")],
    CDP_PROGRAM_ID
  )[0];
}

/** Jupiter v6 event authority PDA. */
export function deriveJupiterEventAuthority(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    new PublicKey(JUPITER_PROGRAM_ID)
  )[0];
}

// ── Governance PDAs ───────────────────────────────────────────────────────────

export function deriveGovernanceConfig(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("governance_config")],
    GOVERNANCE_PROGRAM_ID
  )[0];
}

/** RISE token vault held by the governance program (seeds: ["rise_vault"]). */
export function deriveRiseVaultGov(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("rise_vault")],
    GOVERNANCE_PROGRAM_ID
  )[0];
}

/** VeLock PDA — one per user per nonce. Closed (account reclaimed) on unlock. */
export function deriveVeLock(owner: PublicKey, nonce: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ve_lock"), owner.toBuffer(), Buffer.from([nonce])],
    GOVERNANCE_PROGRAM_ID
  )[0];
}

/** GaugeVote PDA — one per user, init_if_needed. */
export function deriveGaugeVotePda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gauge_vote"), owner.toBuffer()],
    GOVERNANCE_PROGRAM_ID
  )[0];
}

/**
 * Proposal PDA — keyed by 0-based u64 index stored as 8-byte little-endian.
 * Matches: seeds = [b"proposal", &config.proposal_count.to_le_bytes()]
 */
export function deriveProposal(index: number): PublicKey {
  const indexBuf = Buffer.alloc(8);
  indexBuf.writeBigUInt64LE(BigInt(index));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), indexBuf],
    GOVERNANCE_PROGRAM_ID
  )[0];
}

/** VoteRecord PDA — one per (voter, proposal) pair. */
export function deriveVoteRecord(voter: PublicKey, proposal: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote_record"), voter.toBuffer(), proposal.toBuffer()],
    GOVERNANCE_PROGRAM_ID
  )[0];
}

// ── Rewards PDAs ──────────────────────────────────────────────────────────────

export function deriveRewardsConfig(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("rewards_config")],
    REWARDS_PROGRAM_ID
  )[0];
}

/** Gauge PDA — one per liquidity pool, keyed by the pool pubkey. */
export function deriveGaugePda(pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gauge"), pool.toBuffer()],
    REWARDS_PROGRAM_ID
  )[0];
}

/**
 * UserStake PDA — one per (user, gauge) pair.
 * Second seed is the gauge PDA address (not the pool).
 */
export function deriveUserStake(user: PublicKey, gauge: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user_stake"), user.toBuffer(), gauge.toBuffer()],
    REWARDS_PROGRAM_ID
  )[0];
}

/** LP token vault for a gauge — holds deposited LP tokens; seeded by pool pubkey. */
export function deriveGaugeLpVault(pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gauge_lp_vault"), pool.toBuffer()],
    REWARDS_PROGRAM_ID
  )[0];
}

/** RISE token vault from which rewards are paid out. */
export function deriveRewardsVault(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("rewards_vault")],
    REWARDS_PROGRAM_ID
  )[0];
}
