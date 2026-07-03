---
title: "OP_CAT + OP_CHECKSIGFROMSTACK on Signet — Dynamic Message, Oracle Authorization"
subtitle: "OP_CAT + OP_CHECKSIGFROMSTACK on Signet — Dynamic Message, Oracle Authorization"
tags: [bitcoin]
canonical_url: "https://medium.com/@aaron.recompile/op-cat-op-checksigfromstack-on-signet-dynamic-message-oracle-authorization-8c73e1ef5353"
published: false
---

## OP_CAT + OP_CHECKSIGFROMSTACK on Signet — Dynamic Message, Oracle Authorization

> *IK + CSFS asks: did the owner sign this? CAT + CSFS asks: did the oracle sign what the stack assembled?*

> The interesting question is not what an opcode does. 
> It is what emerges when they compose.

```
The interesting question is not what an opcode does.
It is what emerges when they compose.

Bitcoin is not designed top-down.
It is discovered through execution.
"Run the Future" - continues here.
```

**TL;DR** — Four opcodes, 36 bytes (`7ea820...cc`). OP_CAT assembles the signed message on-chain from two witness fragments. OP_SHA256 fixes it to a 32-byte digest. An oracle pubkey hardcoded in the script authorizes exactly that digest via OP_CHECKSIGFROMSTACK. The signer never saw the transaction — they only signed a price quote. The witness carries the raw material; the script determines what counts as authorization.

---

![](https://cdn-images-1.medium.com/max/800/1*ZtyuQZ2vm3Cb7UqleQxkIA.png)

---

## From Identity to Message

The previous combo experiment established one axis of the binding surface: *who* is authorized. OP_INTERNALKEY pulls the UTXO’s internal key from the Taproot execution context; OP_CHECKSIGFROMSTACK verifies that this specific key holder signed the message. The pubkey moves from the witness into the structure of the UTXO itself.

This experiment shifts to a different axis: *what is being authorized*, and specifically, *how the authorized message is constructed*.

In every previous CSFS experiment — solo or combined — the witness hands the message in whole. It is a static 32-byte blob: `SHA256("hello world")`, `SHA256("authorized:group_combo_ik_csfs:v1")`. The signer commits to a pre-known string, and the verifier checks it. The message content is determined before the script runs.

OP_CAT changes that. Combined with OP_SHA256 and OP_CSFS, it makes the message a runtime product of execution. The witness provides raw fragments — two byte strings that the script assembles, hashes, and then checks a signature against. The oracle never sees the assembled form; they sign semantic components. The final authorization target is constructed on-chain.

This is the **oracle-gate pattern**: the script commits to an authorized signer (the oracle pubkey), but not to the authorized message. The message is determined by what the spender supplies. The oracle attests to a statement structure — “a price reading of the form `ASSET=VALUE`" — and any spend that presents matching fragments with a valid oracle signature passes.

```
Binding surface evolution:
  CSFS          pubkey: witness    message: witness (static whole)
  IK + CSFS     pubkey: context    message: witness (static whole)
  CAT + CSFS    pubkey: script     message: assembled on-chain from witness parts
```

The pubkey is now in the script itself, hardcoded at UTXO creation time. The message is not pre-committed anywhere — it emerges from execution.

---

## The CAT+CSFS Contract

The locking script is:

```
OP_CAT
OP_SHA256
OP_PUSHBYTES_32 <oracle_pubkey>
OP_CHECKSIGFROMSTACK
```

The oracle signs a message offline. The spender provides two fragments and the signature. The script assembles the fragments, hashes them, pushes the oracle pubkey, and verifies.

For this experiment: `PART1 = "BTC_USD="`, `PART2 = "100000"`. The oracle attests to a price reading.

Compare the three CSFS variants:

```
Standalone CSFS:
  witness  = [sig, message, pubkey]
  script   = OP_CHECKSIGFROMSTACK

IK + CSFS:
  witness  = [sig, message]
  script   = OP_INTERNALKEY OP_CHECKSIGFROMSTACK
CAT + CSFS:
  witness  = [sig, PART1, PART2]
  script   = OP_CAT OP_SHA256 <oracle_pubkey> OP_CHECKSIGFROMSTACK
```

In the CAT+CSFS version, the message is absent from the witness as a unit. It does not exist until OP_CAT runs. The oracle pubkey is not in the witness at all — it is embedded in the script, committed at UTXO creation time.

## The Contract Design

```
Oracle offline:
  FULL_MESSAGE = PART1 || PART2 = "BTC_USD=100000"
  MESSAGE_HASH = SHA256("BTC_USD=100000")
               = d97200147349b678a5f38c5e5cf95181476b4961ef6566570f88c3ea9b4ccc73
  sig          = Schnorr.sign(oracle_key, MESSAGE_HASH)

At spend time, witness provides:
  Witness[0] = sig    (64 bytes)
  Witness[1] = PART1  "BTC_USD=" (8 bytes)
  Witness[2] = PART2  "100000"   (6 bytes)
Script constructs the message on-chain:
  CAT    -> "BTC_USD=100000"
  SHA256 -> d97200...ccc73   (same hash oracle signed)
  PUSH oracle_pk
  CSFS   -> verify sig(MESSAGE_HASH, oracle_pk) -> TRUE
```

The tapscript bytecode:

```
7e                                               <- OP_CAT
a8                                               <- OP_SHA256
20                                               <- OP_PUSHBYTES_32
ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db4f78dbce6146499d9986b8
cc                                               <- OP_CHECKSIGFROMSTACK (OP_RETURN_204 on standard nodes)
```

36 bytes. The oracle pubkey is the only constant embedded in the script — the message structure is implicit in the oracle’s signing convention, not enforced by the bytecode.

**A note on the demo key.** In this experiment, `ORACLE_PUBKEY` is derived from the same WIF as the TapTree's internal key — the oracle and the UTXO creator are the same entity. This is a deliberate simplification to keep the experiment self-contained. In production the two would be distinct: the internal key held by whoever deploys the contract, the oracle pubkey belonging to an independent data provider. The script mechanism is identical either way. When the two keys are the same, the oracle gate reduces to self-authorization. When they differ, it becomes a genuine third-party attestation gate — which is the pattern worth building toward.

---

## Commit Phase: Building the Taproot Address with btcaaron

```
PART1 = b"BTC_USD="
PART2 = b"100000"
FULL_MESSAGE = PART1 + PART2
MESSAGE_HASH = hashlib.sha256(FULL_MESSAGE).digest()

key = Key.from_wif(DEMO_KEY_WIF)
ORACLE_PUBKEY = bytes.fromhex(key.xonly)
leaf_script = RawScript(
    build_script(
        OP_CAT,
        OP_SHA256,
        push_bytes(ORACLE_PUBKEY),
        OP_CHECKSIGFROMSTACK,
    )
)
program = (
    TapTree(internal_key=key, network="signet")
    .custom(script=leaf_script, label="cat_csfs")
).build()
addr = program.address
```

## btcaaron API Highlights

`**build_script(OP_CAT, OP_SHA256, push_bytes(ORACLE_PUBKEY), OP_CHECKSIGFROMSTACK)**` assembles the 36-byte tapscript. `OP_CAT` and `OP_CHECKSIGFROMSTACK` are imported from `experiments.opcodes` as raw bytes `0x7e` and `0xcc` — proposed opcodes defined in the experiment layer rather than btcaaron's standard primitives. `push_bytes(ORACLE_PUBKEY)` encodes the 32-byte oracle pubkey with the `0x20` length prefix.

`**TapTree(...).custom(script, label).build()**` derives the P2TR address via the same TapLeaf → Merkle root → TapTweak → output key chain as all previous experiments. A 36-byte script produces the same derivation structure as any other single-leaf tree.

## Funding the Address

```
txid = fund_address(addr, FUND_TXID_FILE, fund_sats=50_000)
```

---

## Reveal Phase: Spending with Sig and Fragments

The witness is three items: the oracle signature, and the two fragments that the script will assemble on-chain. The assembled message never appears in the witness — it is a runtime product.

```
def _make_witness():
    secret = wif_secret_bytes(DEMO_KEY_WIF)
    sk = PrivateKey(secret, raw=True)
    sig = sk.schnorr_sign(MESSAGE_HASH, "", raw=True)
    return [sig.hex(), PART1.hex(), PART2.hex()]

tx = (
    program.spend("cat_csfs")
    .from_utxo(txid, vout, sats=sats)
    .to(change_addr, sats - fee_sats)
    .unlock_with(_make_witness())
    .build()
)
reveal_txid = broadcast_or_raise(tx.hex)
```

## btcaaron Spend API

`**_make_witness()**` returns `[sig, PART1, PART2]`. Elements are pushed in list order, so `sig` lands at the bottom of the execution stack, `PART1` in the middle, and `PART2` at the top. This is what OP_CAT expects: it pops the top two elements and concatenates as `bottom || top`, producing `PART1 || PART2`.

`**pk.schnorr_sign(MESSAGE_HASH, "", raw=True)**` signs the 32-byte digest of the fully assembled message. The oracle signs a pre-computed hash — they never interact with the transaction or the fragments individually.

The final witness layout:

```
Witness[0] = e3e78a8f...83cfde       <- Schnorr sig (64 bytes)
Witness[1] = 4254435f5553443d        <- PART1: "BTC_USD=" (8 bytes)
Witness[2] = 313030303030            <- PART2: "100000" (6 bytes)
Witness[3] = 7ea820ff1f9f...9986b8cc <- tapscript (36 bytes)
Witness[4] = c1ff1f9fa3...9986b8     <- control block (33 bytes)
```

---

## Transactions, OP_RETURN_204, and Stack Trace

## Commit: what lands on-chain

**TxID**: `[926c40c1...008f](https://mempool.space/signet/tx/926c40c1b72edb904a3bb7bf96795f351a6be597fc1aeab1390c15e0133b008f?showDetails=true)`

```
Timestamp     : 2026-03-21 12:24:18 UTC
Confirmed     : after 9 minutes
Fee           : 155 sats  (1.01 sat/vB)
Features      : SegWit | Taproot | RBF

INPUT
  tb1p2nmwxkf...psdvg7ky    0.00132441 sBTC
OUTPUTS
  tb1p7vd6g2a...nscrqdhy    0.00082286 sBTC  <- change
  tb1peaj5tna...csd84jel    0.00050000 sBTC  <- CAT+CSFS lock UTXO
```

The output `tb1peaj5tna...csd84jel` is a standard P2TR address. No observer can tell from the outside that a 36-byte oracle-gate script is committed in the script path.

## Reveal: what mempool.space shows

**TxID**: `[75db54de...65ca2](https://mempool.space/signet/tx/75db54dea1f125174699710bd5b517ae13b6e09b3293a0b0f463ea5561a65ca2?showDetails=true)`

```
Timestamp  : 2026-03-21 12:24:18 UTC
Fee        : 500 sats  (3.77 sat/vB)
Features   : SegWit | Taproot | RBF

INPUT
  tb1peaj5tna...csd84jel    0.00050000 sBTC
OUTPUT
  tb1p0tmlqak...xqcuvjzl    0.00049500 sBTC  (V1_P2TR)
```

The witness as shown by mempool.space:

```
Witness[0]  e3e78a8f93d0349a4c20694ed93a4593a0179615667d
            a0078658973ee8d939bf146c574398ed3af179b560306b
            2f8508aa33598b262d783b786c709dcd83cfde
            <- Schnorr sig (64 bytes)

Witness[1]  4254435f5553443d
            <- "BTC_USD=" (8 bytes)
Witness[2]  313030303030
            <- "100000" (6 bytes)
Witness[3]  7ea820ff1f9fa326a9438227e6aa25030ccf89bcb8ce
            53db4f78dbce6146499d9986b8cc
            <- tapscript: OP_CAT OP_SHA256 OP_PUSHBYTES_32 <oracle_pk> OP_RETURN_204
Witness[4]  c1ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db
            4f78dbce6146499d9986b8
            <- control block (leaf version 0xc0 + odd parity + internal pubkey)
```

nSequence for this input is `0xfffffffd` — RBF is enabled. This differs from the CTV experiment where `0xffffffff` was required by the template hash commitment. Here the output template is unconstrained; the spender is free to replace the transaction to adjust fees.

## The OP_RETURN_204 label

mempool.space decodes the tapscript and displays:

```
P2TR tapscript   OP_CAT  OP_SHA256  OP_PUSHBYTES_32 ff1f9f...9986b8  OP_RETURN_204
```

`OP_RETURN_204` is the explorer's label for opcode `0xcc` = 204 decimal. On standard nodes without BIP348 active, 204 falls in the OP_SUCCESS range (BIP342 opcodes 187–254), causing the tapscript to pass immediately without checking the signature. On Bitcoin Inquisition 29.2 with BIP348 active, the same byte is OP_CHECKSIGFROMSTACK — the node pops pubkey, message, and sig from the stack and runs BIP340 Schnorr verification.

Notably, `OP_CAT` and `OP_SHA256` are shown correctly by mempool.space — they are recognized opcodes on standard nodes (CAT via BIP347, SHA256 via existing script support). Only the final `0xcc` is unknown to the standard decoder. The word "RETURN" in `OP_RETURN_204` is not OP_RETURN the data-embedding opcode; it is mempool.space's naming convention for unrecognized opcodes.

## Stack execution

**Executing**: `OP_CAT OP_SHA256 OP_PUSHBYTES_32 <oracle_pubkey> OP_CHECKSIGFROMSTACK`

The Taproot interpreter strips Witness[3] (script) and Witness[4] (control block), loading Witness[0..2] as the initial execution stack.

---

### Initial State: three witness items loaded

```
+--------------------------------------------+
| 313030303030                               |  <- "100000"   (Witness[2], PART2, top)
| 4254435f5553443d                           |  <- "BTC_USD=" (Witness[1], PART1)
| e3e78a8f...83cfde                          |  <- Schnorr sig (Witness[0], bottom)
+--------------------------------------------+
```

Two fragments and a signature. The assembled message does not exist yet. The oracle pubkey is not on the stack — it is waiting in the script.

---

### Step 1 — OP_CAT: pop top two, push concatenation

```
+--------------------------------------------+
| 4254435f5553443d313030303030               |  <- "BTC_USD=100000" (14 bytes)
| e3e78a8f...83cfde                          |  <- sig (still on stack)
+--------------------------------------------+
```

OP_CAT pops `"100000"` (top), then `"BTC_USD="` (next), and concatenates as `bottom || top`. The full price-reading string materializes on-chain for the first time. BIP347's 520-byte ceiling is nowhere near approached — 14 bytes is well within bounds.

---

### Step 2 — OP_SHA256: pop top, push its SHA256

```
+--------------------------------------------+
| d97200147349b678...b4ccc73                 |  <- SHA256("BTC_USD=100000") (32 bytes)
| e3e78a8f...83cfde                          |  <- sig
+--------------------------------------------+
```

This is the exact 32-byte digest the oracle signed offline. The hash is deterministic — given the same PART1 and PART2, it always produces the same MESSAGE_HASH.

---

### Step 3 — OP_PUSHBYTES_32: push oracle pubkey from script

```
+--------------------------------------------+
| ff1f9fa3...9986b8                          |  <- oracle_pubkey (from script)
| d97200147349b678...b4ccc73                 |  <- MESSAGE_HASH
| e3e78a8f...83cfde                          |  <- sig
+--------------------------------------------+
```

The oracle pubkey arrives from the locking script, not the witness. It was committed at UTXO creation time. The spender cannot substitute a different key.

---

### Step 4 — OP_CHECKSIGFROMSTACK: pop pubkey, message, sig — verify — push result

```
+--------------------------------------------+
| 01                                         |  <- TRUE
+--------------------------------------------+
```

OP_CSFS pops all three items (top-first: pubkey → message → sig) and runs BIP340 Schnorr verification:

```
verify: Schnorr(sig  = e3e78a8f...83cfde,
                msg  = d97200147349b678...b4ccc73,
                pub  = ff1f9fa3...9986b8)
result: VALID -> push 01
```

Script terminates with a single truthy value. The spend is valid.

---

### Why the sig doesn’t cover the transaction

The oracle signed `SHA256("BTC_USD=100000")` — computed before the UTXO existed. The signature does not bind to input amounts, output addresses, or sequence numbers. Anyone who obtains this oracle signature can construct a spend with any output structure and pass the CSFS check, provided they also supply the matching fragments. This is not a flaw — it is the oracle pattern. The oracle attests to a fact about the world; what happens to funds after that attestation is a separate contract design question, typically addressed by combining CAT+CSFS with OP_CTV to lock the output destination alongside the oracle condition.

---

## A Structural Boundary: Replay

In this experiment the oracle signs the string `"BTC_USD=100000"`. Once the reveal transaction is on-chain, the `(sig, PART1, PART2)` triple is permanently visible in the witness. If a second UTXO existed with the same `7ea820...cc` script — same oracle pubkey — that triple could be replayed against it. The fragments match, the hash matches, the sig verifies — the spend passes.

This is an oracle-gate contract behaving exactly as designed. The oracle attested to a real-world fact at a point in time. The attestation is inherently transferable to any UTXO that accepts it. If you want each oracle signature to be valid for exactly one spend, include UTXO-specific data in the fragments:

```
PART1 = b"BTC_USD=100000|txid="
PART2 = bytes.fromhex(txid)   # 32 bytes of the input UTXO's txid
```

Now `SHA256(PART1 || PART2)` commits to a specific UTXO. The oracle signs a UTXO-bound attestation. Replay is structurally closed.

IK+CSFS established *who* can authorize. CAT+CSFS establishes *what* the authorization covers and hands the message construction to the execution stack. Combining all three — IK to bind signer identity, CAT to build a spend-specific message, CSFS to verify — produces authorization with no replay surface at any layer.

---

## Address Reconstruction with RootScope

The tapscript is 36 bytes: `7e` (OP_CAT) + `a8` (OP_SHA256) + `20` (OP_PUSHBYTES_32) + 32-byte oracle pubkey + `cc` (OP_CHECKSIGFROMSTACK).

## The Derivation Chain

```
TapLeaf hash = tagged_hash("TapLeaf",  0xc0 || 0x24 || script_bytes)
               (leaf version 0xc0, script length 36 = 0x24)
Merkle root  = TapLeaf hash
tweak t      = tagged_hash("TapTweak",  internal_pubkey || merkle_root)
output key Q = internal_pubkey + t*G
P2TR address = Bech32m("tb", Q.x_only)
```

## Verification Code

```
ORACLE_PUBKEY = bytes.fromhex(
    "ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db4f78dbce6146499d9986b8"
)
script_bytes = bytes([0x7e, 0xa8, 0x20]) + ORACLE_PUBKEY + bytes([0xcc])

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
# Expected: tb1peaj5tna...csd84jel  [OK]
```

Notice: the same `internal_pubkey` (`ff1f9fa3...9986b8`) appears as both the TapTree construction key and the oracle pubkey embedded in the script. In this demo, the oracle and the UTXO creator are the same entity. In production these would typically be distinct — the internal key held by the contract operator, the oracle pubkey by an independent data provider.

## RootScope Visual Output

```
Internal Key
  ff1f9fa3...9986b8
        |
    TapLeaf (0xc0)
    script: 7e a8 20 ff1f9fa3...9986b8 cc  (36 bytes)
                     ^--- oracle pubkey hardcoded in script
        |
    TapLeaf Hash
        |   (no siblings -> single-leaf tree)
    Merkle Root
        |
    TapTweak
        |
    Output Key Q  (parity: odd -> control block byte = c1)
        |
    P2TR Address
    tb1peaj5tna...csd84jel   [OK]
```

The control block opens with `c1`, consistent with the IK+CSFS experiment and different from the CAT, CSFS, and CTV solo experiments which all produced `c0`. Same internal key, 36-byte script, different Merkle root, different TapTweak value, different parity outcome.

---

## Where CAT+CSFS Sits in the Series

Opcode(s) Script Witness Pubkey source Message source What it proves OP_CAT `7ea820...87` [part1, part2] n/a assembled Preimage reassembly OP_CSFS `cc` [sig, msg, pubkey] witness witness (static whole) Someone with given key signed this OP_CTV `20...b3` [] n/a n/a Spending tx matches template OP_INTERNALKEY `cb20...87` [] context n/a Internal key equals expected IK+CSFS `cbcc` [sig, msg] context (UTXO) witness (static whole) UTXO owner signed the message **CAT+CSFS** `**7ea820...cc**` **[sig, part1, part2]** **script** **assembled on-chain** **Oracle signed what the stack built**

The series now spans two levels: solo experiments that characterize individual primitives, and combo experiments that explore how composition shifts the authorization surface. The next direction: combining all three axes — IK to bind signer identity, CAT to assemble a spend-specific message, CSFS to verify — producing authorization with no replay surface at any layer.

---

## What We Built

We ran the second combo experiment: a 36-byte tapscript that pairs OP_CAT and OP_SHA256 with a hardcoded oracle pubkey and OP_CHECKSIGFROMSTACK. The oracle signed `SHA256("BTC_USD=100000")` offline — a price attestation with no knowledge of the transaction it would eventually authorize. At spend time, the witness supplied the signature and two fragments separately; the script assembled them on-chain, hashed the result, and verified the oracle's signature against the computed digest.

We built the TapTree with `btcaaron`'s `build_script(OP_CAT, OP_SHA256, push_bytes(ORACLE_PUBKEY), OP_CHECKSIGFROMSTACK)`, constructed the single-leaf TapTree, and derived the Signet address. The witness was `[sig, PART1, PART2]` — three items, no pre-assembled message, no pubkey. The spend used `.unlock_with(_make_witness())`.

Both transactions confirmed on Signet at 2026–03–21 12:24:18 UTC. RootScope verified the address derivation: the oracle pubkey appears in two roles — once as the TapTree’s internal key feeding the TapTweak derivation, once as a literal constant inside the 36-byte script. Same key, two roles, different derivation paths. Control block opens with `c1`: same odd-parity outcome as the IK+CSFS experiment, arising from a different Merkle root produced by the 36-byte script.

The replay boundary is real and deliberate: this oracle attestation is transferable to any UTXO that accepts the same oracle signature. Closing it requires encoding UTXO-specific data in the assembled fragments. That is the design space this experiment opens — not a limitation to apologize for, but a primitive boundary to build from.

One more boundary worth naming: in this demo the oracle pubkey and the TapTree’s internal key are the same key. The oracle is the contract creator. Separating them — an independent oracle pubkey embedded in the script, a different internal key controlling the key path — is the production design. The mechanism is identical; only the trust model changes.

---

## Resources

- Bitcoin Inquisition: [github.com/bitcoin-inquisition](https://github.com/bitcoin-inquisition/)

- btcaaron toolkit: [github.com/aaron-recompile/btcaaron](https://github.com/aaron-recompile/btcaaron)

- RootScope visualizer: [github.com/aaron-recompile/rootscope](https://github.com/aaron-recompile/rootscope)

---

*Signet | Bitcoin Inquisition 29.2 | Commit *`[*926c40c1...008f*](https://mempool.space/signet/tx/926c40c1b72edb904a3bb7bf96795f351a6be597fc1aeab1390c15e0133b008f?showDetails=true)`* | Reveal *`[*75db54de...65ca2*](https://mempool.space/signet/tx/75db54dea1f125174699710bd5b517ae13b6e09b3293a0b0f463ea5561a65ca2?showDetails=true)`* | Confirmed 2026-03-21*

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [March 27, 2026](https://medium.com/p/8c73e1ef5353).

[Canonical link](https://medium.com/@aaron.recompile/op-cat-op-checksigfromstack-on-signet-dynamic-message-oracle-authorization-8c73e1ef5353)

Exported from [Medium](https://medium.com) on July 3, 2026.
