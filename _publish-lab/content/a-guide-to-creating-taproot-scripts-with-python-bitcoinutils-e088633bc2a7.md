---
title: "A Guide to Creating Taproot Scripts with Python Bitcoinutils"
subtitle: "Not Just HODLing: Real Bitcoin Script Engineering # 2"
tags: [bitcoin, taproot]
canonical_url: "https://medium.com/@aaron.recompile/a-guide-to-creating-taproot-scripts-with-python-bitcoinutils-e088633bc2a7"
cover_image: "https://cdn-images-1.medium.com/max/800/1*Lg-Du_OQjg4scMGP5rSv8g.png"
published: false
---

```
HODLing is the beginning.
But Bitcoin was meant to be programmed.

"Not Just HODLing: Real Bitcoin Script Engineering" starts here.
```

*Building Taproot addresses with dual Script Path leaves and understanding both Key Path and Script Path spending through real testnet transactions*

**Target Audience:** Developers already comfortable with Bitcoin key/address basics and want to go deeper into Taproot script path spending. This is not a beginner’s guide — it assumes familiarity with SegWit and Python Bitcoin tooling.

---

## Article Structure Preview

- **Motivation and Case Overview**

- **Building the Dual-Leaf Script Path (Code Walkthrough)**

- **Three-Path Spending Structure Deep Dive**

- **Animated Stack Execution Walkthrough**

- **Control Block Cryptographic Analysis**

- **The Tweak: From Internal Key to Taproot Address**

- **Debugging and On-Chain Data Verification**

- **Summary and Takeaways**

---

## 1. Motivation and Case Overview

**The Scenario:** Alice wants to create a flexible payment arrangement with Bob. She needs an address where:

- She can spend the funds herself anytime (*Key Path*)

- Bob can claim the funds if he knows a secret preimage (*HashLock*)

- Bob can also claim the funds using his signature as an alternative (*Pay-to-PubKey*)

This is useful for conditional payments, atomic swaps, or escrow-like arrangements where multiple parties need different ways to access the same funds.

**The goal of this guide:**

- Build a Taproot address with **three spending paths**: Key Path (Alice) + Script Path with two leaves (HashLock + P2PK)

- Actually send and spend coins using **both Script Path leaves**, broadcasting real transactions on testnet

- Through this dual-leaf Script Path case, help you fully understand Taproot’s script trees, Control Blocks, and the cryptographic proofs that make Script Path spending secure

- Be able to trace every byte of witness data and verify Control Block construction in a block explorer

**Our Testnet Achievement:**

- **Escrow Address**: `tb1p93c4wxsr87p88jau7vru83zpk6xl0shf5ynmutd9x0gxwau3tngq9a4w3z`

- **HashLock Script Transaction**: `b61857a05852482c9d5ffbb8159fc2ba1efa3dd16fe4595f121fc35878a2e430`

- **P2PK Script Transaction**: `185024daff64cea4c82f129aa9a8e97b4622899961452d1d144604e65a70cfe0`

---

## 2. Building the Dual-Path Taproot (Code Walkthrough)

Let’s walk through the key components needed to create our dual-path Taproot address and spending transactions.

## Setting Up Keys and Scripts

```
def create_dual_path_taproot():
    setup('testnet')
    
    # Alice's key (internal key for Key Path)
    alice_private = PrivateKey('')
    alice_public = alice_private.get_public_key()
    
    # Bob's key (for Script Path 2)
    bob_private = PrivateKey('')
    bob_public = bob_private.get_public_key()
    
    # Create HashLock script (Script Path 1)
    preimage = "helloworld"
    preimage_hash = hashlib.sha256(preimage.encode()).hexdigest()
    hashlock_script = Script([
        'OP_SHA256',
        preimage_hash,
        'OP_EQUALVERIFY', 
        'OP_TRUE'  # Anyone with correct preimage can spend, not locked to specific key
                   # WARNING: Should be used with off-chain protocols to prevent front-running
    ])
    
    # Create Pay-to-PubKey script (Script Path 2)  
    p2pk_script = Script([
        bob_public.to_x_only_hex(),
        'OP_CHECKSIG'
    ])
    
    # Build script tree and generate Taproot address
    all_scripts = [hashlock_script, p2pk_script]
    taproot_address = alice_public.get_taproot_address(all_scripts)
    
    return taproot_address, all_scripts, alice_private, bob_private, preimage
```

## HashLock Script Spending

```
def spend_hashlock_script(utxo_txid, utxo_index, input_amount, 
                         taproot_address, all_scripts, alice_public, preimage):
    # Build transaction
    txin = TxInput(utxo_txid, utxo_index)
    txout = TxOutput(to_satoshis(input_amount - 0.0002), 
                     alice_public.get_taproot_address().to_script_pub_key())
    tx = Transaction([txin], [txout], has_segwit=True)
    
    # Create Control Block for hashlock_script (index 0)
    control_block = ControlBlock(alice_public, all_scripts, 0, 
                                is_odd=taproot_address.is_odd())
    
    # Build witness: [preimage, script, control_block]
    hashlock_script = all_scripts[0]
    preimage_hex = preimage.encode().hex()
    
    tx.witnesses.append(TxWitnessInput([
        preimage_hex,
        hashlock_script.to_hex(),
        control_block.to_hex()
    ]))
    
    return tx
```

## Pay-to-PubKey Script Spending

```
def spend_p2pk_script(utxo_txid, utxo_index, input_amount,
                     taproot_address, all_scripts, alice_public, bob_private):
    # Build transaction  
    txin = TxInput(utxo_txid, utxo_index)
    txout = TxOutput(to_satoshis(input_amount - 0.0002),
                     bob_private.get_public_key().get_taproot_address().to_script_pub_key())
    tx = Transaction([txin], [txout], has_segwit=True)
    
    # Sign with Bob's key for Script Path
    bob_signature = bob_private.sign_taproot_input(
        tx, 0, [taproot_address.to_script_pub_key()], [to_satoshis(input_amount)],
        script_path=True, tapleaf_script=all_scripts[1], tweak=False
    )
    
    # Create Control Block for p2pk_script (index 1)
    control_block = ControlBlock(alice_public, all_scripts, 1, 
                                is_odd=taproot_address.is_odd())
    
    # Build witness: [signature, script, control_block]
    tx.witnesses.append(TxWitnessInput([
        bob_signature,
        all_scripts[1].to_hex(),
        control_block.to_hex()
    ]))
    
    return tx
```

---

## 3. Two-Script Tree Structure Deep Dive

Our Taproot address demonstrates **three total spending paths**:

```
       TAPROOT ADDRESS
       /               \
   KEY PATH         SCRIPT PATH
   (Alice)         /           \
                  /             \
              HASHLOCK        P2PK
              (index 0)     (index 1)
```

**The Complete Structure:**

- **1 Key Path**: Alice can spend directly using her tweaked private key

- **2 Script Path Leaves**: Two distinct scripts form a binary merkle tree

Our Script Path contains a simple binary tree with two script leaves:

```
      MERKLE ROOT
    /            \
   /              \
HASHLOCK       P2PK
(index 0)    (index 1)
```

**Key Insight:** Unlike traditional representations, Taproot trees only contain **Script Paths**. The Key Path (Alice’s direct spending) is not a tree node — it’s computed separately using the internal key + merkle root tweak.

## Script Details

**HashLock Script (Anyone can spend with preimage):**

```
hashlock_script = Script([
    'OP_SHA256',                    # Hash the input
    '936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af',  # Expected hash
    'OP_EQUALVERIFY',               # Verify hashes match
    'OP_TRUE'                       # Always succeed if hash matches
])
```

**Pay-to-PubKey Script (Only Bob can spend with signature):**

```
p2pk_script = Script([
    '84b5951609b76619a1ce7f48977b4312ebe226987166ef044bfb374ceef63af5',  # Bob's x-only pubkey
    'OP_CHECKSIG'                   # Verify signature against pubkey
])
```

---

## 4. Animated Stack Execution Walkthrough

## HashLock Script Execution

**Real Transaction**: `b61857a05852482c9d5ffbb8159fc2ba1efa3dd16fe4595f121fc35878a2e430`

```
Step 1: Initial State
┌─────────────────────────────────────────────────────────────────┐
│ Witness Data:                                                   │
│ [0] 68656c6c6f776f726c64 ("helloworld")                         │
│ [1] a820936a185caaa266bb...8851 (script)                        │
│ [2] c050be5fc44ec580c3...f9df (control block)                   │
└─────────────────────────────────────────────────────────────────┘
```

```
Step 2: Preimage pushed to stack
┌─────────────────────────────────────────────────────────────────┐
│ "helloworld"                                                    │ ← Stack Top
└─────────────────────────────────────────────────────────────────┘
Stack (Top → Bottom): ["helloworld"]
Script: [OP_SHA256, expected_hash, OP_EQUALVERIFY, OP_TRUE]
```

```
Step 3: OP_SHA256 executes
┌─────────────────────────────────────────────────────────────────┐
│ 936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af │ ← Stack Top (computed hash)
└─────────────────────────────────────────────────────────────────┘
Stack (Top → Bottom): [computed_hash]
Script: [expected_hash, OP_EQUALVERIFY, OP_TRUE]
```

```
Step 4: Expected hash pushed from script
┌─────────────────────────────────────────────────────────────────┐
│ 936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af │ ← Stack Top (expected hash)
│ 936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af │ ← Stack Bottom (computed hash)
└─────────────────────────────────────────────────────────────────┘
Stack (Top → Bottom): [expected_hash, computed_hash]
Script: [OP_EQUALVERIFY, OP_TRUE]
```

```
Step 5: OP_EQUALVERIFY executes
         (Pops both values, compares them, pushes result)
┌─────────────────────────────────────────────────────────────────┐
│ 1 (true)                                                        │ ← Stack Top (comparison result)
└─────────────────────────────────────────────────────────────────┘
Stack (Top → Bottom): [true]
Script: [OP_TRUE]
```

```
Step 6: OP_TRUE executes
┌─────────────────────────────────────────────────────────────────┐
│ 1 (true)                                                        │ ← Stack Top (OP_TRUE result)
│ 1 (true)                                                        │ ← Stack Bottom (previous result)
└─────────────────────────────────────────────────────────────────┘
Stack (Top → Bottom): [true, true]
Result: SUCCESS ✅
```

## Pay-to-PubKey Script Execution

**Real Transaction**: `185024daff64cea4c82f129aa9a8e97b4622899961452d1d144604e65a70cfe0`

```
Step 1: Initial State
┌─────────────────────────────────────────────────────────────────┐
│ Witness Data:                                                   │
│ [0] 26a0eadca0bba3d1bb...f1c5c20 (bob_signature)                │
│ [1] 84b5951609b76619a1...63af5acc (script)                      │
│ [2] c050be5fc44ec580c38...f659e (control block)                 │
└─────────────────────────────────────────────────────────────────┘
```

```
Step 2: Signature pushed to stack
┌─────────────────────────────────────────────────────────────────┐
│ 26a0eadca0bba3d1bb6f82b8e1f76e2d84038c97a92fa95cc0b9f6a6a59ba... │ ← Stack Top
└─────────────────────────────────────────────────────────────────┘
Stack (Top → Bottom): [bob_signature]
Script: [bob_pubkey, OP_CHECKSIG]
```

```
Step 3: Bob's pubkey pushed from script
┌─────────────────────────────────────────────────────────────────┐
│ 84b5951609b76619a1ce7f48977b4312ebe226987166ef044bfb374ceef63af5 │ ← Stack Top (pubkey)
│ 26a0eadca0bba3d1bb6f82b8e1f76e2d84038c97a92fa95cc0b9f6a6a59ba... │ ← Stack Bottom (signature)
└─────────────────────────────────────────────────────────────────┘
Stack (Top → Bottom): [bob_pubkey, bob_signature]
Script: [OP_CHECKSIG]
```

```
Step 4: OP_CHECKSIG validates signature
         (Pops pubkey and signature, validates, pushes result)
┌─────────────────────────────────────────────────────────────────┐
│ 1 (true)                                                        │ ← Stack Top (validation result)
└─────────────────────────────────────────────────────────────────┘
Stack (Top → Bottom): [true]
Result: SUCCESS ✅
```

---

## 5. Control Block Cryptographic Analysis

Every Script Path spending requires a **Control Block** that cryptographically proves the script belongs to this Taproot address.

## Control Block Construction Deep Dive

Every Script Path spending requires a **Control Block** that cryptographically proves the script belongs to this Taproot address. Let’s examine how the ControlBlock constructor works:

```
# Create Control Block for hashlock_script (index 0)
control_block = ControlBlock(
    alice_public,        # Internal public key
    all_scripts,         # Complete script array [hashlock_script, p2pk_script]  
    0,                   # Script index (hashlock_script is at index 0)
    is_odd=taproot_address.is_odd()  # Affects the first byte prefix
)
```

**Key Details:**

- **leaf_index**: Directly corresponds to script position in the array. The library uses this to determine which script we’re proving and which becomes the sibling hash.

- **is_odd**: Controls the parity bit in the Control Block’s first byte. If the final Taproot output key’s y-coordinate is odd, this becomes `c1` instead of `c0`.

- **Script order matters**: The array order [hashlock_script, p2pk_script] determines the merkle tree construction and sibling relationships.

## Control Block Structure Breakdown

**HashLock Control Block:**

```
c050be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d32faaa677cb6ad6a74bf7025e4cd03d2a82c7fb8e3c277916d7751078105cf9df
```

**P2PK Control Block:**

```
c050be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3fe78d8523ce9603014b28739a51ef826f791aa17511e617af6dc96a8f10f659e
```

## Three-Part Analysis

```
# Part 1: Leaf Version (1 byte)
leaf_version = "c0"  # TAPSCRIPT_VERSION = 0xc0

# Part 2: Internal Public Key (32 bytes)  
internal_key = "50be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3"

# Part 3: Sibling Hash (32 bytes)
# For HashLock: P2PK Script's tapleaf hash
hashlock_sibling = "2faaa677cb6ad6a74bf7025e4cd03d2a82c7fb8e3c277916d7751078105cf9df"

# For P2PK: HashLock Script's tapleaf hash  
p2pk_sibling = "fe78d8523ce9603014b28739a51ef826f791aa17511e617af6dc96a8f10f659e"
```

## Verifying Sibling Hashes

```
import hashlib

def compute_tapleaf_hash(script):
    """Compute BIP-341 tapleaf hash"""
    script_bytes = bytes.fromhex(script.to_hex())
    script_length = len(script_bytes)
    
    # Build leaf data: version + varint + script
    leaf_data = bytes([0xc0]) + bytes([script_length]) + script_bytes
    
    # Tagged hash: SHA256(tag || tag || data)
    tag_hash = hashlib.sha256(b"TapLeaf").digest()
    return hashlib.sha256(tag_hash + tag_hash + leaf_data).digest().hex()
    # Compute tapleaf hashes for verification
    hashlock_tapleaf = compute_tapleaf_hash(hashlock_script)
    p2pk_tapleaf = compute_tapleaf_hash(p2pk_script)
    print(f"HashLock tapleaf: {hashlock_tapleaf}")
    print(f"P2PK tapleaf:     {p2pk_tapleaf}")
    # Verify against Control Block sibling hashes
    print(f"HashLock CB sibling matches P2PK tapleaf: ✅")
    print(f"P2PK CB sibling matches HashLock tapleaf: ✅")
```

---

## 6. The Tweak: From Internal Key to Taproot Address

The cryptographic transformation that creates our Taproot address from Alice’s internal key:

## Tweak Formula

```
taproot_output_key = internal_key + (tweak * G)
```

Where:

- `internal_key` = Alice's public key

- `tweak` = `tagged_hash("TapTweak", internal_key || merkle_root)`

- `G` = Bitcoin's elliptic curve generator point

## Computing Our Specific Tweak

```
import hashlib

def tagged_hash(tag, msg):
    """Helper function for BIP-340 tagged hashes"""
    tag_hash = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(tag_hash + tag_hash + msg).digest()
def compute_tweak():
    # Internal key (Alice's pubkey x-only)
    internal_key_hex = "50be5fc44ec580c387bf45df275aaa8b27e2d7716af31f10eeed357d126bb4d3"
    
    # Our computed tapleaf hashes
    hashlock_tapleaf = "fe78d8523ce9603014b28739a51ef826f791aa17511e617af6dc96a8f10f659e"
    p2pk_tapleaf = "2faaa677cb6ad6a74bf7025e4cd03d2a82c7fb8e3c277916d7751078105cf9df"
    
    # Merkle root = SHA256(smaller_hash || larger_hash)
    # Note: "||" means concatenation, not Python logical OR
    if hashlock_tapleaf < p2pk_tapleaf:
        left, right = hashlock_tapleaf, p2pk_tapleaf
    else:
        left, right = p2pk_tapleaf, hashlock_tapleaf
        
    merkle_root = hashlib.sha256(
        bytes.fromhex(left) + bytes.fromhex(right)  # Concatenation of byte arrays
    ).digest()
    
    # Compute tweak = tagged_hash("TapTweak", internal_key || merkle_root)
    internal_key_bytes = bytes.fromhex(internal_key_hex)
    tweak = tagged_hash("TapTweak", internal_key_bytes + merkle_root)
    
    print(f"Internal key: {internal_key_hex}")
    print(f"Merkle root:  {merkle_root.hex()}")
    print(f"Tweak:        {tweak.hex()}")
    
    return tweak
```

- **Key Path vs Script Path**: Key Path spending requires the tweak to be applied to Alice’s private key, while Script Path spending uses `tweak=False` because the script itself provides the spending authorization.

- **Concatenation notation**: The `||` in cryptographic formulas means byte concatenation, implemented as `+` operator on Python byte arrays.

This tweak, when added to Alice’s internal key via elliptic curve point addition, produces the final Taproot output key that becomes our address.

---

## 7. Debugging and On-Chain Data Verification

## Control Block Verification Process

The Control Block’s essential purpose: **prove that a script belongs to the Taproot address** through cryptographic verification.

```
def verify_control_block(control_block_hex, script_hex, taproot_address):
    """Verify Control Block proves script membership"""
    
    # Parse control block components
    leaf_version = control_block_hex[:2]
    internal_key = control_block_hex[2:66]
    sibling_hash = control_block_hex[66:130]
    
    # Step 1: Compute script's tapleaf hash
    script_tapleaf = compute_tapleaf_hash_from_hex(script_hex)
    
    # Step 2: Reconstruct merkle root using sibling
    if script_tapleaf < sibling_hash:
        merkle_root = sha256(script_tapleaf + sibling_hash)
    else:
        merkle_root = sha256(sibling_hash + script_tapleaf)
    
    # Step 3: Compute tweak from internal key + merkle root
    tweak = tagged_hash("TapTweak", internal_key + merkle_root)
    
    # Step 4: Derive taproot output key
    output_key = internal_key_point + (tweak * G)
    
    # Step 5: Check if derived address matches original
    derived_address = key_to_taproot_address(output_key)
    
    return derived_address == taproot_address
```

## What Control Block Verification Proves

When verification succeeds, it mathematically guarantees:

1. **Script Authenticity**: This exact script was committed when the address was created

1. **Merkle Inclusion**: The script is a legitimate leaf in the original script tree

1. **Address Derivation**: The internal key + this script tree = this exact Taproot address

1. **No Forgery Possible**: Cannot create valid Control Blocks for uncommitted scripts

## Key Path: The Stealth Option

Alice can also spend using **Key Path** — the most private and efficient method:

```
def alice_key_path_spend():
    # Sign with tweaked private key
    alice_tweaked_sig = alice_private.sign_taproot_input(
        tx, 0, [scriptPubKey], [amount],
        script_path=False,          # Key Path signing
        tapleaf_scripts=all_scripts # Full script tree for tweak calculation
    )
    
    # Witness contains only the signature
    witness = [alice_tweaked_sig]  # Single element!
    
    return witness
```

**Key Path Advantages:**

- **Perfect Privacy**: No one knows other spending conditions exist

- **Maximum Efficiency**: Smallest possible witness data (~64 bytes)

- **Indistinguishable**: Looks identical to any other single-signature transaction

---

## 8. What Could Go Wrong: Debug Tips

## Common Control Block Issues

**Invalid Control Block Error:**

```
SCRIPT_ERR_TAPROOT_SCRIPT_MISMATCH
```

- **Cause**: Control Block doesn’t prove script membership

- **Debug**: Verify leaf_index matches script position in array

- **Check**: Ensure script hasn’t been modified after address creation

**Witness Program Mismatch:**

```
SCRIPT_ERR_WITNESS_PROGRAM_MISMATCH
```

- **Cause**: Witness data has wrong number of elements or incorrect sizes

- **Debug**: HashLock requires 3 elements: `[preimage, script, control_block]`

- **Check**: P2PK requires 3 elements: `[signature, script, control_block]`

## Tapleaf Hash Calculation Errors

**Wrong Script Encoding:**

```
# ❌ Wrong: Using raw script string
script_bytes = "OP_SHA256 936a18... OP_EQUALVERIFY OP_TRUE".encode()
```

```
# ✅ Correct: Using Script.to_hex() 
script_bytes = bytes.fromhex(script.to_hex())
```

**Varint Encoding Issues:**

```
# The BIP-341 tapleaf hash includes script length as varint
# For scripts < 253 bytes, varint is just the length byte
# Our scripts are typically 35-36 bytes, so varint = [35] or [36]
leaf_data = bytes([0xc0]) + bytes([len(script_bytes)]) + script_bytes
```

## Address Derivation Debugging

**Parity Bit Mismatch:**

```
# If derived address doesn't match, check the parity bit
if taproot_output_key.y % 2 == 1:
    control_block_prefix = 0xc1  # Odd y-coordinate
else:
    control_block_prefix = 0xc0  # Even y-coordinate
```

---

## 9. Summary and Takeaways

Through this real case and code, you have mastered:

- **Taproot dual-path script construction** using HashLock and P2PK patterns

- **Control Block three-part structure and verification** with deep understanding of leaf_index and parity bits

- **BIP-341 tapleaf hash computation** including proper varint encoding

- **Tweak calculation from internal key to Taproot address** with tagged hash implementation

- **Animated stack-based script execution** with precise stack ordering

- **Debugging and on-chain data analysis** including common error patterns

You now have a testnet-proven example to audit and replay. This forms the foundation for advanced applications like MuSig2, Taproot Assets, or recursive covenant design.

This is the essence of Real Bitcoin Script Engineering with Python Bitcoinutils.

---

## Source Code

All complete code examples and on-chain transaction analysis are available at my **github** repository.

Feel free to Star and Fork!

---

## References

- **BIP-341**: Taproot: SegWit version 1 spending rules

- **python-bitcoin-utils**: Official implementation library

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [June 29, 2025](https://medium.com/p/e088633bc2a7).

[Canonical link](https://medium.com/@aaron.recompile/a-guide-to-creating-taproot-scripts-with-python-bitcoinutils-e088633bc2a7)

Exported from [Medium](https://medium.com) on July 3, 2026.
