---
title: "OP_CHECKTEMPLATEVERIFY on Signet — Locking Outputs at UTXO Creation Time"
subtitle: "With OP_CAT you assemble data. With OP_CSFS you authorize it. With OP_CTV you enforce it."
tags: [bitcoin]
canonical_url: "https://medium.com/@aaron.recompile/op-checktemplateverify-on-signet-locking-outputs-at-utxo-creation-time-1d623fbe3899"
published: false
---

With OP_CAT you assemble data. With OP_CSFS you authorize it. With OP_CTV you enforce it.

---

![](https://cdn-images-1.medium.com/max/800/1*NnakRDSLhbWr669BI57o3g.png)

---

```
Bitcoin is not designed top-down.  
It is discovered through execution.

"Run the Future" — starts here.
```

---

## Constraining the Future, Not the Present

OP_CHECKSIG proves that the *current* key holder authorized *this* spend. OP_CSFS proves that *someone* authorized *some statement*. **OP_CHECKTEMPLATEVERIFY (BIP119)** does something different from both: it proves that the *spending transaction itself* matches a template committed at UTXO creation time.

The script does not look at a witness. It does not verify a signature. It computes a hash over the spending transaction’s structure — version, locktime, input count, sequences, output count, outputs — and checks whether that hash matches the one baked into the locking script. If the outputs deviate by a single satoshi or a single byte, the hash fails and the spend is rejected.

This is **output covenant by pre-commitment**. The creator of the UTXO decides, at funding time, exactly where and how much the money can go. The spender has no discretion over the outputs; they can only construct a transaction that reproduces the template exactly.

**BIP119** assigns opcode `0xb3` to OP_CTV. On standard nodes `0xb3` is OP_NOP4 — it does nothing, so any spend passes. **Bitcoin Inquisition 29.2** activates BIP119 on Signet, turning OP_NOP4 into the real constraint. Same soft fork upgrade pattern as OP_CAT (BIP347, `0x7e`) and OP_CSFS (BIP348, `0xcc`).

This post runs a minimal CTV experiment on Signet: commit to a template that sends exactly 49,500 sats to a fixed address, then spend by providing an empty witness and a matching transaction. The spending transaction proves itself.

---

## The CTV Contract

The locking script is:

```
OP_PUSHBYTES_32 <template_hash>
OP_NOP4                          <- OP_CTV on Inquisition (0xb3)
```

The template hash commits to the spending transaction structure. At spend time, the script:

1. Pushes `<template_hash>` onto the stack (from the script itself)

1. OP_CTV pops it, computes `DefaultCheckTemplateVerifyHash(spending_tx, input_index)`

1. Checks: `computed_hash == template_hash`

1. If equal, script succeeds

**The witness is empty.** The spender provides no data — no signature, no preimage, no pubkey. The spending transaction itself is the proof. This is the fundamental contrast with every other script we have seen in this series:

```
OP_CAT experiment:
  witness  -> ["hello", "world"]     (data for stack computation)
  script   -> OP_CAT OP_SHA256 <hash> OP_EQUAL

OP_CSFS experiment:
  witness  -> [sig, message, pubkey] (authorization proof)
  script   -> OP_CHECKSIGFROMSTACK

OP_CTV experiment:
  witness  -> []                     (nothing)
  script   -> <template_hash> OP_CTV (spending tx proves itself)
```

## The Template Hash: What Gets Committed

`DefaultCheckTemplateVerifyHash` is defined in BIP119 as:

```
SHA256(
  nVersion          (4 bytes, little-endian)
  nLockTime         (4 bytes, little-endian)
  -- scriptSigs hash omitted for native segwit (all empty) --
  nInputs           (4 bytes, little-endian)
  SHA256(sequences) (32 bytes)
  nOutputs          (4 bytes, little-endian)
  SHA256(outputs)   (32 bytes)
  input_index       (4 bytes, little-endian)
)
```

For our experiment, the committed values are:

```
nVersion          = 2
nLockTime         = 0
nInputs           = 1
sequences         = [0xffffffff]
nOutputs          = 1
outputs           = [49500 sats -> tb1p32g0c5...wsxlfd5s]
input_index       = 0
```

Computed template hash: `f4ceec28ec225e022e059355819726668dca411b9239ee4ef65379dc7bd2d8e08`

Every field that could affect the spending transaction’s character is committed. The output address and amount cannot change. The sequence cannot change. The version and locktime cannot change. The only free variable is the input itself — which is implicitly determined by spending the committed UTXO.

## The Contract Design

```
At UTXO creation time:
  compute template_hash = SHA256(version=2 || locktime=0 ||
                                 nInputs=1 || SHA256(seq=0xffffffff) ||
                                 nOutputs=1 || SHA256(49500 sats to tb1p32g0c5...wsxlfd5s) ||
                                 input_index=0)
                        = f4ceec28...d8e08


Lock script:
  OP_PUSHBYTES_32 f4ceec28...d8e08
  OP_NOP4  (= OP_CTV on Inquisition)
At spend time:
  witness  = []   <- empty
  spending tx must reproduce:
    version=2, locktime=0, sequence=0xffffffff,
    exactly one output: 49500 sats -> tb1p32g0c5...wsxlfd5s
```

The tapscript bytecode:

```
20     <- OP_PUSHBYTES_32
f4ceec28ec225e022e059355819726668dca411b9239ee4ef65379dc7bd2d8e08
b3     <- OP_NOP4 / OP_CTV
```

---

## Commit Phase: Building the Taproot Address with btcaaron

`btcaaron` provides `inq_ctv_program_for_output()` which handles the template hash computation and TapTree construction in a single call. The caller provides the destination output; the function derives everything else.

```
FUND_SATS   = 50_000
FEE_SATS    = 500
OUTPUT_SATS = FUND_SATS - FEE_SATS   # 49_500、

change_addr = default_change_address()
script_pubkey_hex = rpc_wallet("getaddressinfo", change_addr)["scriptPubKey"]
program, template_hash = inq_ctv_program_for_output(
    internal_key=key,
    output_sats=OUTPUT_SATS,
    output_script_pubkey=script_pubkey_hex,
    network="signet",
    sequence=0xFFFFFFFF,
)
addr = program.address
```

## btcaaron API Highlights

`**inq_ctv_program_for_output(internal_key, output_sats, output_script_pubkey, network, sequence)**` wraps the full CTV setup:

- Serializes the output: `value (8 bytes LE) || compact_size(len(scriptpubkey)) || scriptpubkey`

- Computes `DefaultCheckTemplateVerifyHash` over the template fields above

- Builds the tapscript: `OP_PUSHBYTES_32 <hash> OP_NOP4`

- Constructs a single-leaf TapTree and derives the Bech32m address

- Returns `(program, template_hash)` — the program carries the spend builder, the hash is for inspection

The caller must save `change_addr` to disk — it is needed at spend time to reconstruct the exact same template hash. If `change_addr` changes, the template hash changes, and the spend fails.

## Funding the Address

```
txid = fund_address(addr, FUND_TXID_FILE, fund_sats=FUND_SATS)
```

---

## Reveal Phase: Spending with an Empty Witness

The spend is architecturally the simplest of the three experiments. The spender provides no data. They only need to reconstruct the identical template (same `change_addr`, same amounts) and submit a matching transaction.

```
_, program, _ = _build_ctv_address(change_addr)

tx = (
    program.spend("ctv")
    .from_utxo(txid, vout, sats=sats)
    .to(change_addr, OUTPUT_SATS)
    .sequence(0xFFFFFFFF)
    .unlock_with([])          # <- empty: no witness data
    .build()
)
reveal_txid = broadcast_or_raise(tx.hex)
```

`**.unlock_with([])**` passes an empty list. The final witness contains only two items: the tapscript and the control block. There is nothing before them.

`**.sequence(0xFFFFFFFF)**` must be set explicitly to match the committed template. Any other sequence value produces a different hash and fails the CTV check.

`**.to(change_addr, OUTPUT_SATS)**` must reproduce the exact scriptpubkey committed in the template. Amount and address must be identical.

The final witness layout:

```
Witness[0] = 20 f4ceec28...d8e08 b3     <- tapscript (34 bytes)
Witness[1] = c0 ff1f9fa3...9986b8       <- control block (33 bytes)
```

No Witness[2], no Witness[3]. Two items total.

---

## Transactions, OP_NOP4, and Stack Trace

## Commit: what lands on-chain

**TxID**: `[d083e038...69b6681f](https://mempool.space/signet/tx/d083e038393afb711a6f8c11499131e4f856bb3fae898b74e43aa3bb69b6681f?showDetails=true)`

```
INPUT
  tb1pqzxvhv...lsycut3t    1.99999816 sBTC  (key-path spend, 64-byte Schnorr sig)

OUTPUTS
  tb1pg5quycyy...yspzja7g  1.99949661 sBTC  <- change
  tb1pvqhal44...5q6g6avk   0.00050000 sBTC  <- CTV lock UTXO
```

The CTV lock output `tb1pvqhal44...5q6g6avk` is a standard P2TR address. No observer can distinguish it from a key-path address. Its previous output script (visible in the reveal tx) confirms:

```
Previous output script:
  OP_PUSHNUM_1
  OP_PUSHBYTES_32  602fdfd6...042728    <- P2TR output key
Previous output type: V1_P2TR
```

## Reveal: witness data and stack execution

**TxID**: `[2789983e...86a244db](https://mempool.space/signet/tx/2789983e7f01997ef1fa04a718ea83d388e813cd2ded3116a5acb1a986a244db?showDetails=true)`

```
Timestamp  : 2026-03-15 23:47:15 UTC
Fee        : 500 sats  (4.46 sat/vB)
Features   : SegWit | Taproot  (no RBF -- see below)

INPUT
  tb1pvqhal44...5q6g6avk   0.00050000 sBTC
OUTPUT
  tb1p32g0c5...wsxlfd5s    0.00049500 sBTC  (V1_P2TR)
```

The witness as shown by mempool.space:

```
Witness[0]  20f4ceec28ec225e022e059355819726668dca411b9239ee4ef65379dc7bd2d8e08b3
            <- tapscript: OP_PUSHBYTES_32 <template_hash> OP_NOP4

Witness[1]  c0ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db4f78dbce6146499d9986b8
            <- control block (leaf version 0xc0 + internal pubkey)
```

Two witness items. Nothing else.

P2TR tapscript decoded:

```
OP_PUSHBYTES_32  f4ceec28ec225e022e059355819726668dca411b9239ee4ef65379dc7bd2d8e08
OP_NOP4
```

## The OP_NOP4 label — same pattern, different opcode

mempool.space decodes `0xb3` and displays:

```
P2TR tapscript   OP_PUSHBYTES_32 f4ceec28...d8e08  OP_NOP4
```

`0xb3` = 179 decimal. On standard nodes, opcode 179 is OP_NOP4 — a no-op that leaves the stack unchanged. Under BIP342, NOPs in Tapscript are treated differently from OP_SUCCESS: they do not cause immediate pass, but they also do not fail. A standard node executes `OP_PUSHBYTES_32 <hash>` (stack now has one item) and then `OP_NOP4` (does nothing), leaving the hash on the stack. The script terminates with a non-empty stack — which in Tapscript counts as success. So old nodes accept this spend without ever checking the template.

On Bitcoin Inquisition 29.2 with BIP119 active, the same `0xb3` is OP_CTV. It pops the hash from the stack, computes `DefaultCheckTemplateVerifyHash` from the spending transaction, and checks equality. Only a transaction with the exact matching outputs passes.

This is subtly different from the CSFS case. OP_CSFS (`0xcc`) is an OP_SUCCESS opcode — old nodes immediately pass without executing anything. OP_NOP4 (`0xb3`) is a NOP — old nodes execute the full script but do nothing at the NOP step. The end result is the same (old nodes always accept), but the upgrade mechanism differs. BIP119 could have chosen OP_SUCCESS for a cleaner soft fork; instead it chose a NOP to preserve the property that old nodes still execute and validate the non-CTV parts of the script.

## Stack execution

**Executing**: `OP_PUSHBYTES_32 <template_hash> OP_NOP4/OP_CTV`

The Taproot interpreter strips Witness[0] (script) and Witness[1] (control block). The remaining witness items become the initial execution stack — and there are none.

### Initial State: empty stack

```
+--------------------------------------------+
|                  (empty)                   |
+--------------------------------------------+
```

No witness data. The spending transaction is implicitly available to OP_CTV, but it is not on the stack.

### Step 1 — OP_PUSHBYTES_32: push template hash from script

```
+--------------------------------------------+
| f4ceec28...d8e08                           |  <- template_hash (32 bytes)
+--------------------------------------------+
```

The script itself supplies the committed hash. The spender provided nothing — this value came from the locking script, fixed at UTXO creation time.

### Step 2 — OP_CTV (0xb3): pop hash, verify spending tx, push result

```
+--------------------------------------------+
| 01                                         |  <- TRUE
+--------------------------------------------+
```

OP_CTV pops `f4ceec28...d8e08` and computes:

```
computed = DefaultCheckTemplateVerifyHash(spending_tx, input_index=0)
         = SHA256(
             version=2          nLockTime=0
             nInputs=1          SHA256(seq=0xffffffff)
             nOutputs=1         SHA256(49500 sats to tb1p32g0c5...wsxlfd5s)
             input_index=0
           )
         = f4ceec28...d8e08

check: computed == template_hash  -> TRUE
```

The spending transaction’s structure exactly reproduces the committed template. Script terminates with TRUE. Spend is valid.

---

## Why nSequence = 0xffffffff and no RBF

The reveal transaction features show **no RBF flag**. This is not an accident.

nSequence = `0xffffffff` is committed in the template hash. If you tried to replace the transaction (RBF) with a different fee by changing the fee rate, you would need to either reduce the output amount or add a second input. Reducing the output amount changes the outputs hash — the CTV check fails. Adding a second input changes nInputs — the CTV check fails. There is no fee-bumping path that leaves the template hash intact.

**CPFP is the practical solution.** After the reveal transaction confirms and sends 49,500 sats to `tb1p32g0c5...wsxlfd5s`, that output can spend those sats with a high-fee child transaction. Miners who see the child's fee incentive will mine the parent (reveal) too. This is why the Delving Bitcoin post noted: *"CTV: parent template constraints make direct replacement less flexible; CPFP is the practical accelerator."*

In the experiment, we set the fee to 500 sats and waited for natural confirmation. At 4.46 sat/vB on Signet, this took hours — the EXPERIMENT_MATRIX records a reveal-to-confirm window of ~338,814 seconds (~3.9 days) for the earlier CTV run. For production CTV vaults, fee planning at template creation time is critical.

---

## Address Reconstruction with RootScope

The tapscript is 34 bytes: one `OP_PUSHBYTES_32` (0x20), the 32-byte template hash, and `OP_NOP4` (0xb3).

## The Derivation Chain

```
TapLeaf hash = tagged_hash("TapLeaf",  0xc0 || 0x22 || 0x20 || template_hash || 0xb3)
               (leaf version, script length=34, OP_PUSHBYTES_32, hash, OP_NOP4)
Merkle root  = TapLeaf hash
tweak t      = tagged_hash("TapTweak",  internal_pubkey || merkle_root)
output key Q = internal_pubkey + t*G
P2TR address = Bech32m("tb", Q.x_only)
```

## Verification Code

```
template_hash = bytes.fromhex(
    "f4ceec28ec225e022e059355819726668dca411b9239ee4ef65379dc7bd2d8e08"
)
script_bytes = bytes([0x20]) + template_hash + bytes([0xb3])

tapleaf_hash = tagged_hash(
    "TapLeaf",
    bytes([0xc0]) + bytes([len(script_bytes)]) + script_bytes,
)
merkle_root = tapleaf_hash
internal_pubkey = bytes.fromhex(
    "ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db4f78dbce6146499d9986b8"
)
tweak = tagged_hash("TapTweak", internal_pubkey + merkle_root)
Q    = Key.from_x_only(internal_pubkey).tweak_add(tweak)
addr = Q.to_p2tr_address(network="signet")
# Expected: tb1pvqhal44...5q6g6avk  [OK]
```

Notice: the same `internal_pubkey` (`ff1f9fa3...9986b8`) appears in all three experiments. It is the x-only pubkey of `key = Key.from_wif(DEMO_KEY_WIF)`, the key that controls all three TapTree key paths. The three experiments share one key but embed completely different tapscripts.

## RootScope Visual Output

```
Internal Key
  ff1f9fa3...9986b8
        |
    TapLeaf (0xc0)
    script: 20 f4ceec28...d8e08 b3  (34 bytes)
        |
    TapLeaf Hash
        |   (no siblings -> single-leaf tree)
    Merkle Root
        |
    TapTweak
        |
    Output Key Q
        |
    P2TR Address
    tb1pvqhal44...5q6g6avk   [OK]
```

---

## The Series Complete: CAT, CSFS, CTV

This is the third and final post in the series. All three opcodes are now confirmed on Signet.

Opcode BIP Legacy opcode What it constrains Witness Stack at start OP_CAT 347 OP_SUCCESS Stack composition [part1, part2] 2 items from witness OP_CSFS 348 OP_SUCCESS Signature scope [sig, message, pubkey] 3 items from witness OP_CTV 119 OP_NOP4 Output template [] empty

The three opcodes represent three different answers to the question “what should Bitcoin Script be able to prove?”:

**CAT** says: the stack should be able to assemble arbitrary byte strings. It gives Script a serialization primitive. Without CAT, you cannot construct dynamic messages or concatenate transaction fields. With CAT, you can build any 32-byte value from components available on the stack.

**CSFS** says: Script should be able to verify that a specific key holder pre-authorized a specific statement. It decouples authorization from the spending transaction. Without CSFS, a key can only authorize one transaction. With CSFS, a key can authorize any statement — an oracle reading, an output template, a channel state.

**CTV** says: Script should be able to constrain the spending transaction to a fixed template, without requiring any runtime authorization. It is deterministic covenant enforcement. Without CTV, you need a signature to authorize every spend. With CTV, the UTXO is self-enforcing — anyone can spend it, but only to the committed destination.

The three together form a covenant design space. A vault that allows emergency recovery, time-locked inheritance, and fee optimization might use all three: CAT to serialize the output template at runtime, CSFS to verify the vault manager’s pre-authorization, and CTV to enforce the final destination unconditionally.

---

## What We Built

We constructed a CTV output that commits exactly 49,500 sats to a fixed destination. The locking script is 34 bytes: a pushed template hash followed by OP_NOP4/OP_CTV. The spending witness is empty — the transaction structure is its own proof.

We used `btcaaron`'s `inq_ctv_program_for_output()` to derive the template hash and build the TapTree in one call. The spend used `.unlock_with([])` and `.sequence(0xFFFFFFFF)` — no data supplied, but the transaction structure must match exactly. RootScope verified the address reconstruction: same internal key as the CAT and CSFS experiments, different 34-byte tapscript, different output key, different address.

The OP_NOP4 label in mempool.space reflects a different soft fork path than CSFS’s OP_SUCCESS: old nodes execute the full script but treat the NOP as inert, leaving the hash on the stack and accepting. Inquisition nodes enforce the actual CTV semantics. Both paths lead to old-node acceptance — only upgraded miners can reject an invalid template spend.

The reveal transaction has no RBF flag and no viable fee-bumping path short of CPFP. This is not an implementation detail; it is a direct consequence of the template hash committing to nSequence and outputs. Fee planning belongs at UTXO creation time, not at spend time.

All three transactions — CAT, CSFS, CTV — are permanently confirmed on Signet and reproducible end-to-end using the tools below.

---

## Resources

- Bitcoin Inquisition: [github.com/bitcoin-inquisition](https://github.com/bitcoin-inquisition/)

- btcaaron toolkit: [github.com/aaron-recompile/btcaaron](https://github.com/aaron-recompile/btcaaron)

- RootScope visualizer: [github.com/aaron-recompile/rootscope](https://github.com/aaron-recompile/rootscope)

---

*Signet | Bitcoin Inquisition 29.2 | Commit *`[*d083e038...69b6681f*](https://mempool.space/signet/tx/d083e038393afb711a6f8c11499131e4f856bb3fae898b74e43aa3bb69b6681f?showDetails=true)`* | Reveal *`[*2789983e...86a244db*](https://mempool.space/signet/tx/2789983e7f01997ef1fa04a718ea83d388e813cd2ded3116a5acb1a986a244db?showDetails=true)`

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [March 19, 2026](https://medium.com/p/1d623fbe3899).

[Canonical link](https://medium.com/@aaron.recompile/op-checktemplateverify-on-signet-locking-outputs-at-utxo-creation-time-1d623fbe3899)

Exported from [Medium](https://medium.com) on July 3, 2026.
