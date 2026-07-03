---
title: "SIGHASH_ANYPREVOUT on Signet: When Signatures Stop Binding to UTXOs"
subtitle: "Standard CHECKSIG asks: did you sign for this UTXO?"
tags: [bitcoin]
canonical_url: "https://medium.com/@aaron.recompile/sighash-anyprevout-on-signet-when-signatures-stop-binding-to-utxos-eed4fc475668"
published: false
---

> *Standard CHECKSIG asks: did you sign for ****this UTXO****?*

> *ANYPREVOUT asks: did you sign for ****this kind of UTXO****?*

> A signature normally says: “I authorize spending this exact coin.” 
> ANYPREVOUT says: “I authorize spending any coin that looks like this.”

> Same Schnorr math. Different preimage.

![](https://cdn-images-1.medium.com/max/800/1*PDJqPG1-pS7G7dliFPGCRg.png)

---

```
Bitcoin is not designed top-down.  
It is discovered through execution.

"Run the Future" — starts here.
```

---

**TL;DR** — Same private key, same tapscript leaf (`<0x01||xonly> OP_CHECKSIG`, 35 bytes), two different UTXOs. Sign once, copy the witness verbatim onto the second transaction — no re-signing. Both pass Inquisition consensus validation and confirm in the same block. The mechanism: BIP 118’s sighash preimage omits `sha_prevouts`, so the outpoint vanishes from the digest. The signature binds not to “which UTXO” but to “what shape of UTXO.”

---

## 1. What Signatures Actually Are, and How Bitcoin Uses Them

Schnorr signatures (BIP 340) have nothing inherently to do with Bitcoin. They simply sign a message:

```
sig = Sign(privkey, message)
Verify(pubkey, message, sig) → true / false
```

`message` can be anything — a text string, a file hash, a chat message. A signature proves: **the holder of this private key endorsed this message.** No relation to transactions whatsoever.

Bitcoin took this general-purpose tool and did something specific: **it dictated what the message must be.**

When a script executes `OP_CHECKSIG`, the node does not let you pass in your own message. It automatically assembles a byte string from the current transaction’s fields — input sources, output destinations, amounts, timelocks — called the **sighash preimage**, then hashes it to produce a 32-byte **digest**. This digest is the message being signed.

```
General signing:  you choose the message → sign → verify
CHECKSIG:         consensus rules choose the message → you just sign → node rebuilds the message to verify
```

**So CHECKSIG is not just “verify a signature” — it turns signatures from general authorization into transaction authorization.** You are not signing “I agree.” You are signing “I agree to spend this money, from here, to there.” The strength of the signature depends on which fields are stuffed into the sighash preimage.

## Where sighash comes from

The sighash mechanism has evolved through several generations:

- **Legacy (pre-SegWit)**: Serializes the entire transaction, strips different parts depending on sighash type, double SHA256. The infamous O(n²) problem originated here.

- **BIP 143 (SegWit v0)**: Redesigned the preimage format — SHA256 prevouts, sequences, and outputs once each, then plug those 32-byte hashes into the preimage. Solved O(n²).

- **BIP 341 / 342 (Taproot / Tapscript)**: Built on BIP 143 with `TaggedHash("TapSighash", ...)` for domain separation, added `spend_type`, `tapleaf_hash`, `key_version`, and other fields.

Every generation adjusts the same question: **which fields go into the sighash preimage?** More fields means tighter binding; fewer fields means more flexibility.

## Sighash type: choosing how much to bind

Even within the same sighash generation, the signer can choose which fields to bind via **sighash type**. The standard options:

sighash typeBinds all inputsBinds all outputs`SIGHASH_ALL` (0x01)YesYes`SIGHASH_NONE` (0x02)Yes**No**`SIGHASH_SINGLE` (0x03)YesSame-index output only`SIGHASH_ANYONECANPAY` (0x80, combinable)**Current input only**Depends on the above three

These all operate on the **output side** — relaxing “where the money goes.” But they share one invariant: **the input side never relaxes.** The input you sign is permanently bound to a specific `txid:vout`. Once signed, that signature can only spend that one UTXO. Swap it, and the signature fails.

**This is exactly what BIP 118 changes.**

## What problem BIP 118 solves

Scenario: you and a counterparty opened a Lightning channel and went through 100 state updates. The counterparty cheats by broadcasting the old state from round 50. You need your round-100 update transaction to override it.

But your round-100 update transaction was signed during round 100 — at that time you had no idea whether the counterparty would broadcast round 50, let alone what txid round 50 would have on-chain. Under standard CHECKSIG, the signature is bound to the prevout’s `txid:vout`. You cannot pre-sign a “spend any future old state” transaction.

BIP 118 (SIGHASH_ANYPREVOUT) solves this: **remove **`**sha_prevouts**`** from the sighash preimage.** The signature no longer binds to a specific outpoint. As long as the UTXO’s amount and script match, the same signature works. You can pre-sign at round 100 a transaction that spends “any shape-matching old state” — whether the counterparty broadcasts round 50 or round 73.

This is the foundation of Eltoo / LN-Symmetry.

---

## 2. SigMsg vs Msg118: What Exactly Was Removed

Standard Tapscript (BIP 342) `SigMsg` assembles these fields:

```
SigMsg = hash_type
       || nVersion || nLocktime
       || sha_prevouts          ← SHA256(txid₁||vout₁ || txid₂||vout₂ || ...)
       || sha_amounts           ← SHA256(amount₁ || amount₂ || ...)
       || sha_scriptpubkeys     ← SHA256(spk₁ || spk₂ || ...)
       || sha_sequences         ← SHA256(seq₁ || seq₂ || ...)
       || sha_outputs           ← SHA256(all outputs)
       || spend_type
       || input_amount          ← current input's amount
       || input_scriptpubkey    ← current input's scriptPubKey
       || input_index
       || ...
```

`sha_prevouts` hashes every input’s `txid:vout` into the digest. Change one prevout, the hash changes, the digest changes, signature verification fails. **This is the “bind to UTXO” mechanism — not some abstract design, but a line of bytes in the preimage.**

BIP 118’s `Msg118` removes these fields:

![](https://cdn-images-1.medium.com/max/800/1*MaVo6dlHQr7aejXKH65ymA.png)

Note the subtlety: BIP 342 includes both the global `sha_amounts` (hash of all input amounts) and the per-input `input_amount`. BIP 118 keeps only the latter — if the global were retained, you would still indirectly bind to other inputs’ information.

**Result**: the digest contains no information about which outpoint is being spent. As long as the new UTXO has the same amount and same scriptPubKey, `Msg118` produces the identical byte string, the identical digest, and signature verification passes.

---

## 3. Three Tiers of Sighash: Package Pickup

BIP 118 defines two new sighash flags. Together with standard BIP 342, there are three tiers:

![](https://cdn-images-1.medium.com/max/800/1*06PVfHcG7YmjcrXUxNfhrA.png)

Package pickup analogy:

- **Standard CHECKSIG (0x01)**: The pickup slip says “collect package YT1234567890.” Only that one package — the signature is valid only for that tracking number.

- **ANYPREVOUT (0x41)**: The pickup slip says “collect any 5 kg package addressed to Zhang San.” Three qualifying packages at the station — this slip works for any of them. But it must be 5 kg, addressed to Zhang San.

- **ANYPREVOUTANYSCRIPT (0xC1)**: The pickup slip just says “Zhang San is here to pick up.” Any package will do, regardless of weight or sender, as long as the station accepts Zhang San’s ID.

This experiment uses 0x41 (the middle tier), which is also the tier Eltoo / LN-Symmetry actually needs.

---

## 4. How the Node Switches: the 0x01 Public Key Prefix

Standard tapscript uses 32-byte x-only public keys. BIP 118 stipulates: **if the public key in a tapscript is 33 bytes and the first byte is **`**0x01**`, the node uses BIP 118’s `Msg118 + Ext118` to compute the digest when executing `OP_CHECKSIG`, instead of standard BIP 342’s `SigMsg`.

```
Standard tapscript:  <32-byte xonly pubkey> OP_CHECKSIG   → uses BIP 342 SigMsg
BIP 118:             <0x01 || 32-byte xonly pubkey> OP_CHECKSIG → uses Msg118 + Ext118
```

This is an opt-in mechanism — it does not affect any existing tapscript. Only when you explicitly use a `0x01`-prefixed public key does BIP 118 sighash logic activate.

Additionally, `key_version = 0x01` in `Ext118` (BIP 342 uses `0x00`) isolates the sighash domain: even if the public key bytes are identical, a BIP 118 signature cannot replay on a standard BIP 342 key. The two worlds do not interfere.

---

## 5. Commit Phase: Building an APO-only P2TR Address with btcaaron

```
key = Key.from_wif(DEMO_KEY_WIF)

program = (
    TapTree(internal_key=key, network="signet")
    .bip118_checksig(key, label="apo_rebind")
    .build()
)
addr = program.address
```

## btcaaron API Walkthrough

`**.bip118_checksig(key, label="apo_rebind")**` is a convenience wrapper around `.custom()`. It is equivalent to:

```
apo_pk = apo_pubkey_bytes(key.xonly_bytes)   # 0x01 || xonly (33 bytes)
leaf_script = RawScript(build_script(push_bytes(apo_pk), OP_CHECKSIG))

program = (
    TapTree(internal_key=key, network="signet")
    .custom(script=leaf_script, label="apo_rebind")
).build()
```

The leaf script is:

```
<0x01 || xonly_pubkey> OP_CHECKSIG
```

35 bytes (`OP_PUSHBYTES_33` 1 byte + `0x01||xonly` 33 bytes + `OP_CHECKSIG` 1 byte). The `0x01` prefix tells the Inquisition node to use BIP 118 sighash. `apo_pubkey_bytes()` prepends the `0x01` byte to the x-only public key. The subsequent `.build()` → `.spend()` → `.sign()` / `.unlock_with()` flow is identical to all prior experiments.

Tapscript bytecode:

```
21                                                                <- OP_PUSHBYTES_33
01ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db4f78dbce6146499d9986b8  <- 0x01 || xonly pubkey
ac                                                                <- OP_CHECKSIG
```

## Funding Two Identical UTXOs

```
txid1 = wallet_send_sats(rpc_wallet, addr, 50_000)
txid2 = wallet_send_sats(rpc_wallet, addr, 50_000)
```

Two independent wallet transfers, 50,000 sats each, sent to the same P2TR address. Two UTXOs with the same amount and scriptPubKey, but different txids.

---

## 6. Reveal Phase: Sign Once, Spend Twice

```
# Sign the first UTXO normally
tx1 = (
    program.spend("apo_rebind")
    .from_utxo(u1_txid, u1_vout, sats=50_000)
    .to(change_addr, 47_000)
    .sign(key)          # ← internally calls key.sign_taproot_script_bip118()
    .build()
)

# Extract the witness stack
stack = tx1._tx.witnesses[0].stack   # [sig, leaf_script, control_block]
# Attach the same witness to the second transaction - no re-signing
tx2 = (
    program.spend("apo_rebind")
    .from_utxo(u2_txid, u2_vout, sats=50_000)
    .to(change_addr, 47_000)
    .unlock_with([stack[0].hex(), stack[1].hex(), stack[2].hex()])
    .build()
)
out1 = broadcast_or_raise(tx1.hex)
out2 = broadcast_or_raise(tx2.hex)
```

## btcaaron Signing API Walkthrough

`**.sign(key)**`, upon detecting that the current leaf uses a BIP 118 public key, internally calls:

```
key.sign_taproot_script_bip118(
    tx, txin_index=0,
    utxo_scripts=[scriptPubKey],
    amounts=[50_000],
    tapleaf_script=leaf,
    hash_type=0x41,      # SIGHASH_ALL | SIGHASH_ANYPREVOUT
)
```

This method calls `bip118_sighash()` to construct `Msg118 || Ext118`, computes `TaggedHash("TapSighash", 0x00 || msg || ext)` to get a 32-byte digest, then produces a BIP 340 Schnorr signature, appends sighash byte `0x41`, returning 65 bytes (130 hex chars).

`**.unlock_with([sig, leaf, cb])**` does not sign — it directly uses the three provided hex strings as the witness stack. Because `Msg118` does not contain the outpoint, the witness from the first spend is equally valid on the second.

---

## 7. Transaction Structure and On-chain Evidence

## Funding: Two Independent Wallet Transfers

TxIDAmountFunding A`[4b64…344a](https://mempool.space/signet/tx/4b6451082fe4349fdb2acad6bf0964c6cfd8c9cbf5161806fc342b051dee344a?showDetails=true)`50,000 satsFunding B`[543c…a5eb](https://mempool.space/signet/tx/543c97f777ea04624392f6a1547146d6e98996b38aec0794f6b79e3275f6a5eb?showDetails=true)`50,000 sats

Both pay to: `tb1prpa4a7wc0v5ghesn8pqhz7uw6lccd5u52rgzcfdqv3kwd3ptapcqnt93g2`

## Reveal: The Rebinding Pair

TxIDPrevoutOutputSpend A (signed)`[03c0…f3a4](https://mempool.space/signet/tx/03c0577c1d47da32804d098187644d0eee18b448aded2f427cd02193c070f3a4?showDetails=true)4b64…344a:0`47,000 satsSpend B (reused witness)`[4609…1a43](https://mempool.space/signet/tx/46091190c74d8fd4b39be67a2e945a19b021850e7f8d9e378f5eb11722ae1a43?showDetails=true)543c…a5eb:0`47,000 sats

Both confirmed in Inquisition signet block 298,280. 3,000 sats fee.

## Witness Comparison

Decoding both spend transactions on mempool.space, the witness stacks are byte-for-byte identical:

```
Witness[0] = 902004a5...b5fa04064bdc41   <- Schnorr signature + sighash byte 0x41 (65 bytes)
Witness[1] = 2101ff1f...9986b8ac         <- tapscript (35 bytes)
Witness[2] = c1ff1f9fa3...9986b8         <- control block (33 bytes)
```

**Witness[0]**: 64-byte Schnorr signature with `0x41` (`SIGHASH_ALL | SIGHASH_ANYPREVOUT`) appended, totaling 65 bytes.

**Witness[1]**: `21` (OP_PUSHBYTES_33) + `01||xonly_pubkey` (33 bytes) + `ac` (OP_CHECKSIG) = 35 bytes. The BIP 118 leaf script.

**Witness[2]**: Control block starts with `c1`. `c1` = leaf version `0xc0` + parity bit 1. The parity bit is determined by the Y-coordinate parity of the output key Q after TapTweak computation — `c0` for even, `c1` for odd; it cannot be chosen in advance. Followed by 32-byte internal public key, totaling 33 bytes.

Different inputs, same witness, both confirmed. **This is rebinding.**

## Negative Test

Modifying Spend B’s output address or amount causes script verification failure. `sha_outputs` remains in `Msg118` (`SIGHASH_ALL` mode) — the signature commits to where the money goes. **Rebinding lets you swap the input, not the destination.**

---

## 8. Rebuilding the Address with RootScope

The tapscript is 35 bytes: `OP_PUSHBYTES_33` (`0x21`) + `0x01||xonly_pubkey` (33 bytes) + `OP_CHECKSIG` (`0xac`). The derivation chain is identical to the single-leaf TapTree used in all prior experiments.

## Derivation Chain

```
TapLeaf hash = tagged_hash("TapLeaf",  0xc0 || compact_size(35) || script_bytes)
               (leaf version 0xc0, script length 35, script = 21 01||xonly ac)
Merkle root  = TapLeaf hash
Tweak t      = tagged_hash("TapTweak",  internal_pubkey || Merkle root)
Output key Q = internal_pubkey + t*G
P2TR address = Bech32m("tb", Q.x_only)
```

## Verification Code

```
internal_pubkey = bytes.fromhex(
    "ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db4f78dbce6146499d9986b8"
)
script_bytes = bytes.fromhex(
    "2101ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db4f78dbce6146499d9986b8ac"
)

tapleaf_hash = tagged_hash(
    "TapLeaf",
    # compact_size(35) = 0x23, single byte since 35 < 253
    bytes([0xc0]) + bytes([len(script_bytes)]) + script_bytes,
)
merkle_root = tapleaf_hash
tweak = tagged_hash("TapTweak", internal_pubkey + merkle_root)
Q    = Key.from_x_only(internal_pubkey).tweak_add(tweak)
addr = Q.to_p2tr_address(network="signet")
# Expected: tb1prpa4a7wc0v5ghesn8pqhz7uw6lccd5u52rgzcfdqv3kwd3ptapcqnt93g2  [OK]
```

## RootScope Visualization

```
Internal key
  ff1f9fa3...9986b8
        |
    TapLeaf (0xc0)
    Script: 2101<01||xonly>ac  (35 bytes)
                 ^--- 0x01 prefix triggers BIP 118 sighash
        |
    TapLeaf hash
        |   (no sibling -> single-leaf tree)
    Merkle root
        |
    TapTweak
        |
    Output key Q  (parity: odd -> control block byte = c1)
        |
    P2TR address
    tb1prpa4a7wc0v5ghesn8pqhz7uw6lccd5u52rgzcfdqv3kwd3ptapcqnt93g2  [OK]
```

The control block starts with `c1` — the same odd-parity result as the IK+CSFS experiment, but for a different reason: this 35-byte BIP 118 script produces a different TapLeaf hash, and after tweaking, the output key Q’s Y-coordinate happens to be odd. Same `internal_pubkey` (`ff1f9fa3...9986b8`) as all prior experiments, different tapscript, different Merkle root, different TapTweak, different address.

---

## 9. Cross-validation: Two Independent Implementations Agree on One Spec

Two confirmed transactions mean two independent implementations agreed on the digest:

- **Signing side** (Python, `btcaaron/bip118.py`): constructs `Msg118 || Ext118`, `TaggedHash("TapSighash", ...)`, BIP 340 signature

- **Validation side** (C++, Bitcoin Inquisition): reconstructs the same digest from the transaction, verifies the Schnorr signature

Bitcoin Core’s wallet and CLI do not support constructing BIP 118 signatures — there is no `signrawtransaction --sighash=anyprevout`. Signing must be done externally. `btcaaron/bip118.py` is a Python implementation independent of Core’s test framework, building `Msg118` / `Ext118` byte assembly from the [BIP 118 specification](https://github.com/bitcoin/bips/blob/master/bip-0118.mediawiki).

On-chain confirmation is the strictest test: if my implementation and Inquisition’s C++ disagree on any byte, the transaction gets rejected.

---

## 10. Why This Matters for Eltoo

ANYPREVOUT is the infrastructure for [Eltoo (LN-Symmetry)](https://blockstream.com/eltoo.pdf). In Eltoo, channel state update transactions need to be able to spend **any prior state’s** UTXO:

```
Counterparty cheats by broadcasting old State v2 (txid: aaaa...)
You need your State v5 update transaction to override it
But State v5 was pre-signed during round 5 — you didn't know State v2 would ever go on-chain
```

0x41 makes this possible: **when pre-signing, you don’t need to know the txid — just that the amount and scriptPubKey match.** Because all rounds’ state UTXOs share the same “lock” (same amount + same script), the signature you pre-signed works against any round.

Building on this signing code, I also ran a three-round Eltoo-style state chain (APO updates + CTV settlement), with all six transactions confirmed on the same signet — details at the [BIP 118 implementation post on Delving Bitcoin](https://delvingbitcoin.org/t/bip-118-signing-from-scratch-on-chain-rebinding-proof/) and the [Braidpool covenant challenge reply](https://delvingbitcoin.org/t/challenge-covenants-for-braidpool/1370/2).

---

## Series Position

![](https://cdn-images-1.medium.com/max/800/1*QlprdkDv_zrQbU6evXWVzQ.png)

---

## What We Did

We ran an on-chain BIP 118 SIGHASH_ANYPREVOUT experiment: a 35-byte tapscript (`<0x01||xonly> OP_CHECKSIG`), two UTXOs with the same amount and scriptPubKey. After signing the first UTXO, we copied the full witness — 65-byte Schnorr signature (sighash byte `0x41`), 35-byte leaf script, 33-byte control block — verbatim onto the second transaction. No re-signing. Both broadcast, both confirmed in Inquisition signet block 298,280.

Signing was done with `btcaaron`’s `Key.sign_taproot_script_bip118()`, which internally calls the independently implemented `Msg118` / `Ext118` / `TaggedHash("TapSighash", ...)` construction in `bip118.py`. This is a Python implementation independent of Bitcoin Core’s test framework — on-chain confirmation means it agrees byte-for-byte with Inquisition’s C++ consensus engine on the BIP 118 specification.

Negative testing confirmed the boundary: modifying the second transaction’s output address or amount causes script verification failure. Under `SIGHASH_ALL`, `sha_outputs` remains in `Msg118`. Rebinding relaxes “which UTXO to spend,” not “where the money goes.”

---

## References

- BIP 118 specification: [github.com/bitcoin/bips/bip-0118](https://github.com/bitcoin/bips/blob/master/bip-0118.mediawiki)

- btcaaron toolkit: [github.com/aaron-recompile/btcaaron](https://github.com/aaron-recompile/btcaaron)

- BIP 118 sighash implementation: `[btcaaron/bip118.py](https://github.com/aaron-recompile/btcaaron/blob/main/btcaaron/bip118.py)`

- Rebinding demo script: `[examples/braidpool/rca_taptree_smoke.py](https://github.com/aaron-recompile/btcaaron/blob/main/examples/braidpool/rca_taptree_smoke.py)`

- Bitcoin Inquisition: [github.com/bitcoin-inquisition](https://github.com/bitcoin-inquisition/)

- RootScope visualization tool: [github.com/aaron-recompile/rootscope](https://github.com/aaron-recompile/rootscope)

---

*Signet | Bitcoin Inquisition 29.2 | Funding *`[*4b64…344a*](https://mempool.space/signet/tx/4b6451082fe4349fdb2acad6bf0964c6cfd8c9cbf5161806fc342b051dee344a?showDetails=true)`* *`[*543c…a5eb*](https://mempool.space/signet/tx/543c97f777ea04624392f6a1547146d6e98996b38aec0794f6b79e3275f6a5eb?showDetails=true)`* | Spend A *`[*03c0…f3a4*](https://mempool.space/signet/tx/03c0577c1d47da32804d098187644d0eee18b448aded2f427cd02193c070f3a4?showDetails=true)`* | Spend B *`[*4609…1a43*](https://mempool.space/signet/tx/46091190c74d8fd4b39be67a2e945a19b021850e7f8d9e378f5eb11722ae1a43?showDetails=true)`* | Confirmed in block 298,280*

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [April 11, 2026](https://medium.com/p/eed4fc475668).

[Canonical link](https://medium.com/@aaron.recompile/sighash-anyprevout-on-signet-when-signatures-stop-binding-to-utxos-eed4fc475668)

Exported from [Medium](https://medium.com) on July 3, 2026.
