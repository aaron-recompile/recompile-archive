---
title: "Taproot Control Block Deep Analysis & Stack Execution Visualization | Part 2"
subtitle: "In Part 1, we implemented a complete 4-leaf Taproot tree and successfully executed all spending paths on testnet. But Taproot’s core charm…"
tags: [bitcoin, taproot]
canonical_url: "https://medium.com/@aaron.recompile/taproot-control-block-deep-analysis-stack-execution-visualization-part-2-5ff10f98032c"
published: false
---

```
HODLing is the beginning.
But Bitcoin was meant to be programmed.

"Not Just HODLing: Real Bitcoin Script Engineering" starts here.
```

---

![](https://cdn-images-1.medium.com/max/800/1*Z8sIYxW1DKopadIqfFm3Lw.png)

---

In [Part 1](https://medium.com/@aaron.recompile/building-a-4-leaf-taproot-tree-in-python-the-first-complete-implementation-on-bitcoin-testnet-c8b66c331f29), we implemented a complete 4-leaf Taproot tree and successfully executed all spending paths on testnet. But Taproot’s core charm lies not only in implementation, but also in its sophisticated cryptographic mechanisms — how Control Blocks provide Merkle proofs, and how Tapscript executes in the Bitcoin virtual machine.

This article will deeply analyze Control Block construction principles, progressively verify Merkle paths through real on-chain data, and finally demonstrate stack execution processes through animations. This is not just a technical interpretation, but a cryptographic journey.

## Article Navigation

- **Merkle Tree Construction Principles**

- **Control Block Deep Analysis**

- **Merkle Path Reconstruction Verification**

- **Tweak Mechanism Detailed Explanation**

- **Stack Execution Visualization**

---

## Review of Our 4-Leaf Taproot Tree Structure

Let’s review the balanced Merkle tree we constructed:

```
               Root Hash
               /         \
         Branch0         Branch1
        /      \        /       \
  Script0   Script1  Script2  Script3
  (Hash)    (Multi)   (CSV)    (Sig)
```

**Functions of the Four Scripts**:

- **Script0**: SHA256 hash lock — spendable by anyone knowing “helloworld”

- **Script1**: 2-of-2 multisig — requires both Alice and Bob signatures

- **Script2**: CSV timelock — Bob can spend after waiting 2 blocks

- **Script3**: Simple signature — Bob can spend directly with signature

**Key Address Information**:

- **Taproot Address**: `tb1pjfdm902y2adr08qnn4tahxjvp6x5selgmvzx63yfqk2hdey02yvqjcr29q`

- **Internal Public Key**: `50be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3`

- **All transactions successfully confirmed on Bitcoin testnet**

## Merkle Tree Construction Principles: From TapLeaf to Root

## TaggedHash: Bitcoin’s Hash Standard

Taproot uses TaggedHash to prevent hash collision attacks between different protocols:

```
TaggedHash(tag, data) = SHA256(SHA256(tag) || SHA256(tag) || data)
```

This dual tagging mechanism ensures that Taproot hashes don’t accidentally collide with hashes from other Bitcoin protocols.

## TapLeaf Hash Calculation

Each script is first converted to a TapLeaf hash:

```
TapLeaf_Hash = TaggedHash("TapLeaf", version || script_length || script_data)
```

**Actual calculation using Script1 (multisig) as an example**:

```
// Script1 raw data (71 bytes)
script1_data = 002050be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3ba2084b5951609b76619a1ce7f48977b4312ebe226987166ef044bfb374ceef63af5ba5287

// TapLeaf calculation
Script1_Hash = TaggedHash("TapLeaf", 0xC0 || 0x47 || script1_data)
             = 63cb9e4776a1cbb195c5cf0cbdbb3110d308969353680e38ec5f446336b60def
```

Where:

- `0xC0`: Tapscript version identifier

- `0x47`: Script length (71 bytes in hexadecimal)

- `script1_data`: The actual script bytecode

## TapBranch Hash Calculation

Adjacent TapLeaf hashes are combined into TapBranch:

```
TapBranch_Hash = TaggedHash("TapBranch", left_hash || right_hash)
```

**Branch0 calculation (Script0 + Script1)**:

```
Script0_Hash = fe78d8523ce9603014b28739a51ef826f791aa17511e617af6dc96a8f10f659e
Script1_Hash = 63cb9e4776a1cbb195c5cf0cbdbb3110d308969353680e38ec5f446336b60def

Branch0 = TaggedHash("TapBranch", Script0_Hash || Script1_Hash)
        = 2faaa677cb6ad6a74bf7025e4cd03d2a82c7fb8e3c277916d7751078105cf9df
```

**Branch1 calculation (Script2 + Script3)**:

First calculate Script2 and Script3 TapLeaf hashes:

```
// Script2 (CSV timelock) - 20 bytes
script2_data = 52b2752084b5951609b76619a1ce7f48977b4312ebe226987166ef044bfb374ceef63af5ac
Script2_Hash = TaggedHash("TapLeaf", 0xC0 || 0x14 || script2_data)
             = 593d543a01c2c3c16c950ed97dfb3f3a1025b4b66323ed6b2814a1fb61d8e4b9
// Script3 (simple signature) - 34 bytes  
script3_data = 2084b5951609b76619a1ce7f48977b4312ebe226987166ef044bfb374ceef63af5ac
Script3_Hash = TaggedHash("TapLeaf", 0xC0 || 0x22 || script3_data)
             = d6ac4c0133faaf95feb8e5656367d882f250e23b3295cafcbc465779960d1210
```

Then calculate Branch1:

```
Branch1 = TaggedHash("TapBranch", Script2_Hash || Script3_Hash)
        = TaggedHash("TapBranch", 593d543a... || d6ac4c01...)
        = da55197526f26fa309563b7a3551ca945c046e5b7ada957e59160d4d27f299e3
```

## Final Root Calculation

```
Root = TaggedHash("TapBranch", Branch0 || Branch1)
     = d6ac4c0133faaf95feb8e5656367d882f250e23b3295cafcbc465779960d1210
```

This Root will be used together with the internal public key to generate the final Taproot address.

---

## Control Block Deep Analysis: Core of Cryptographic Proof

Control Block is the core of Taproot script path spending — it provides cryptographic proof that a specific script is indeed included in the Taproot address commitment.

## Using Script1 Multisig Transaction as Example

**Transaction ID**: `1951a3be0f05df377b1789223f6da66ed39c781aaf39ace0bf98c3beb7e604a1`

## Control Block Raw Data Deconstruction

**Control Block Original Data**:

```
c050be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3fe78d8523ce9603014b28739a51ef826f791aa17511e617af6dc96a8f10f659eda55197526f26fa309563b7a3551ca945c046e5b7ada957e59160d4d27f299e3
```

## Field Breakdown Visualization

## 🔴 Version + Parity (1 byte)

```
Bytes: c0
Position: [0]
```

**Analysis**:

- `c0` = `11000000` (binary)

- First 7 bits: `1100000` → Tapscript version identifier

- Last 1 bit: `0` → y-coordinate is even

**Purpose**: Specify script interpretation version and elliptic curve point y-coordinate parity

## 🔵 Internal PubKey (32 bytes)

```
Bytes: 50be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3
Position: [1-32]
```

**Analysis**: Alice’s internal public key, using x-only format (x-coordinate only)

**Purpose**:

- Key commitment binding

- Used for final Taproot address Tweak calculation

- Proves Control Block corresponds to specific internal key

## 🟡 Sibling Hash (32 bytes)

```
Bytes: fe78d8523ce9603014b28739a51ef826f791aa17511e617af6dc96a8f10f659e
Position: [33-64]
```

**Analysis**: Script0 (hash lock script) TapLeaf hash

**Merkle Proof Role**:

```
Branch0
   ┌─────┴─────┐
Script0     Script1 ← Current script to prove
   ↑           
   └─ Provide sibling node hash for Branch0 reconstruction
```

**Purpose**: Provide Script1’s sibling node hash for Branch0 reconstruction

## 🟢 Branch Hash (32 bytes)

```
Bytes: da55197526f26fa309563b7a3551ca945c046e5b7ada957e59160d4d27f299e3
Position: [65-96]
```

**Analysis**: Complete Branch1 hash (Script2+Script3 combination)

**Merkle Proof Role**:

```
      Root
    ┌───┴───┐
Branch0   Branch1 ← Provide entire opposite branch
  ↑         
  └─ Just reconstructed branch
```

**Purpose**: Provide opposite branch hash for final Root reconstruction

---

## Proof Path Overview

```
Script1 Proof Path: Script1 → Branch0 → Root
```

```
Required Data:
✓ Script1 content (obtained from witness)
✓ Script0 hash (🟡 Sibling Hash)
✓ Branch1 hash (🟢 Branch Hash)
✓ Internal public key (🔵 Internal PubKey)
```

```
Reconstruction Process:
1. Script1 + Script0 hash → Branch0
2. Branch0 + Branch1 hash → Root
3. Root + Internal public key → Verify Taproot address
```

## Minimal Disclosure Principle

Control Block design embodies the **minimal disclosure** cryptographic principle:

**Hidden Information**:

- ❌ Script0 specific content (only provides hash)

- ❌ Script2 and Script3 specific content (only provides combined hash)

- ❌ Complete structure of entire script tree

**Exposed Information**:

- ✅ Script1 content (required for execution)

- ✅ Minimal Merkle proof path

- ✅ Necessary key commitment

This design ensures only the executed script path is exposed, while all other possible spending conditions remain completely hidden, achieving Taproot’s privacy protection goals.

---

## Reconstructing Merkle Path: Complete Proof from Script1 to Root

Now we will demonstrate step by step how to reconstruct the complete Merkle Root from Control Block information, thereby proving Script1 is indeed included in this Taproot address.

## Step 1: Reconstruct Branch0

**Known Information**:

- Script1 content (obtained from witness)

- Script0 hash (obtained from Control Block’s 🟡Sibling Hash field)

**Calculation Process**:

```
Script0_Hash = fe78d8523ce9603014b28739a51ef826f791aa17511e617af6dc96a8f10f659e
Script1_Hash = TaggedHash("TapLeaf", 0xC0 || 0x47 || script1_data)
             = 63cb9e4776a1cbb195c5cf0cbdbb3110d308969353680e38ec5f446336b60def
Branch0 = TaggedHash("TapBranch", fe78d852... || 63cb9e47...)
        = 2faaa677cb6ad6a74bf7025e4cd03d2a82c7fb8e3c277916d7751078105cf9df
```

**Key Insight**: We don’t need to know Script0’s specific content, only its hash value to reconstruct Branch0. This is exactly how MAST privacy works — unused script paths remain completely hidden.

## Step 2: Reconstruct Root

**Known Information**:

- Branch0 (just calculated)

- Branch1 hash (obtained from Control Block’s 🟢Branch Hash field)

**Calculation Process**:

```
Branch1 = da55197526f26fa309563b7a3551ca945c046e5b7ada957e59160d4d27f299e3

Root = TaggedHash("TapBranch", 2faaa677... || da551975...)
     = d6ac4c0133faaf95feb8e5656367d882f250e23b3295cafcbc465779960d1210
```

**Verification Result**: This calculated Root must be completely identical to the Root used during address generation, otherwise verification fails.

## Mathematical Principles of Merkle Path

Control Block essentially provides a **Merkle inclusion proof**:

```
Proof Path: Script1 → Branch0 → Root
Required Data: Script1 itself + Script0 hash + Branch1 hash
```

The elegance of this design lies in:

- **Minimal Disclosure**: Only exposes necessary information on execution path

- **Efficient Verification**: O(log n) complexity proof verification

- **Privacy Protection**: Unused scripts completely hidden

---

## From Root to Taproot Address: Complete Tweak Verification Process

Now that we have reconstructed the Root, we need to verify this Root indeed corresponds to our Taproot address. This is achieved through Taproot’s Tweak mechanism.

## Tweak Mechanism Principles

Taproot addresses are generated by “tweaking” the internal public key, with the formula:

```
tweak = TaggedHash("TapTweak", internal_pubkey || merkle_root)
taproot_pubkey = internal_pubkey + tweak × G (elliptic curve point addition)
```

This design ensures:

1. **Commitment Binding**: Address uniquely corresponds to a specific script tree

1. **Key Derivation**: Those with internal private key can derive tweaked private key

1. **Verification Transparency**: Anyone can verify correspondence between address and script tree

## Step 1: Calculate Tweak Value

**Input Parameters**:

- **Internal Public Key**: `50be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3`

- **Merkle Root**: `d6ac4c0133faaf95feb8e5656367d882f250e23b3295cafcbc465779960d1210`

**Calculation Process**:

```
tweak_input = 50be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3 || 
              d6ac4c0133faaf95feb8e5656367d882f250e23b3295cafcbc465779960d1210

tweak = TaggedHash("TapTweak", tweak_input)
      = SHA256(SHA256("TapTweak") || SHA256("TapTweak") || tweak_input)
      = 41e4a46b999a3afcc3f3c7a6e5bf5f96e950c7be3a22cd0b4a4c1e5fdd027788
```

## Step 2: Elliptic Curve Point Operations

**Internal Public Key Point**:

```
internal_point = secp256k1_point(50be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3)
```

**Tweak Point**:

```
tweak_scalar = 41e4a46b999a3afcc3f3c7a6e5bf5f96e950c7be3a22cd0b4a4c1e5fdd027788
tweak_point = tweak_scalar × G  (G is secp256k1 generator point)
```

**Taproot Public Key**:

```
taproot_point = internal_point + tweak_point
taproot_pubkey = x_coordinate(taproot_point)  // Take x-coordinate as x-only public key
```

## Step 3: Final Verification

**Calculation Result**:

```
taproot_pubkey = 925bb2bd44575a379c139d57db9a4c0e8d4867e8db046d4489059576e48f5118
```

**Address Conversion**:

```
// Bech32m encoding
taproot_address = bech32m_encode("tb", 1, taproot_pubkey)
                = tb1pjfdm902y2adr08qnn4tahxjvp6x5selgmvzx63yfqk2hdey02yvqjcr29q
```

**✅ Verification Successful**: This result completely matches our used Taproot address!

This mathematical verification proves:

- Script1 is indeed committed in the Merkle tree

- Merkle Root correctly corresponds to our Taproot address

- Control Block provides valid cryptographic proofComparative Analysis of Other Script Paths’ Control Blocks

Let’s quickly compare the Control Block structures of the other three scripts, observing differences in Merkle proof paths:

## Script0 (Hash Lock) — Complete TXID

**TXID**: `1ba4835fca1c94e7eb0016ce37c6de2545d07d84a97436f8db999f33a6fd6845`

```
c050be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d363cb9e4776a1cbb195c5cf0cbdbb3110d308969353680e38ec5f446336b60defda55197526f26fa309563b7a3551ca945c046e5b7ada957e59160d4d27f299e3
```

**Key Fields**:

- 🟡 **Sibling Hash**: `63cb9e47...` (Script1's hash, because Script0 needs Script1 as sibling)

- 🟢 **Branch Hash**: `da551975...` (Branch1 hash, same as Script1)

## Script2 (CSV Timelock) — Complete TXID

**TXID**: `98361ab2c19aa0063f7572cfd0f66cb890b403d2dd12029426613b40d17f41ee`

```
c050be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d32faaa677cb6ad6a74bf7025e4cd03d2a82c7fb8e3c277916d7751078105cf9dfd6ac4c0133faaf95feb8e5656367d882f250e23b3295cafcbc465779960d1210
```

**Field Breakdown**:

- 🟡 **Sibling Hash**: `593d543a...1fb61d8e4b9` (Script3's hash!)

- 🟢 **Branch Hash**: `d6ac4c01...779960d1210` (Branch0 hash!)

**Script2’s Proof Path**: `Script2 → Branch1 → Root`

- Needs Script3 hash as sibling to reconstruct Branch1

- Needs Branch0 hash to reconstruct Root

## Script3 (Simple Signature) — Complete TXID

**TXID**: `1af46d4c71e121783c3c7195f4b45025a1f38b73fc8898d2546fc33b4c6c71b9`

```
c050be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3593d543a01c2c3c16c950ed97dfb3f3a1025b4b66323ed6b2814a1fb61d8e4b9d6ac4c0133faaf95feb8e5656367d882f250e23b3295cafcbc465779960d1210
```

**Field Breakdown**:

- 🟡 **Sibling Hash**: `593d543a...1fb61d8e4b9` (Script2's hash)

- 🟢 **Branch Hash**: `d6ac4c01...779960d1210` (Branch0 hash)

**Script3’s Proof Path**: `Script3 → Branch1 → Root`

- Needs Script2 hash as sibling to reconstruct Branch1

- Needs Branch0 hash to reconstruct Root

## Control Block Pattern Summary

Script Tree Position Sibling Hash Branch Hash Proof Path Script0 Branch0 left Script1 hash Branch1 hash Script0→Branch0→Root Script1 Branch0 right Script0 hash Branch1 hash Script1→Branch0→Root Script2 Branch1 left Script3 hash Branch0 hash Script2→Branch1→Root Script3 Branch1 right Script2 hash Branch0 hash Script3→Branch1→Root

**Key Insights**:

- **Same-branch scripts**: Are sibling nodes to each other (Script0↔Script1, Script2↔Script3)

- **Cross-branch proof**: Requires hash of entire opposite branch

- **Proof minimization**: Each Control Block contains only minimum information needed to reconstruct Root

---

## Script1 Multisig Stack Execution Deep Analysis

Since we have cryptographically verified that Script1 is indeed in this Taproot address, now let’s deeply analyze its execution process in the Bitcoin virtual machine.

## Complete Script1 Bytecode Analysis

**Raw Bytecode (71 bytes)**:

```
002050be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3ba2084b5951609b76619a1ce7f48977b4312ebe226987166ef044bfb374ceef63af5ba5287
```

**Byte-level Breakdown**:

```
00                    OP_0 (initialize counter)
20                    OP_PUSHBYTES_32 (push 32 bytes)
50be5fc4...26bb4d3   Alice's x-only public key (32 bytes)
ba                    OP_CHECKSIGADD (verify signature and increment counter)
20                    OP_PUSHBYTES_32 (push 32 bytes)  
84b59516...eef63af5  Bob's x-only public key (32 bytes)
ba                    OP_CHECKSIGADD (verify signature and increment counter)
52                    OP_2 (push number 2)
87                    OP_EQUAL (check equality)
```

This is the standard Tapscript 2-of-2 multisig pattern, using the efficient `OP_CHECKSIGADD` opcode introduced in BIP 342.

## Witness Data Structure and Consumption Order

**Transaction ID**: `1951a3be0f05df377b1789223f6da66ed39c781aaf39ace0bf98c3beb7e604a1`

**Pre-execution Preparation**

**Control Block Verification**: Script1 is indeed in Merkle Root ✅

## Stage 0: Witness Data Pushed onto Execution Stack

**Bob signature enters stack first**:

```
┌─────────────────────────────────┐
│         Execution Stack          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │         Bob Signature       │ │ ← Stack bottom
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Alice signature enters stack second**:

```
┌─────────────────────────────────┐
│         Execution Stack          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │        Alice Signature      │ │ ← Stack top
│ ├─────────────────────────────┤ │
│ │         Bob Signature       │ │ ← Stack bottom
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

```
witness[0] = Bob signature (enters stack first)
witness[1] = Alice signature (enters stack second)
```

**Detailed Witness Data**:

```
[0] Bob Signature (64 bytes):
    31fa0ca7929dac01b908349326183dd7a0f752475d42f11dc2cd0075110ca2a4c
    255f3e310dfc0800e69609c872254241dcf827847e5b64821cefa6c6db575bc

[1] Alice Signature (64 bytes):
    22272de665b998668ae9e97cb72d9814d362ae101ee878caee04da0d2a7efb14
    e8bcdd7eb8082fad30864ec7f22bce6fb2d2178764a0b2f5427346e4b5821fa0
```

## Script1 Execution Process

**Script1 Bytecode Breakdown**:

```
OP_0 → OP_PUSHBYTES_32(Alice pubkey) → OP_CHECKSIGADD → 
OP_PUSHBYTES_32(Bob pubkey) → OP_CHECKSIGADD → OP_2 → OP_EQUAL
```

## Step 1: OP_0

```
┌─────────────────────────────────┐
│         Execution Stack          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │             0               │ │ ← Newly pushed
│ ├─────────────────────────────┤ │
│ │        Alice Signature      │ │
│ ├─────────────────────────────┤ │
│ │         Bob Signature       │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Step 2: OP_PUSHBYTES_32 (Alice Public Key)

```
┌─────────────────────────────────┐
│         Execution Stack          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │        Alice_PubKey         │ │ ← Newly pushed
│ │    50be5fc4...126bb4d3       │ │
│ ├─────────────────────────────┤ │
│ │             0               │ │
│ ├─────────────────────────────┤ │
│ │        Alice Signature      │ │
│ ├─────────────────────────────┤ │
│ │         Bob Signature       │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Step 3: OP_CHECKSIGADD (Verify Alice)

```
Pop Alice public key, consume Alice signature, push 1 after verification
```

```
┌─────────────────────────────────┐
│         Execution Stack          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │             1               │ │ ← Verification successful
│ ├─────────────────────────────┤ │
│ │   ❌Alice Signature(consumed)│ │
│ ├─────────────────────────────┤ │
│ │         Bob Signature       │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Step 4: OP_PUSHBYTES_32 (Bob Public Key)

```
┌─────────────────────────────────┐
│         Execution Stack          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │         Bob_PubKey          │ │ ← Newly pushed
│ │    84b59516...eef63af5       │ │
│ ├─────────────────────────────┤ │
│ │             1               │ │
│ ├─────────────────────────────┤ │
│ │   ❌Alice Signature(consumed)│ │
│ ├─────────────────────────────┤ │
│ │         Bob Signature       │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Step 5: OP_CHECKSIGADD (Verify Bob)

```
Pop Bob public key, consume Bob signature, push 2 after verification
```

```
┌─────────────────────────────────┐
│         Execution Stack          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │             2               │ │ ← Verification successful
│ ├─────────────────────────────┤ │
│ │   ❌Alice Signature(consumed)│ │
│ ├─────────────────────────────┤ │
│ │   ❌Bob Signature(consumed)  │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Step 6: OP_2

```
┌─────────────────────────────────┐
│         Execution Stack          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │             2               │ │ ← Newly pushed (required count)
│ ├─────────────────────────────┤ │
│ │             2               │ │ ← Actual count
│ ├─────────────────────────────┤ │
│ │   ❌Alice Signature(consumed)│ │
│ ├─────────────────────────────┤ │
│ │   ❌Bob Signature(consumed)  │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Step 7: OP_EQUAL

```
Pop both 2s for comparison, push TRUE
```

```
┌─────────────────────────────────┐
│         Execution Stack          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │            TRUE             │ │ ← Comparison result
│ ├─────────────────────────────┤ │
│ │   ❌Alice Signature(consumed)│ │
│ ├─────────────────────────────┤ │
│ │   ❌Bob Signature(consumed)  │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Key Insights

**Execution Order**:

1. Bob signature enters stack first (witness[0])

1. Alice signature enters stack second (witness[1])

1. Script processes in Alice→Bob order, but Alice signature at stack top is consumed first

1. This perfectly explains the witness array index relationship

**LIFO Consumption Logic**:

- Stack entry order: Bob → Alice

- Consumption order: Alice → Bob (last in, first out)

- Script execution order: Alice pubkey → Alice signature consumption → Bob pubkey → Bob signature consumption

---

## Summary: Complete Cryptographic Loop of Taproot Mechanism

Through this in-depth analysis, we have completely verified Taproot’s cryptographic mechanisms:

## 1. Merkle Tree Construction

- Use TaggedHash to build collision-resistant hash trees

- TapLeaf hashes commit individual scripts

- TapBranch hashes combine subtrees

- Final Root commits the entire script set

## 2. Control Block Interpretation

- **🔴 Version Field**: Specifies script version and coordinate parity

- **🔵 Internal Public Key**: Provides key commitment

- **🟡🟢 Merkle Proof**: Provides minimized inclusion proof path

## 3. Real Data Verification

- Reconstruct complete Merkle Root from Control Block

- Verify Root’s correspondence to address through Tweak mechanism

- Prove specific script is indeed committed in Taproot address

## 4. Script Stack Execution

- LIFO consumption mechanism of witness data

- Efficient signature verification in Tapscript

- Stack state changes of multisig logic

This is Taproot’s complete cryptographic loop — from script commitment to Merkle proof, from address generation to stack execution, every step embodies sophisticated cryptographic design.

---

## Looking Forward to Part 3

In Part 3, we will build an interactive visualization tool that allows readers to:

- Adjust script content in real-time and observe Merkle tree changes

- Simulate different Control Block constructions

- Compare costs and privacy characteristics of various spending paths

- Explore unbalanced trees and optimization strategies

Stay tuned for this visual feast of Taproot technology!

---

*This article is part of the “Not Just HODLing: Real Bitcoin Script Engineering” series. Previous articles covered *[*CSV timelocks with P2SH*](https://medium.com/@aaron.recompile/how-i-built-a-time-locked-bitcoin-script-with-csv-and-p2sh-c48c0389709d)* and *[*basic Taproot implementation*](https://medium.com/@aaron.recompile/a-guide-to-creating-taproot-scripts-with-python-bitcoinutils-e088633bc2a7)*.*

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [July 7, 2025](https://medium.com/p/5ff10f98032c).

[Canonical link](https://medium.com/@aaron.recompile/taproot-control-block-deep-analysis-stack-execution-visualization-5ff10f98032c)

Exported from [Medium](https://medium.com) on July 3, 2026.
