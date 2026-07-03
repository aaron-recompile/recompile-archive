---
title: "Building a 4-Leaf Taproot Tree in Python: The First Complete Implementation on Bitcoin Testnet"
subtitle: "Not Just HODLing: Real Bitcoin Script Engineering series # 3 — a complete Taproot tree with five spending paths in Python and live-tested"
tags: [bitcoin, taproot]
canonical_url: "https://medium.com/@aaron.recompile/building-a-4-leaf-taproot-tree-in-python-the-first-complete-implementation-on-bitcoin-testnet-c8b66c331f29"
cover_image: "https://cdn-images-1.medium.com/max/800/1*UzY69fh5lEhLdWI1-HDKDQ.png"
published: false
---

```
HODLing is the beginning.
But Bitcoin was meant to be programmed.

“Not Just HODLing: Real Bitcoin Script Engineering” starts here.
```

---

Most Bitcoin Taproot tutorials stop at 1–2 leaves. This is different.

What you’re about to see is the first publicly available demonstration of a complete 4-leaf Taproot implementation with every spending path validated on Bitcoin testnet. While most examples show simple key-path-only usage or basic 2-script trees, this implementation demonstrates Taproot’s true potential: a single address hiding five different ways to spend funds.

**Live Testnet Proof:**

- Commit Address: `tb1pjfdm902y2adr08qnn4tahxjvp6x5selgmvzx63yfqk2hdey02yvqjcr29q`

- 5 Confirmed Spending Transactions (we’ll show you the TXIDs)

- Every script path works flawlessly

**What makes this significant:**

- **Complete validation**: Not just theory — every spending path confirmed on testnet

- **Production-ready code**: Real Python implementation using bitcoinutils

- **Complex conditional logic**: Hash locks, multisig, timelocks, and fallbacks in one tree

- **Maximum privacy**: Key path spends look identical to regular transactions

This implementation proves that sophisticated Bitcoin smart contracts can operate with the same privacy and efficiency as simple payments.

## Why 4-Leaf Trees Matter

Most production Taproot usage follows the path of least resistance: key-path-only transactions that look like regular single-signature spends. While this maximizes privacy, it leaves Taproot’s smart contract potential largely untapped.

A 4-leaf tree demonstrates several capabilities that simple implementations miss:

**Real-World Applications:**

- **Wallet Recovery**: Progressive access control with timelock + multisig + emergency paths

- **Lightning Channels**: Multiple cooperative close scenarios with different participant sets

- **Atomic Swaps**: Hash time locked contracts with various fallback conditions

- **Inheritance Planning**: Time-based access with multiple beneficiary options

**Technical Advantages:**

- **Selective revelation**: Only the executed script is exposed, others remain hidden

- **Fee efficiency**: Smaller than equivalent traditional multi-condition scripts

- **Flexible logic**: Multiple execution paths in a single commitment

The beauty is that from the outside, our complex 4-leaf tree looks identical to any other Taproot address — until you need to use one of the hidden spending conditions.

---

## Our Script Tree Design

We’ll build this balanced Merkle tree structure:

```
               Merkle Root
               /        \
          Branch0      Branch1  
         /      \      /      \
    Script0  Script1 Script2 Script3
    Hashlock   Multi    CSV     Sig
```

Each script serves a different purpose in a realistic multi-party protocol:

- **Script 0 (SHA256 Hashlock)**: Anyone with the preimage “helloworld” can spend

- **Script 1 (2-of-2 Multisig)**: Requires cooperation between Alice and Bob

- **Script 2 (CSV Timelock)**: Bob can spend after waiting 2 blocks

- **Script 3 (Simple Signature)**: Bob can spend immediately with his signature

- Plus the **Key Path**: Alice can spend with maximum privacy using her tweaked private key.

## Implementation Setup

```
from bitcoinutils.setup import setup
from bitcoinutils.keys import PrivateKey
from bitcoinutils.script import Script
from bitcoinutils.transactions import Transaction, TxInput, TxOutput, TxWitnessInput
from bitcoinutils.utils import ControlBlock
import hashlib

# Use testnet for safe experimentation
setup('testnet')
# Generate keys for our participants
alice_priv = PrivateKey.from_wif("")
bob_priv = PrivateKey.from_wif("")
alice_pub = alice_priv.get_public_key()
bob_pub = bob_priv.get_public_key()
```

---

## Building the Four Scripts

## Script 0: SHA256 Hashlock

This script implements a simple hash-time-lock pattern common in atomic swaps:

```
# Anyone who knows the preimage can spend
preimage = "helloworld"
hash1 = hashlib.sha256(preimage.encode('utf-8')).hexdigest()
script1 = Script([
    'OP_SHA256', 
    hash1, 
    'OP_EQUALVERIFY', 
    'OP_TRUE'
])
print(f"Script 0 (Hashlock): {script1.to_hex()}")
```

**How it works**: The spender provides the preimage in the witness. The script hashes it with SHA256, compares against the committed hash, and succeeds if they match.

## Script 1: 2-of-2 Multisig (Tapscript)

This uses Tapscript’s efficient `OP_CHECKSIGADD` instead of legacy `OP_CHECKMULTISIG`:

```
# Requires both Alice and Bob's signatures
script2 = Script([
    "OP_0",                           # Initialize counter
    alice_pub.to_x_only_hex(),        # Alice's x-only pubkey
    "OP_CHECKSIGADD",                 # Verify Alice sig, increment counter
    bob_pub.to_x_only_hex(),          # Bob's x-only pubkey  
    "OP_CHECKSIGADD",                 # Verify Bob sig, increment counter
    "OP_2",                           # Required signature count
    "OP_EQUAL"                        # Check counter == required count
])
```

**Key innovation**: `OP_CHECKSIGADD` is more efficient than `OP_CHECKMULTISIG` and handles x-only public keys natively.

## Script 2: CSV Timelock

This implements a relative timelock — Bob can spend after a certain number of blocks:

```
from bitcoinutils.utils import Sequence, TYPE_RELATIVE_TIMELOCK

# Bob can spend after waiting 2 blocks
relative_blocks = 2
seq = Sequence(TYPE_RELATIVE_TIMELOCK, relative_blocks)
script3 = Script([
    seq.for_script(),                 # Push sequence value
    "OP_CHECKSEQUENCEVERIFY",         # Verify relative timelock
    "OP_DROP",                        # Clean up stack
    bob_pub.to_x_only_hex(),          # Bob's pubkey
    "OP_CHECKSIG"                     # Verify Bob's signature
])
```

**Important**: The transaction input must set the sequence number to enable the timelock.

## Script 3: Simple Signature

The simplest script — just Bob’s signature:

```
# Bob can spend immediately
script4 = Script([
    bob_pub.to_x_only_hex(),
    "OP_CHECKSIG"
])
```

## Creating the Taproot Address

Now we combine all scripts into a Merkle tree and generate the address:

```
# Build the script tree: [[left_branch], [right_branch]]
tree = [[script1, script2], [script3, script4]]
# Generate Taproot address using Alice's internal key
taproot_address = alice_pub.get_taproot_address(tree)
print(f"Taproot Address: {taproot_address.to_string()}")

# This is where we'll send our test funds
commit_address = "tb1pjfdm902y2adr08qnn4tahxjvp6x5selgmvzx63yfqk2hdey02yvqjcr29q"
```

This address is a **cryptographic commitment** to all four scripts plus Alice’s key path. From the outside, it’s indistinguishable from any other Taproot address.

## Spending Path 1: SHA256 Hashlock

First, let’s spend using the hashlock by revealing the preimage:

```
# Build the spending transaction
commit_txid = "245563c5aa4c6d32fc34eed2f182b5ed76892d13370f067dc56f34616b66c468"  # From your funding transaction
input_amount = 1200  # satoshis
output_amount = 666 

txin = TxInput(commit_txid, 0)  # spending output 0
txout = TxOutput(output_amount, alice_pub.get_taproot_address().to_script_pub_key())
tx = Transaction([txin], [txout], has_segwit=True)
# Create control block for script1 (index 0 in our tree)
cb = ControlBlock(alice_pub, tree, 0, is_odd=taproot_address.is_odd())
# Build witness: [preimage, script, control_block]
preimage_hex = preimage.encode('utf-8').hex()
witness = TxWitnessInput([
    preimage_hex,      # The secret that unlocks the hashlock
    script1.to_hex(),  # The script being executed
    cb.to_hex()        # Proof that this script was committed
])
tx.witnesses.append(witness)
print(f"Hashlock Transaction: {tx.serialize()}")
```

**Testnet Result**: txid:`1ba4835fca1c94e7eb0016ce37c6de2545d07d84a97436f8db999f33a6fd6845`

## Spending Path 2: 2-of-2 Multisig

For the multisig spend, we need signatures from both Alice and Bob:

```
# Create control block for script2 (index 1 in our tree)  
cb = ControlBlock(alice_pub, tree, 1, is_odd=taproot_address.is_odd())

# Sign the transaction with both keys (script path signing)
sig_alice = alice_priv.sign_taproot_input(
    tx, 0, [taproot_address.to_script_pub_key()], [input_amount],
    script_path=True, tapleaf_script=script2, tweak=False
)

sig_bob = bob_priv.sign_taproot_input(
    tx, 0, [taproot_address.to_script_pub_key()], [input_amount], 
    script_path=True, tapleaf_script=script2, tweak=False
)

# Build witness: [bob_sig, alice_sig, script, control_block]
# Note: Bob's signature goes first due to stack consumption order
witness = TxWitnessInput([
    sig_bob,           # Consumed second by the script
    sig_alice,         # Consumed first by the script  
    script2.to_hex(),
    cb.to_hex()
])
tx.witnesses.append(witness)
```

**Testnet Result**: `1951a3be0f05df377b1789223f6da66ed39c781aaf39ace0bf98c3beb7e604a1`

## Spending Path 3: CSV Timelock

The timelock spend requires setting a custom sequence number:

```
# Create transaction with custom sequence for timelock
seq_for_input = seq.for_input_sequence()
txin = TxInput(commit_txid, 0, sequence=seq_for_input)  # Key difference!

# Rest is similar to other script path spends
cb = ControlBlock(alice_pub, tree, 2, is_odd=taproot_address.is_odd())
sig_bob = bob_priv.sign_taproot_input(
    tx, 0, [taproot_address.to_script_pub_key()], [input_amount],
    script_path=True, tapleaf_script=script3, tweak=False
)
witness = TxWitnessInput([
    sig_bob,
    script3.to_hex(), 
    cb.to_hex()
])
```

**Testnet Result**: txid:`98361ab2c19aa0063f7572cfd0f66cb890b403d2dd12029426613b40d17f41ee`

## Spending Path 4: Simple Signature

The simplest script path spend:

```
cb = ControlBlock(alice_pub, tree, 3, is_odd=taproot_address.is_odd())

sig_bob = bob_priv.sign_taproot_input(
    tx, 0, [taproot_address.to_script_pub_key()], [input_amount],
    script_path=True, tapleaf_script=script4, tweak=False  
)
witness = TxWitnessInput([
    sig_bob,
    script4.to_hex(),
    cb.to_hex()
])
```

**Testnet Result**: txid:`1af46d4c71e121783c3c7195f4b45025a1f38b73fc8898d2546fc33b4c6c71b9`

## Spending Path 5: Key Path (Maximum Privacy)

The most efficient and private option — looks like a regular single-sig transaction:

```
# No control block needed for key path!
# Alice signs with her tweaked private key

sig_alice = alice_priv.sign_taproot_input(
    tx, 0, [taproot_address.to_script_pub_key()], [input_amount],
    script_path=False,        # This is key path, not script path
    tapleaf_scripts=tree     # Needed for tweak calculation
)
# Witness contains only the signature-maximum efficiency!
witness = TxWitnessInput([sig_alice])
tx.witnesses.append(witness)
```

**Testnet Result**: txid:`1e518aa540bc770df549ec9836d89783ca19fc79b84e7407a882cbe9e95600da`

---

## Common Pitfalls and Solutions

## Witness Stack Ordering

The multisig witness order is critical:

```
# ❌ Wrong: Alice sig first
witness = [sig_alice, sig_bob, script, control_block]
```

```
# ✅ Correct: Bob sig first (consumed second)
witness = [sig_bob, sig_alice, script, control_block]
```

## Sequence Numbers for CSV

CSV scripts require specific transaction sequence values:

```
# ❌ Wrong: Default sequence
txin = TxInput(txid, vout)
```

```
# ✅ Correct: CSV-compatible sequence  
txin = TxInput(txid, vout, sequence=seq.for_input_sequence())
```

## Script Path vs Key Path Signing

The signing process is different for each path:

```
# Key path: script_path=False, provide tree for tweak
sig = priv.sign_taproot_input(..., script_path=False, tapleaf_scripts=tree)
```

```
# Script path: script_path=True, provide specific script
sig = priv.sign_taproot_input(..., script_path=True, tapleaf_script=script)
```

---

## What This Proves

This implementation demonstrates several critical points about Taproot’s real-world capabilities:

**Protocol Maturity**: Complex script trees work flawlessly on Bitcoin’s network, proving the BIP 341 implementation is production-ready.

**Privacy Preservation**: Each execution path reveals only the necessary conditions while keeping alternatives completely hidden.

**Efficiency**: Even sophisticated 4-leaf trees maintain reasonable transaction sizes and fees.

**Flexibility**: The same UTXO can accommodate radically different spending conditions — cooperation, disputes, timeouts, or emergencies.

**Developer Readiness**: The tooling ecosystem successfully supports advanced Taproot patterns, not just simple key-path-only usage.

## Next Steps and Resources

**Part 2 Preview**: In the next article, we’ll dive deep into the cryptographic mechanics that make this work. You’ll learn:

- **How Control Blocks prove script inclusion** through Merkle proofs

- **Why witness stack ordering matters** for script execution

- **The mathematical guarantees** behind Taproot’s privacy properties

- **Security considerations** for production deployments

- **Optimization strategies** for even larger script trees

We’ll dissect the actual control blocks from our testnet transactions, analyze the TaggedHash construction step-by-step, and explore the trade-offs between tree depth, privacy, and efficiency.

**Part 3 Vision**: An interactive visual simulator where you can experiment with different tree structures, generate control blocks, and see exactly how script path proofs work — all in your browser.

The future of Bitcoin smart contracts isn’t just about what’s theoretically possible — it’s about what works reliably in practice. This implementation moves us one step closer to that future.

## Source Code

All code and on-chain data analysis are available at my [github](https://github.com/btcstudy/btcstudy.github.io/tree/main) repo

Feel free to Star and Fork!

---

*This article is part of the “Not Just HODLing: Real Bitcoin Script Engineering” series. Previous articles covered *[*CSV timelocks with P2SH*](https://medium.com/@aaron.recompile/how-i-built-a-time-locked-bitcoin-script-with-csv-and-p2sh-c48c0389709d)* and *[*basic Taproot implementation*](https://medium.com/@aaron.recompile/a-guide-to-creating-taproot-scripts-with-python-bitcoinutils-e088633bc2a7)*.*

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [July 2, 2025](https://medium.com/p/c8b66c331f29).

[Canonical link](https://medium.com/@aaron.recompile/building-a-4-leaf-taproot-tree-in-python-the-first-complete-implementation-on-bitcoin-testnet-c8b66c331f29)

Exported from [Medium](https://medium.com) on July 3, 2026.
