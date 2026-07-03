---
title: "OP_CAT on Signet — Concatenation, Commitment, and Bitcoin Inquisition"
subtitle: "Satoshi disabled it in 2010. We ran it on-chain in 2026."
tags: [bitcoin]
canonical_url: "https://medium.com/@aaron.recompile/op-cat-on-signet-concatenation-commitment-and-bitcoin-inquisition-ed34a07866d6"
published: false
---

Satoshi disabled it in 2010. We ran it on-chain in 2026.

---

![](https://cdn-images-1.medium.com/max/800/1*p3m_flh1egUfPTSlSPpY2w.png)

---

```
Bitcoin is not designed top-down.  
It is discovered through execution.

"Run the Future" — starts here.
```

---

## From Satoshi’s Disabling to Protocol Revival

OP_CAT is one of Bitcoin’s most storied disabled opcodes. In 2010, Satoshi Nakamoto silently removed it along with a handful of others, citing concerns about unbounded memory growth — a concatenated loop could theoretically produce a stack element of arbitrary size, opening a vector for denial-of-service attacks against nodes.

The irony is that OP_CAT is perhaps *the* most expressive primitive in Bitcoin Script. A single opcode — pop two stack elements, push their concatenation — unlocks a surprising range of constructions: introspection, covenants, STARK proof verification, cross-input signature binding. For over a decade, it sat dormant while developers found increasingly exotic workarounds.

**BIP347** (proposed 2024) formalizes OP_CAT’s return under Tapscript, with a strict 520-byte limit on concatenated outputs. **Bitcoin Inquisition 29.2** ships BIP347 as a soft fork active on Signet, making Signet the canonical testbed for OP_CAT experiments before any mainnet activation.

This post walks through a complete commit-reveal experiment conducted on Signet, implemented with the `btcaaron` toolkit and reconstructed visually with RootScope. The core contract is intentionally minimal: a **split-preimage hash lock** that proves OP_CAT's basic functionality while demonstrating the full Taproot script-path lifecycle.

One thing worth noting upfront: before block confirmation, reveal transactions may be absent from standard Signet mempools — not because of a network fork, but because of policy. Inquisition nodes accept the non-standard spend, mine it, and make it visible on public explorers post-confirmation. “Not seen yet” does not mean the network rejected it.

---

## The Split-Preimage Contract

The classical hash-lock script commits to a preimage and requires the spender to reveal it:

```
OP_SHA256 <hash> OP_EQUALVERIFY OP_TRUE
```

The preimage is presented as a single stack element. OP_CAT introduces a twist: we can commit to a preimage that the spender must *reconstruct on the fly* by providing two separate pieces and concatenating them on-chain. This is the **split-preimage** pattern:

```
OP_CAT
OP_SHA256
OP_PUSHBYTES_32 <SHA256(part1 || part2)>
OP_EQUAL
```

In our experiment: `part1 = "hello"`, `part2 = "world"`, and the expected hash is `SHA256("helloworld")`.

**Why this matters beyond the toy example.** The split-preimage pattern is the embryo of more sophisticated constructions. When you control what gets concatenated — for instance, a transaction field extracted via introspection alongside a known constant — you can enforce covenant behavior. OP_CAT turns the stack into a serialization engine. But we walk before we run.

## The Contract Design

```
Secret split:  "hello" (0x68656c6c6f)  ||  "world" (0x776f726c64)
                                   |
                               OP_CAT
                                   |
                    "helloworld" (0x68656c6c6f776f726c64)
                                   |
                               OP_SHA256
                                   |
          936a185c...8f8f07af   (SHA256 of "helloworld")
                                   |
                         compare with committed hash
                                   |
                               OP_EQUAL -> TRUE
```

The tapscript bytecode is exactly:

```
7e                                               <- OP_CAT
a8                                               <- OP_SHA256
20                                               <- OP_PUSHBYTES_32
936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af
87                                               <- OP_EQUAL
```

---

## Commit Phase: Building the Taproot Address with btcaaron

The commit transaction funds a Taproot output whose script path encodes the OP_CAT hash lock. We construct it as a **single-leaf TapTree** with the internal key controlling the key path.

## Computing the Committed Hash

```
part1 = b"hello"
part2 = b"world"
committed_hash = hashlib.sha256(part1 + part2).digest()

# 936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af
```

## Constructing the OP_CAT Script

OP_CAT is opcode `0x7e` — disabled on mainnet, activated on Signet via BIP347. We define it explicitly and pass it to `btcaaron`'s script builder:

```
OP_CAT = bytes([0x7E])

script_hex = build_script(
    OP_CAT,
    OP_SHA256,
    push_bytes(committed_hash),
    OP_EQUAL,
)
cat_leaf = RawScript(script_hex)
tap_tree  = (
    TapTree(internal_key=key, network="signet")
    .custom(script=cat_leaf, label="cat")
).build()
```

**btcaaron API Highlights**

`**TapTree(internal_key, network)**` initialises a Taproot tree builder. The `internal_key` is used as the key-path spend key and as the basis for the P2TR address derivation tweak.

`**.custom(script, label)**` attaches a raw script leaf to the tree under a human-readable label. The label is used later by `.spend(label)` to identify which leaf's control block to construct.

`**.build()**` finalises the tree: computes TapLeaf hashes, assembles the Merkle root (for a single leaf, the Merkle root *is* the TapLeaf hash), applies the BIP341 tweak `Q = P + t*G` where `t = tagged_hash("TapTweak", P || merkle_root)`, and derives the Bech32m Signet address.

## Funding the Address

```
txid = rpc_wallet("sendtoaddress", tap_tree.address, FUND_SATS / 1e8)
```

---

## Reveal Phase: Spending with the Split Preimage

The reveal transaction spends the UTXO by supplying `"hello"` and `"world"` as separate witness stack elements, letting OP_CAT reassemble them on-chain before the hash check.

```
tx = (
    tap_tree.spend("cat")
    .from_utxo(fund_txid, vout, sats=FUND_SATS)
    .to(change_addr, OUTPUT_SATS)
    .sequence(0xFFFFFFFF)
    .unlock_with([
        part1.hex(),   # "68656c6c6f"  <- pushed first -> sits at stack bottom
        part2.hex(),   # "776f726c64"  <- pushed second -> sits at stack top
    ])
    .build()
)
reveal_txid = rpc("sendrawtransaction", tx.hex)
```

## btcaaron Spend API

`**.spend(label)**` looks up the named leaf in the tree, constructs its control block (internal pubkey + optional Merkle path), and returns a transaction builder pre-configured for script-path spending.

`**.unlock_with([...])**` injects raw witness stack elements *before* the script and control block. Order matters: elements are pushed in list order, so the *first* element ends up deepest on the execution stack. In our case, `"hello"` lands at the bottom and `"world"` sits on top — exactly what OP_CAT expects.

The final witness for our single input:

```
Witness[0] = 68656c6c6f                  <- "hello"
Witness[1] = 776f726c64                  <- "world"
Witness[2] = 7ea820...8f8f07af87         <- tapscript (OP_CAT script)
Witness[3] = c050be5f...126bb4d3         <- control block
```

---

## Transactions and Stack Trace

## Commit: what lands on-chain

**TxID**: `[084d5a9c...ecaada09](https://mempool.space/signet/tx/084d5a9c6a8c176c24edc0a8b7ce54ed65808a326367d8a9299b4460ecaada09?showDetails=true)`

```
Timestamp     : 2026-02-12 09:52:48 UTC
Fee           : 155 sats  (1.01 sat/vB)
Features      : SegWit | Taproot | RBF

INPUT
  tb1pvzghpa...sqkluxcm    0.00250812 sBTC
OUTPUTS
  tb1p7lcpdk...8snhqmnc    0.00050000 sBTC  <- CAT lock UTXO
  tb1pmfwqkg...jsk55q8v    0.00200657 sBTC  <- change
```

The output `tb1p7lcpdk...8snhqmnc` is a standard P2TR address. An external observer sees nothing unusual — no hint that an OP_CAT script lurks in the script path. The commitment is invisible until revealed.

## Reveal: witness data and stack execution

**TxID**: `[00072d4a...b2d05656](https://mempool.space/signet/tx/00072d4aa354b5987eb8f2ffec440db7467b0581c5e845a6a0ef6999b2d05656?showDetails=true)`

The Taproot interpreter strips the last two witness items (script + control block) and uses the remaining items as the initial execution stack.

```
Witness[0]  68656c6c6f
            <- "hello"

Witness[1]  776f726c64
            <- "world"
Witness[2]  7e a8 20 936a185c...8f8f07af 87
            <- tapscript: OP_CAT OP_SHA256 OP_PUSHBYTES_32 <hash> OP_EQUAL
Witness[3]  c0 50be5fc4...126bb4d3
            <- control block (leaf version 0xc0 + internal pubkey, no Merkle path)
```

The 33-byte control block confirms a single-leaf TapTree: no sibling hash, because the TapLeaf hash *is* the Merkle root.

**Executing**: `OP_CAT OP_SHA256 OP_PUSHBYTES_32 <committed_hash> OP_EQUAL`

### Initial State: Witness[0] and Witness[1] loaded as execution stack

```
+--------------------------------------------+
| 776f726c64                                 |  <- "world"  (Witness[1], top)
| 68656c6c6f                                 |  <- "hello"  (Witness[0], bottom)
+--------------------------------------------+
```

Two separate byte strings. Neither alone matches the preimage hash; only their concatenation does.

### Step 1 — OP_CAT: pop top two, push concatenation

```
+--------------------------------------------+
| 68656c6c6f776f726c64                       |  <- "helloworld" (10 bytes)
+--------------------------------------------+
```

OP_CAT pops `"world"` then `"hello"` (top-first) and concatenates as `bottom || top`. BIP347 enforces a 520-byte ceiling on the result — our 10-byte string is well within bounds.

### Step 2 — OP_SHA256: pop top, push its SHA256

```
+--------------------------------------------+
| 936a185c...8f8f07af                        |  <- SHA256("helloworld") (32 bytes)
+--------------------------------------------+
```

The hash is deterministic. The spender cannot influence it without controlling the preimage composition.

### Step 3 — OP_PUSHBYTES_32: push the committed hash from script

```
+--------------------------------------------+
| 936a185c...8f8f07af                        |  <- committed_hash (from script)
| 936a185c...8f8f07af                        |  <- computed_hash  (from Step 2)
+--------------------------------------------+
```

The script carries the expected hash as a 32-byte constant embedded at compile time.

### Step 4 — OP_EQUAL: compare, push result

```
+--------------------------------------------+
| 01                                         |  <- TRUE
+--------------------------------------------+
```

Both hashes match. Script terminates with a single truthy value — spend is valid. Output destination: `tb1p4ug2v8...zqwnmkrp 0.00049500 sBTC (V1_P2TR)`.

### Why not OP_EQUALVERIFY + OP_TRUE?

Both produce the same consensus result here. `OP_EQUAL` leaves the boolean on the stack, while `OP_EQUALVERIFY` consumes it and aborts on failure. For a single-path terminal opcode, `OP_EQUAL` is idiomatic — clearer intent, one fewer byte. The on-chain bytecode (`87`) confirms this choice.

---

## Address Reconstruction with RootScope

The real payoff of understanding Taproot internals is being able to **independently reconstruct the P2TR address** from its constituent parts, without trusting any external source. RootScope walks through the full derivation and renders each step visually.

## The Derivation Chain

```
TapLeaf hash = tagged_hash("TapLeaf",  0xc0 || compact_size(len(script)) || script)
Merkle root  = TapLeaf hash              <- single leaf: no TapBranch needed
tweak t      = tagged_hash("TapTweak",  internal_pubkey || merkle_root)
output key Q = internal_pubkey + t*G    <- elliptic curve point addition
P2TR address = Bech32m("tb", Q.x_only)
```

## Verification Code

```
tapleaf_hash = tagged_hash(
    "TapLeaf",
    bytes([0xc0]) + bytes([len(script_bytes)]) + script_bytes,
)
merkle_root = tapleaf_hash

internal_pubkey = bytes.fromhex(
    "50be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3"
)
tweak = tagged_hash("TapTweak", internal_pubkey + merkle_root)
Q    = Key.from_x_only(internal_pubkey).tweak_add(tweak)
addr = Q.to_p2tr_address(network="signet")
# Expected: tb1p7lcpdk...8snhqmnc  [OK]
```

## RootScope Visual Output

```
Internal Key
  50be5fc4...126bb4d3
        |
    TapLeaf (0xc0)
    script: 7ea820...07af87
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
    tb1p7lcpdk...8snhqmnc   [OK]
```

For multi-leaf trees, RootScope renders the full binary tree, highlights the Merkle proof path for any selected leaf, and shows where sibling hashes appear in the control block — indispensable for debugging spend failures caused by mismatched script indexes or incorrect tree ordering.

---

## What Comes Next: CAT, CSFS, and CTV

This post is the first in a three-part series covering the opcode proposals currently co-activated on Signet via Bitcoin Inquisition. Each targets a different layer of the transaction:

Opcode BIP What it constrains Mechanism OP_CAT 347 Stack composition Concatenate two elements; enables serialization OP_CSFS 348 Signature scope Check a signature against an arbitrary message OP_CTV 119 Output template Commit the spend tx to a pre-defined hash

OP_CAT, as shown here, operates purely on the stack. It does not know what a transaction looks like — it just concatenates bytes. That is precisely why covenant designs need to combine it with introspection: CAT reassembles serialized transaction fields, and something else checks them.

OP_CSFS goes one step further: it decouples the message being signed from the transaction itself. A signature can be validated against any data on the stack, not just the current transaction hash. This opens the door to delegation schemes and cross-input commitments.

OP_CTV takes the opposite approach: instead of building up constraints from scratch, it commits the spending transaction to a pre-computed hash at UTXO creation time. The spender cannot deviate from the template — output addresses, amounts, and sequence numbers are all locked in. No introspection needed; the commitment is baked into the script.

The three opcodes are complementary. A covenant that validates a transaction’s output structure might use CTV for the simple fixed-template case, or CAT + CSFS for a more dynamic one where the template is computed at runtime. Next post: OP_CSFS on Signet — what it takes to sign something other than the current transaction.

---

## What We Built

We designed a split-preimage hash lock under Taproot’s script path, implemented it with `btcaaron`'s `TapTree / RawScript / .custom() / .unlock_with()` chain, and broadcast both the commit and reveal transactions on Signet. The reveal witness puts `"hello"` and `"world"` on the stack as two separate items; OP_CAT reassembles them before the SHA256 check fires.

We then used RootScope to walk the derivation in reverse: starting from the raw script bytes and the internal key, we recomputed the TapLeaf hash, the Merkle root, the TapTweak, and the output key — arriving at the same `tb1p7lcpdk...8snhqmnc` that received the commit funds. That chain of trust, from script to address, is what makes Taproot's script-path commitments verifiable and auditable without any external authority.

Both transactions are permanently confirmed on Signet. The experiment is reproducible end-to-end using the tools linked below.

---

## Resources

- Bitcoin Inquisition: [github.com/bitcoin-inquisition](https://github.com/bitcoin-inquisition/)

- btcaaron toolkit: [github.com/aaron-recompile/btcaaron](https://github.com/aaron-recompile/btcaaron)

- RootScope visualizer: [github.com/aaron-recompile/rootscope](https://github.com/aaron-recompile/rootscope)

---

*Signet | Bitcoin Inquisition | Commit *`[*084d5a9c...ecaada09*](https://mempool.space/signet/tx/084d5a9c6a8c176c24edc0a8b7ce54ed65808a326367d8a9299b4460ecaada09?showDetails=true)`* | Reveal *`[*00072d4a...b2d05656*](https://mempool.space/signet/tx/00072d4aa354b5987eb8f2ffec440db7467b0581c5e845a6a0ef6999b2d05656?showDetails=true)`* | Confirmed 2026-02-12*

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [March 16, 2026](https://medium.com/p/ed34a07866d6).

[Canonical link](https://medium.com/@aaron.recompile/op-cat-on-signet-concatenation-commitment-and-bitcoin-inquisition-ed34a07866d6)

Exported from [Medium](https://medium.com) on July 3, 2026.
