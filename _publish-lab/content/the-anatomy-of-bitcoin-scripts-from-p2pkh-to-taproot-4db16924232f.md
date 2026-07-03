---
title: "The Anatomy of Bitcoin Scripts: From P2PKH to Taproot"
subtitle: "Understanding these primitives is the foundation for everything that follows — Lightning channels, covenant proposals, and whatever"
tags: [bitcoin, taproot]
canonical_url: "https://medium.com/@aaron.recompile/the-anatomy-of-bitcoin-scripts-from-p2pkh-to-taproot-4db16924232f"
cover_image: "https://cdn-images-1.medium.com/max/800/1*1-nfC1obuIQItPMMYVsK5Q.jpeg"
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

## The Universal Truth

Every Bitcoin address — from the genesis block to the latest Taproot output — follows one fundamental pattern:

```
Lock:   Commit to a condition
Unlock: Reveal proof that you satisfy it
```

This isn’t a feature of SegWit or Taproot. It’s the DNA of Bitcoin itself.

---

## Evolution of Commit-Reveal

![](https://cdn-images-1.medium.com/max/800/1*BttYEFyVYnRx0ocaAdwuKg.png)

The abstraction deepens. The privacy improves. The core logic remains unchanged.

---

## Locking Script Formats

## P2PKH

```
OP_DUP OP_HASH160 <20-byte pubkey_hash> OP_EQUALVERIFY OP_CHECKSIG
```

## P2SH

```
OP_HASH160 <20-byte script_hash> OP_EQUAL
```

## P2WPKH

```
OP_0 <20-byte pubkey_hash>
```

## P2WSH

```
OP_0 <32-byte script_hash>
```

## P2TR

```
OP_1 <32-byte output_pubkey>
```

**How nodes differentiate SegWit types:**

- `OP_0` + 20 bytes → P2WPKH

- `OP_0` + 32 bytes → P2WSH

- `OP_1` + 32 bytes → P2TR

---

## The Verification Flow

## Universal Pattern

```
Step 1: Verify Commit — Does the revealed content match what was promised?
Step 2: Execute Script — Do the conditions evaluate to true?
```

## P2SH Verification

```
HASH160(redeem_script) == hash in locking script?
Match → Execute redeem_script
```

## P2WSH Verification

```
SHA256(witness_script) == hash in locking script?
Match → Execute witness_script
```

## P2TR Script Path Verification

```
1. Extract internal_pubkey from control block
2. Compute tapleaf_hash from script
3. Calculate merkle_root using Merkle path
4. tweak = TaggedHash("TapTweak", internal_pubkey || merkle_root)
5. computed_pubkey = internal_pubkey + tweak × G
6. computed_pubkey == output_pubkey in locking script?
7. Match → Execute tapscript
```

---

## Stack Execution Visualized

## Example 1: P2PKH

**Locking Script:** `OP_DUP OP_HASH160 <pubkey_hash> OP_EQUALVERIFY OP_CHECKSIG`

**Unlock Data:** `<signature> <pubkey>`

```
Initial Stack      OP_DUP         OP_HASH160      PUSH hash
┌─────────┐       ┌─────────┐    ┌─────────┐     ┌─────────┐
│ pubkey  │       │ pubkey  │    │ pk_hash │     │ pk_hash │ ← expected
├─────────┤       ├─────────┤    ├─────────┤     ├─────────┤
│ sig     │       │ pubkey  │    │ pubkey  │     │ pk_hash │ ← computed
└─────────┘       ├─────────┤    ├─────────┤     ├─────────┤
                  │ sig     │    │ sig     │     │ pubkey  │
                  └─────────┘    └─────────┘     ├─────────┤
                                                 │ sig     │
                                                 └─────────┘

OP_EQUALVERIFY     OP_CHECKSIG      Final
┌─────────┐        ┌─────────┐      ┌─────────┐
│ pubkey  │        │ 1(true) │      │ 1(true) │ ✓
├─────────┤        └─────────┘      └─────────┘
│ sig     │
└─────────┘
```

---

## Example 2: P2SH with Timelock

**Redeem Script:** `OP_3 OP_CSV OP_DROP OP_DUP OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG`

**Unlock Data:** `<signature> <pubkey>`

```
Initial Stack      PUSH 3         OP_CSV          OP_DROP
┌─────────┐       ┌─────────┐    ┌─────────┐     ┌─────────┐
│ pubkey  │       │ 3       │    │ 3       │     │ pubkey  │
├─────────┤       ├─────────┤    ├─────────┤     ├─────────┤
│ sig     │       │ pubkey  │    │ pubkey  │     │ sig     │
└─────────┘       ├─────────┤    ├─────────┤     └─────────┘
                  │ sig     │    │ sig     │
                  └─────────┘    └─────────┘
                                 Check nSeq ≥ 3

Continues with standard P2PKH logic...
```

---

## Example 3: P2WPKH

**Locking Script:** `OP_0 <20-byte pubkey_hash>`

**Witness:** `<signature> <pubkey>`

Node sees `OP_0 + 20 bytes`, implicitly executes P2PKH logic:

```
Verification: HASH160(pubkey) == hash in locking script? Match → Continue


Execution (implicit P2PKH logic):

Initial Stack      OP_DUP         OP_HASH160      PUSH hash
┌─────────┐       ┌─────────┐    ┌─────────┐     ┌─────────┐
│ pubkey  │       │ pubkey  │    │ pk_hash │     │ pk_hash │ ← expected
├─────────┤       ├─────────┤    ├─────────┤     ├─────────┤
│ sig     │       │ pubkey  │    │ pubkey  │     │ pk_hash │ ← computed
└─────────┘       ├─────────┤    ├─────────┤     ├─────────┤
                  │ sig     │    │ sig     │     │ pubkey  │
                  └─────────┘    └─────────┘     ├─────────┤
                                                 │ sig     │
                                                 └─────────┘
OP_EQUALVERIFY     OP_CHECKSIG      Final
┌─────────┐        ┌─────────┐      ┌─────────┐
│ pubkey  │        │ 1(true) │      │ 1(true) │ ✓
├─────────┤        └─────────┘      └─────────┘
│ sig     │
└─────────┘
```

**Difference from P2PKH:** Identical logic, unlock data moved from scriptSig to witness.

---

## Example 4: P2WSH (2-of-3 Multisig)

**Locking Script:** `OP_0 <32-byte script_hash>`

**Witness Script:** `OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG`

**Witness:** `OP_0 <sig1> <sig2> <witness_script>`

```
Verification: SHA256(witness_script) == hash? Match → Execute witness_script


Execution:
Initial Stack (witness data excluding witness_script)
┌─────────┐
│ sig2    │
├─────────┤
│ sig1    │
├─────────┤
│ 0       │ ← CHECKMULTISIG bug placeholder
└─────────┘
PUSH 2         PUSH pk1       PUSH pk2       PUSH pk3
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ 2       │    │ pk1     │    │ pk2     │    │ pk3     │
├─────────┤    ├─────────┤    ├─────────┤    ├─────────┤
│ sig2    │    │ 2       │    │ pk1     │    │ pk2     │
├─────────┤    ├─────────┤    ├─────────┤    ├─────────┤
│ sig1    │    │ sig2    │    │ 2       │    │ pk1     │
├─────────┤    ├─────────┤    ├─────────┤    ├─────────┤
│ 0       │    │ sig1    │    │ sig2    │    │ 2       │
└─────────┘    ├─────────┤    ├─────────┤    ├─────────┤
               │ 0       │    │ sig1    │    │ sig2    │
               └─────────┘    ├─────────┤    ├─────────┤
                              │ 0       │    │ sig1    │
                              └─────────┘    ├─────────┤
                                             │ 0       │
                                             └─────────┘



PUSH 3                    OP_CHECKMULTISIG           Final
┌─────────┐               ┌─────────┐                ┌─────────┐
│ 3       │               │ 1(true) │                │ 1(true) │ ✓
├─────────┤               └─────────┘                └─────────┘
│ pk3     │
├─────────┤               Verify: at least 2 of 3
│ pk2     │               signatures are valid
├─────────┤
│ pk1     │
├─────────┤
│ 2       │
├─────────┤
│ sig2    │
├─────────┤
│ sig1    │
├─────────┤
│ 0       │ ← consumed (legacy bug)
└─────────┘
```

**The CHECKMULTISIG bug:** Due to an off-by-one error in the original implementation, an extra stack element is consumed. Hence the dummy `OP_0` at the start of witness.

---

## Example 5: Taproot Script Path

**Tapscript:** `OP_2 OP_CSV OP_DROP <pubkey> OP_CHECKSIG`

**Witness:** `<signature> <script> <control_block>`

```
Verification: control_block + script → reconstruct output_pubkey → match locking script

Execution:
Initial Stack      PUSH 2         OP_CSV          OP_DROP
┌─────────┐       ┌─────────┐    ┌─────────┐     ┌─────────┐
│ sig     │       │ 2       │    │ 2       │     │ sig     │
└─────────┘       ├─────────┤    ├─────────┤     └─────────┘
                  │ sig     │    │ sig     │
                  └─────────┘    └─────────┘
                                 Check nSeq ≥ 2



PUSH pubkey        OP_CHECKSIG        Final
┌─────────┐        ┌─────────┐        ┌─────────┐
│ pubkey  │        │ 1(true) │        │ 1(true) │ ✓
├─────────┤        └─────────┘        └─────────┘
│ sig     │
└─────────┘
```

---

## What SegWit Actually Changed

SegWit wasn’t a revolution. It was a relocation:

![](https://cdn-images-1.medium.com/max/800/1*mKiJ-2uXgxgDFHN1Xi0HcQ.png)

---

## What Taproot Actually Changed

Taproot optimized the commit-reveal paradigm:

![](https://cdn-images-1.medium.com/max/800/1*eLHjPezLIyQSWDnKbx2Y9w.png)

**Control Block Structure:**

```
[1 byte: leaf_version + parity] [32 bytes: internal_pubkey] [32 bytes × N: Merkle path]
```

**Verification Formula:**

```
output_pubkey = internal_pubkey + TaggedHash("TapTweak", internal_pubkey || merkle_root) × G
```

---

## Key Takeaways

1. **Every address type is commit-reveal** — Lock with a hash/pubkey commitment, unlock by revealing the preimage

1. **Locking scripts are routing labels** — Nodes use the format to determine validation rules; they don’t execute on stack

1. **Verification precedes execution** — First prove “you have the right to run this script”, then verify “does the script pass”

1. **Stack execution is universal** — Regardless of address type, it’s all push, pop, verify signatures, check timelocks

1. **The trajectory is clear:**

- Commitments grow more abstract (pubkey → hash → tweak)

- Privacy improves (expose everything → expose only what’s used)

- Efficiency increases (fee optimization, verification optimization)

---

*Understanding these primitives is the foundation for everything that follows — Lightning channels, covenant proposals, and whatever comes next.*

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [November 28, 2025](https://medium.com/p/4db16924232f).

[Canonical link](https://medium.com/@aaron.recompile/the-anatomy-of-bitcoin-scripts-from-p2pkh-to-taproot-4db16924232f)

Exported from [Medium](https://medium.com) on July 3, 2026.
