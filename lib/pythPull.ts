/**
 * Browser-compatible Pyth pull-oracle helper.
 *
 * Posts a PriceUpdateV2 account on-chain via the Pyth Solana Receiver's
 * postUpdateAtomic instruction, then returns the keypair whose public key
 * must be passed as `price_update` / `sol_price_update` in CDP instructions.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { PYTH_HERMES_URL } from "@/lib/constants";

export const PYTH_RECEIVER_PROGRAM_ID = new PublicKey(
  "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"
);

// postUpdateAtomic discriminator: sha256("global:post_update_atomic")[0..8]
const POST_UPDATE_ATOMIC_DISCRIMINATOR = Buffer.from([49, 172, 84, 192, 175, 180, 52, 234]);

// Treasury config PDA — seeds: ["config"]
const [TREASURY_CONFIG_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  PYTH_RECEIVER_PROGRAM_ID
);

/** Fetch the Wormhole program ID from the Pyth Receiver config account on-chain. */
async function getWormholeProgram(connection: Connection): Promise<PublicKey> {
  const info = await connection.getAccountInfo(TREASURY_CONFIG_PDA);
  if (!info) throw new Error("Pyth Receiver config account not found");
  const data = info.data;
  // Layout: 8-byte discriminator, 32-byte governance_authority,
  //         Option<Pubkey> target_governance_authority (1 + optional 32), 32-byte wormhole
  const optTag = data[40];
  const wormholeOffset = optTag === 1 ? 73 : 41;
  return new PublicKey(data.slice(wormholeOffset, wormholeOffset + 32));
}

/** Fetch the latest AccumulatorUpdateData blob from Hermes for a single feed. */
async function fetchHermesBinary(feedIdHex: string): Promise<Buffer> {
  const url = `${PYTH_HERMES_URL}/v2/updates/price/latest?ids[]=${feedIdHex}&encoding=hex&parsed=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Hermes fetch failed: ${res.status}`);
  const json = await res.json();
  const hex: string = json.binary?.data?.[0];
  if (!hex) throw new Error("Hermes response missing binary.data[0]");
  return Buffer.from(hex, "hex");
}

/**
 * Parse AccumulatorUpdateData binary and return (vaa, message, proof) for the
 * first price update in the blob.
 */
function parseAccumulatorUpdate(buf: Buffer): {
  vaa: Buffer;
  message: Buffer;
  proof: Buffer[];
  guardianSetIndex: number;
} {
  let offset = 0;

  const magic = buf.slice(offset, offset + 4).toString("ascii");
  if (magic !== "PNAU") throw new Error(`Bad magic: ${magic}`);
  offset += 4;

  // version (major, minor, trailing_hdr, proof_type)
  offset += 4;

  const vaaLen = buf.readUInt16BE(offset); offset += 2;
  const vaa = buf.slice(offset, offset + vaaLen); offset += vaaLen;

  // Wormhole VAA v1: version(1) + guardian_set_index(4 BE) + ...
  const guardianSetIndex = vaa.readUInt32BE(1);

  const numUpdates = buf.readUInt8(offset); offset += 1;
  if (numUpdates === 0) throw new Error("No updates in blob");

  const msgLen = buf.readUInt16BE(offset); offset += 2;
  const message = buf.slice(offset, offset + msgLen); offset += msgLen;

  const proofDepth = buf.readUInt8(offset); offset += 1;
  const proof: Buffer[] = [];
  for (let i = 0; i < proofDepth; i++) {
    proof.push(buf.slice(offset, offset + 20)); offset += 20;
  }

  return { vaa, message, proof, guardianSetIndex };
}

function borshBytes(data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length, 0);
  return Buffer.concat([len, data]);
}

function borshProof(nodes: Buffer[]): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(nodes.length, 0);
  return Buffer.concat([lenBuf, ...nodes]);
}

/**
 * Build a postUpdateAtomic TransactionInstruction and a fresh PriceUpdateV2 keypair.
 * The instruction must appear BEFORE the CDP instruction in the same transaction.
 */
export async function buildPriceUpdateIx(
  connection: Connection,
  payer: PublicKey,
  feedIdHex: string,
): Promise<{ keypair: Keypair; instruction: TransactionInstruction }> {
  const [blob, wormholeProgram] = await Promise.all([
    fetchHermesBinary(feedIdHex),
    getWormholeProgram(connection),
  ]);

  const { vaa, message, proof, guardianSetIndex } = parseAccumulatorUpdate(blob);

  const priceUpdateKeypair = Keypair.generate();

  const params = Buffer.concat([
    borshBytes(vaa),
    borshBytes(message),
    borshProof(proof),
    Buffer.from([0]), // treasury_id = 0
  ]);

  const data = Buffer.concat([POST_UPDATE_ATOMIC_DISCRIMINATOR, params]);

  const guardianSetIndexBuf = Buffer.alloc(4);
  guardianSetIndexBuf.writeUInt32BE(guardianSetIndex, 0);

  const [guardianSet] = PublicKey.findProgramAddressSync(
    [Buffer.from("GuardianSet"), guardianSetIndexBuf],
    wormholeProgram
  );

  const [treasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), Buffer.from([0])],
    PYTH_RECEIVER_PROGRAM_ID
  );

  const instruction = new TransactionInstruction({
    programId: PYTH_RECEIVER_PROGRAM_ID,
    keys: [
      { pubkey: payer,                        isSigner: true,  isWritable: true  },
      { pubkey: guardianSet,                  isSigner: false, isWritable: false },
      { pubkey: TREASURY_CONFIG_PDA,          isSigner: false, isWritable: false },
      { pubkey: treasury,                     isSigner: true,  isWritable: true  },
      { pubkey: priceUpdateKeypair.publicKey, isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId,      isSigner: false, isWritable: false },
      { pubkey: payer,                        isSigner: true,  isWritable: true  }, // write_authority
    ],
    data,
  });

  return { keypair: priceUpdateKeypair, instruction };
}

/**
 * Build price update instructions for both collateral and SOL feeds.
 * Returns keypairs and instructions ready to prepend to any CDP transaction.
 */
export async function buildCdpPriceUpdateIxs(
  connection: Connection,
  payer: PublicKey,
  collateralFeedIdHex: string,
  solFeedIdHex = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
): Promise<{
  priceUpdateKeypair: Keypair;
  solPriceUpdateKeypair: Keypair;
  priceUpdateIx: TransactionInstruction;
  solPriceUpdateIx: TransactionInstruction;
}> {
  const [collateral, sol] = await Promise.all([
    buildPriceUpdateIx(connection, payer, collateralFeedIdHex),
    buildPriceUpdateIx(connection, payer, solFeedIdHex),
  ]);
  return {
    priceUpdateKeypair:    collateral.keypair,
    solPriceUpdateKeypair: sol.keypair,
    priceUpdateIx:         collateral.instruction,
    solPriceUpdateIx:      sol.instruction,
  };
}
