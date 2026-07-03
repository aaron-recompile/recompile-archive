---
title: "The Anatomy of Bitcoin Scripts: From P2PKH to Taproot"
subtitle: "Understanding these primitives is the foundation for everything that follows — Lightning, covenant proposals, and beyond."
tags: [bitcoin, taproot, blockchain, cryptography]
canonical_url: "https://medium.com/@aaron.recompile/the-anatomy-of-bitcoin-scripts-from-p2pkh-to-taproot-4db16924232f"
published: false
---

Companion notes to my book *Mastering Taproot*.

- - -

```
HODLing is the beginning.
But Bitcoin was meant to be programmed.

"Not Just HODLing: Real Bitcoin Script Engineering" starts here.
```

- - -

## The Universal Truth

Every Bitcoin address — from the genesis block to the latest Taproot output — follows one fundamental pattern:

```
Lock:   Commit to a condition
Unlock: Reveal proof that you satisfy it
```

This isn't a feature of SegWit or Taproot. It's the DNA of Bitcoin itself.

- - -

## Evolution of Commit-Reveal

| Era     | Type   | Commit (Locking Script)          | Reveal (Unlock Data)        | Location    |
|---------|--------|----------------------------------|-----------------------------|-------------|
| 2009    | P2PK   | `<pubkey> OP_CHECKSIG`           | `<sig>`                     | scriptPubKey|
| 2010    | P2PKH  | `OP_DUP OP_HASH160 <h> ...`      | `<sig> <pubkey>`            | scriptPubKey|
| 2012    | P2SH   | `OP_HASH160 <scripthash> OP_EQUAL`| `<...> <redeemScript>`     | scriptSig   |
| 2017    | P2WPKH | `0 <pubkey_hash>`                | `<sig> <pubkey>`            | witness     |
| 2021    | P2TR   | `1 <taproot_output_key>`         | `<sig>` or `<...> <cb>`     | witness     |

- - -

## Stack Execution Visualized

### Example 1: P2PKH

**Locking Script:** `OP_DUP OP_HASH160 <pubkey_hash> OP_EQUALVERIFY OP_CHECKSIG`

**Unlock Data:** `<signature> <pubkey>`

```
Initial Stack     OP_DUP           OP_HASH160       PUSH hash
+----------+      +----------+     +----------+     +----------+
| pubkey   |      | pubkey   |     | pk_hash  |     | pk_hash  | <- expected
+----------+      +----------+     +----------+     +----------+
| sig      |      | pubkey   |     | pubkey   |     | pk_hash  | <- computed
+----------+      +----------+     +----------+     +----------+
                  | sig      |     | sig      |     | pubkey   |
                  +----------+     +----------+     +----------+
                                                    | sig      |
                                                    +----------+
```

`OP_EQUALVERIFY` pops the two hashes and aborts unless they match; `OP_CHECKSIG`
then verifies `<sig>` against `<pubkey>`. Both conditions must hold for the
output to be spent.

- - -

*This post is part of the "Not Just HODLing" series. Full source and live
testnet transactions accompany each chapter.*
