/**
 * Browser-compatible Pyth pull-oracle helper using the official SDK.
 *
 * The hand-crafted postUpdateAtomic approach hit Solana's 1232-byte
 * transaction size limit (~1318 bytes of instruction data alone).
 * The SDK splits posting and consumption into separate versioned
 * transactions automatically, sidestepping the size constraint.
 */

import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  PythSolanaReceiver,
  InstructionWithEphemeralSigners,
} from "@pythnetwork/pyth-solana-receiver";
import { PYTH_HERMES_URL } from "@/lib/constants";

/**
 * Fetch base64-encoded AccumulatorUpdateData blobs from Hermes.
 * Returns one string per feed ID in the same order as `feedIds`.
 */
async function fetchPriceUpdateData(feedIds: string[]): Promise<string[]> {
  const params = feedIds.map((id) => `ids[]=${id}`).join("&");
  const url = `${PYTH_HERMES_URL}/v2/updates/price/latest?${params}&encoding=base64&parsed=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Hermes fetch failed: ${res.status}`);
  const json = await res.json();
  const data: string[] | undefined = json.binary?.data;
  if (!data || data.length === 0) throw new Error("Hermes returned no price update data");
  return data;
}

/**
 * Build, sign, and send transactions that:
 *   1. Post fresh PriceUpdateV2 accounts for the collateral and SOL feeds.
 *   2. Execute the CDP instruction(s) returned by `buildConsumer`.
 *   3. Close the temporary price update accounts to recover rent.
 *
 * `feedIds.collateral` and `feedIds.sol` are raw hex strings (no 0x prefix).
 * Inside `buildConsumer`, call `getPriceUpdateAccount("0x" + feedHex)` to
 * obtain the ephemeral account address for each feed.
 */
export async function sendWithPriceUpdates(
  provider: AnchorProvider,
  feedIds: { collateral: string; sol: string },
  buildConsumer: (
    getPriceUpdateAccount: (feedId: string) => PublicKey,
  ) => Promise<InstructionWithEphemeralSigners[]>,
): Promise<void> {
  const pythReceiver = new PythSolanaReceiver({
    connection: provider.connection,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wallet: provider.wallet as any,
  });

  const uniqueIds = [...new Set([feedIds.collateral, feedIds.sol])];
  const priceUpdateData = await fetchPriceUpdateData(uniqueIds);

  const builder = pythReceiver.newTransactionBuilder({ closeUpdateAccounts: true });
  await builder.addPostPriceUpdates(priceUpdateData);
  await builder.addPriceConsumerInstructions(buildConsumer);

  const txsWithSigners = await builder.buildVersionedTransactions({
    computeUnitPriceMicroLamports: 50_000,
    tightComputeBudget: true,
  });

  const { blockhash, lastValidBlockHeight } =
    await provider.connection.getLatestBlockhash();

  for (const { tx, signers } of txsWithSigners) {
    tx.message.recentBlockhash = blockhash;
    if (signers.length > 0) tx.sign(signers);
    const signedTx = await provider.wallet.signTransaction(tx);
    const raw = signedTx.serialize();
    const sig = await provider.connection.sendRawTransaction(raw, {
      skipPreflight: false,
    });
    await provider.connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
  }
}
