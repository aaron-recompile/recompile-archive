---
title: "RootScope: A Tool for Reconstructing Taproot Script Paths — Step by Step"
subtitle: "When you spend from a Taproot script path, the hash chain is deterministic. Reconstructing it by hand is a trap."
tags: [bitcoin, taproot]
canonical_url: "https://medium.com/@aaron.recompile/rootscope-a-tool-for-reconstructing-taproot-script-paths-step-by-step-106012af54b9"
published: false
---

### When you spend from a Taproot script path, the hash chain is deterministic. Reconstructing it by hand is a trap.

---

![](https://cdn-images-1.medium.com/max/800/1*ybIhmVO2RbZquBOvK2TaDw.png)

---

Taproot is elegant on paper. Spend from a script path, and the witness contains everything needed to prove your script was committed: the script itself, the control block, and the Merkle path up to the root. The math is clean.

The problem is *inspection*.

Given a real transaction, try to manually verify that the reconstructed Merkle root matches the output key. You’ll need to:

1. Parse the control block byte by byte

1. Compute `TaggedHash("TapLeaf", version || compact_size(len) || script)`

1. Walk the sibling hashes in the control block up to the root

1. Compute `TaggedHash("TapTweak", internal_pubkey || root)`

1. Do the elliptic curve point addition on secp256k1

1. Bech32m-encode the result

1. Check that it matches the output address

Miss one step — wrong hash tag, wrong byte order, parity bit ignored — and you get a silent mismatch. No error message. Just a wrong address.

I built **RootScope** to do this deterministically and show every step.

---

## What RootScope Does

Given a `script` and `control block`, RootScope computes the complete reconstruction chain:

```
TapLeaf hash
  → TapBranch step 1
  → TapBranch step 2
  → ...
  → Merkle root
  → TapTweak
  → tweaked output key
  → bech32m address
  → ✓ matches expected address (optional check)
```

Each intermediate value is shown. Nothing is hidden.

There’s also a `fetch-witness` helper: give it a `txid + vin`, and it resolves the witness from a block explorer and prefills the inputs. No manual hex-copying from a mempool explorer.

Repo: [github.com/aaron-recompile/rootscope](https://github.com/aaron-recompile/rootscope)

---

## The Hash Chain, Concretely

BIP 341 defines three tagged hashes used in Taproot construction:

**TapLeaf:**

```
TapLeaf_hash = TaggedHash("TapLeaf", leafVersion || compact_size(len) || script)
```

**TapBranch** (each step up the Merkle path):

```
TapBranch_hash = TaggedHash("TapBranch", left || right)
```

where `left` and `right` are the lexicographically-sorted pair — the control block provides sibling hashes in order, so sorting happens at construction time.

**TapTweak:**

```
tweak = TaggedHash("TapTweak", internal_pubkey || merkle_root)
taproot_pubkey = lift_x(internal_pubkey) + tweak × G
```

The final output key is the x-coordinate of that point. Parity check against the control block’s low bit completes the verification.

RootScope implements all of this in pure Python — `hashlib` only, no external crypto libraries. `crypto.py` re-implements `tagged_hash`, secp256k1 `lift_x`, `point_add`, `point_mul`, and `bech32m_encode/decode` from scratch. Every function is independently testable.

---

## Validation

Before touching mainnet data, I ran the full BIP 341 test vectors.

`wallet-test-vectors.json` contains 6 test cases with 12 distinct script-path spending paths — including unbalanced trees (case 3) and mixed-depth paths (cases 5 and 6). All 12 pass:

```
$ make bip341-vectors
Running BIP341 test vectors...
 [PASS] Case 1 - path 0/0
 [PASS] Case 1 - path 0/1
 [PASS] Case 2 - path 0/0
 ...
 [PASS] Case 6 - path 0/1/0


12 / 12 PASS
```

Additional vectors from [*Mastering Taproot*](https://github.com/aaron-recompile/mastering-taproot) cover single-leaf, dual-leaf (balanced), and the first documented 4-leaf Taproot tree — including the full unbalanced variant from Chapter 8.

Control block guard checks:

- `(len - 33) % 32 == 0` — control block length must be valid

- depth ≤ 128 — as specified in BIP 341

- output-key parity check against the `version & 0x01` bit

Quick repro:

```
git clone https://github.com/aaron-recompile/rootscope
cd rootscope
python3 -m venv .venv && ./.venv/bin/python -m pip install -r backend/requirements.txt

make bip341-vectors
./.venv/bin/python -m backend.cli tx \
  f1de8d3b3894a7cc0efffa7332bf7236ad089195b9d642121f4844f13e01f1e0 \
  --vin 0 --network mainnet
```

---

## The Deeper the Tree, the More the Control Block Reveals

Most mainnet script-path spends use single-leaf trees — 33-byte control blocks with no Merkle path at all. That’s the on-chain reality. But it’s not what Taproot was designed for. The interesting structures are in the [*Mastering Taproot*](https://github.com/aaron-recompile/mastering-taproot) book vectors and the BIP 341 test cases.

**Depth progression: single-leaf to 4-leaf**

The book’s three chapters correspond to three tree shapes. Control block length grows linearly with depth:

```
Chapter 06 — single leaf (depth=0)
control block = 1 + 32 = 33 bytes

internal_key
       │
     leaf_A  ← script here, no sibling hashes in control block
Chapter 07 - dual-leaf balanced (depth=1)
control block = 1 + 32 + 32 = 65 bytes


  internal_key
       │
    Branch
   ┌───┴───┐
 leaf_A  leaf_B  ← reveal A, control block carries hash of B
Chapter 08 - 4-leaf balanced (depth=2)
control block = 1 + 32 + 32 + 32 = 97 bytes


  internal_key
       │
      Root
   ┌───┴────┐
Branch0   Branch1
┌──┴──┐  ┌──┴──┐
S0   S1  S2   S3  ← reveal S1: control block carries [S0_hash, Branch1_hash]
```

Each additional depth level adds 32 bytes. Verification complexity is O(depth).

**Unbalanced trees: two different proofs, same output address**

This is the most counterintuitive part of Taproot’s design: **different leaves in the same tree can have different control block depths, but all resolve to the same output address.**

Unbalanced 3-leaf tree:

```
      Root
    ┌──┴──┐
  Branch  leaf_C  ← depth=1, control block carries Branch_hash
  ┌─┴─┐
leaf_A leaf_B     ← depth=2, control block carries [leaf_B_hash, leaf_C_hash]
```

Revealing leaf_A (depth=2):

```
control_block = version | parity
              + internal_pubkey       (32 bytes)
              + leaf_B_hash           (32 bytes, sibling)
              + leaf_C_hash           (32 bytes, sibling one level up)
total = 97 bytes
```

Revealing leaf_C (depth=1):

```
control_block = version | parity
              + internal_pubkey       (32 bytes)
              + Branch_AB_hash        (32 bytes, entire left subtree)
total = 65 bytes
```

Two paths, identical Merkle root, identical output address. RootScope reconstructs both correctly and produces consistent results.

**BIP 341 Case 3: non-standard leaf version**

Test case 3 in `wallet-test-vectors.json` includes a path with leaf version `0xfa` — not the standard Tapscript `0xc0`:

```
control_block = "faee4fe085983462a184015d1f782d6a5f8b9c2b..."
#                ^^
#                0xfa = non-standard leaf version, low bit = parity
```

The script for this path is the raw bytes `06424950333431` — ASCII "BIP341". From the perspective of address verification, the leaf version only affects the TapLeaf hash computation. TapBranch and TapTweak are unaffected. RootScope handles this correctly.

---

## Open Questions

1. **Depth distribution at scale.** Does depth > 0 appear more often in protocol-specific spending — Lightning, RGB, covenant constructions? Are there real multi-leaf trees in the wild beyond ordinals infrastructure?

1. **Template labeling.** The current pipeline identifies templates by script structure. Automatic classification is possible but risks false positives. Is conservative, opt-in labeling better for a tool like this?

1. **Dataset integration.** Are there public datasets of script-path spends — academic datasets, mempool.space exports, or other tooling outputs — that would plug directly into the batch pipeline?

---

Repo: [github.com/aaron-recompile/rootscope](https://github.com/aaron-recompile/rootscope)

---

*Related: *[*Building a 4-Leaf Taproot Tree in Python*](https://medium.com/@aaron.recompile/building-a-4-leaf-taproot-tree-in-python-the-first-complete-implementation-on-bitcoin-testnet-3a9b2c8e7f1d)* · *[*Taproot Control Block Deep Analysis*](https://medium.com/@aaron.recompile/taproot-control-block-deep-analysis-stack-execution-visualization-5ff10f98032c)

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [March 9, 2026](https://medium.com/p/106012af54b9).

[Canonical link](https://medium.com/@aaron.recompile/rootscope-a-tool-for-reconstructing-taproot-script-paths-step-by-step-106012af54b9)

Exported from [Medium](https://medium.com) on July 3, 2026.
