---
title: "Commit-Reveal vs Dual-Layer Scripts: The Real Architecture of Bitcoin Script"
subtitle: "The Universal Truth: Commit → Reveal and Single-Layer vs Dual-Layer Scripts."
tags: [bitcoin]
canonical_url: "https://medium.com/@aaron.recompile/commit-reveal-vs-dual-layer-scripts-the-real-architecture-of-bitcoin-script-665a79b0bd34"
cover_image: "https://cdn-images-1.medium.com/max/800/1*8vWIEun7MLB7FhZi_Cvt0g.png"
published: false
---

Companion notes to my book ***Mastering Taproot***.

---

```
HODLing is the beginning.
But Bitcoin was meant to be programmed.

"Not Just HODLing: Real Bitcoin Script Engineering" starts here.
```

---

## Bitcoin Script looks like a single program. It isn’t.

Underneath, two different architectures coexist:

- a philosophical **commit–reveal** model shared by all address types

- an engineering **dual-layer** structure introduced only in P2SH, P2WSH, and Taproot script-path

Most confusion comes from mixing these two.

This essay separates them cleanly.

---

## 1. The Universal Truth: Commit → Reveal

Every Bitcoin output — P2PKH, SegWit, Taproot — follows one rule:

```
Lock:   commit to a condition
Unlock: reveal a proof satisfying it
```

- P2PKH commits to a pubkey hash

- P2SH commits to a script hash

- P2WSH commits to SHA256(script)

- Taproot commits to a tweaked key (optionally hiding a Merkle tree)

This is a conceptual model, not an execution structure.

Commit–reveal is the language. Opcodes are the grammar.

---

## 2. Single-Layer vs Dual-Layer Scripts

Commit–reveal is universal. Dual-layer execution is not.

Bitcoin has exactly two script architectures:

---

## Single-Layer Scripts

**Used by:**

- P2PK / P2PKH

- P2MS (bare multisig)

- P2WPKH

- Taproot key-path

**Structure:**

```
scriptSig / witness pushes data
            ↓
scriptPubKey (or implicit logic) executes directly
```

No script hash. No script extraction. No inner vs outer.

**P2WPKH**

Witness only carries data. Nodes recognize `OP_0 <20 bytes>`, then execute an implicit P2PKH-equivalent program.

This is not dual-layer because there is no script hash and no revealed script.

**Taproot key-path**

Pure single-layer: a single Schnorr signature verifies the tweaked key. No script execution at all.

---

## Dual-Layer Scripts

**Used only by:**

- P2SH

- P2WSH

- Taproot script-path

**Architecture:**

```
Outer layer:   verify a commitment (hash / tweaked key)
Inner layer:   execute the revealed script
```

```
┌─────────────────────────────┐
│        Outer Commit Layer   │
│   (scriptPubKey commitment) │
└───────────────┬─────────────┘
                │
                ▼
┌─────────────────────────────┐
│      Inner Execution Layer  │
│ (redeemScript / witnessScript / tapscript)
└─────────────────────────────┘
```

Only these three structures follow: **unlock → reveal → load script → execute script**.

This is why P2SH has no OP_CHECKSIG in its locking script. All logic lives in the inner script.

---

## 3. The Commitment Types

## P2SH

```
scriptPubKey:  OP_HASH160 <script_hash> OP_EQUAL
redeemScript:  (actual logic, e.g. OP_CHECKSIG)
```

## P2WSH

```
scriptPubKey:  OP_0 <32-byte script_hash>
witnessScript: (actual logic)
```

## Taproot script-path

```
scriptPubKey:  OP_1 <32-byte output_pubkey>
witness:       <stack> <tapscript> <control_block>
```

The `control_block` contains the internal key and Merkle path.

**The outer script never encodes logic — only a fingerprint of logic.**

---

## 4. Why This Distinction Matters

Failing to distinguish these two layers leads to confusion:

- Why P2SH’s scriptPubKey has no OP_CHECKSIG

- Why SegWit moves scripts into the witness

- Why P2WSH and Taproot require revealing full scripts

- Why Taproot must reconstruct the tweaked key

- Why key-path spend is “scriptless”

With the correct architecture, everything clicks:

**Commit–reveal is the philosophy.Dual-layer is the mechanism.**

P2PKH only follows the philosophy. P2SH / P2WSH / Taproot script-path implement both.

---

## 5. The Unified Evolution

```
P2PK     → commit(pubkey)
P2PKH    → commit(hash(pubkey))
P2SH     → commit(hash(script))
P2WSH    → commit(sha256(script))
Taproot  → commit(internal_key + tweak(merkle_root))
```

Commitments grow more abstract. Privacy improves. Scripts expose less and less.

But the core remains unchanged:

```
Commit → Reveal → Execute
```

This is the true architecture of Bitcoin programmability.

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [December 2, 2025](https://medium.com/p/665a79b0bd34).

[Canonical link](https://medium.com/@aaron.recompile/commit-reveal-vs-dual-layer-scripts-the-real-architecture-of-bitcoin-script-665a79b0bd34)

Exported from [Medium](https://medium.com) on July 3, 2026.
