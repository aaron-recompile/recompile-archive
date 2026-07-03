---
title: "OP_CHECKSIGFROMSTACK on Signet — Sign Anything, Verify on Stack"
subtitle: "Satoshi disabled OP_CAT in 2010. OP_CSFS was never even enabled. We ran it on-chain in 2026."
tags: [bitcoin]
canonical_url: "https://medium.com/@aaron.recompile/op-checksigfromstack-on-signet-sign-anything-verify-on-stack-9cf70ab07583"
published: false
---

Satoshi disabled OP_CAT in 2010. OP_CSFS was never even enabled. We ran it on-chain in 2026.

---

![](https://cdn-images-1.medium.com/max/800/1*Ddg0hA7OdBj-DQHLntCjRg.png)

---

```
Bitcoin is not designed top-down.  
It is discovered through execution.

"Run the Future" — starts here.
```

---

## Decoupling the Signature from the Transaction

Every Bitcoin signature you have ever seen signs the same thing: a hash of the current transaction. OP_CHECKSIG, OP_CHECKMULTISIG, Schnorr — they all implicitly bind the signature to the spending transaction. The message is not a parameter; it is fixed by consensus.

**OP_CHECKSIGFROMSTACK** (BIP348) breaks that assumption. It takes three explicit stack items — a signature, a message, and a public key — and verifies the signature over that arbitrary message. The message can be anything: a SHA256 digest of a string, a serialized output template, a price oracle feed, a cross-input commitment. The transaction is irrelevant.

This changes what Bitcoin Script can express. OP_CHECKSIG can only attest that the signer authorized *this* spend. OP_CSFS can attest that the signer authorized *any statement*, and that statement can be checked against other stack values produced by introspection. Combined with OP_CAT (previous post), it becomes possible to serialize transaction fields, hash them, sign them in advance, and enforce the result as a covenant.

**BIP348** assigns opcode `0xcc` to OP_CHECKSIGFROMSTACK. **Bitcoin Inquisition 29.2** activates it on Signet alongside BIP347 (OP_CAT) and BIP119 (OP_CTV), making all three available for combined experimentation.

This post runs a minimal CSFS experiment on Signet: sign the digest of `"hello world"` offline, embed the pubkey in the tapscript, and let the script verify the signature at spend time. The message has nothing to do with the transaction.

One thing to note upfront: OP_CSFS reveal transactions are non-standard under legacy mempool policy. They will not appear in standard Signet mempools before confirmation. After Inquisition mines the block, the transaction becomes visible on public explorers. “Not in the mempool” is a policy observation, not a consensus rejection.

---

## The CSFS Contract

OP_CHECKSIGFROMSTACK in its simplest form is a single opcode. The script is:

```
OP_CHECKSIGFROMSTACK   (0xcc)
```

That is the entire locking script. The spending witness must supply, in order:

```
[sig]      <- Schnorr signature over the committed message
[message]  <- the 32-byte message that was signed
[pubkey]   <- x-only public key of the signer
```

The script pops all three and verifies. If the signature is valid over the message under the pubkey, the result is 1 (TRUE).

Compare this to OP_CHECKSIG:

```
OP_CHECKSIG behavior:
  message  = implicit (current tx sighash)
  pubkey   = from script
  sig      = from witness
  -> verifies sig(tx_hash, pubkey)

OP_CHECKSIGFROMSTACK behavior:
  message  = explicit (from witness stack)
  pubkey   = explicit (from witness stack)
  sig      = explicit (from witness stack)
  -> verifies sig(message, pubkey)
```

The transaction is not in scope. This is the core design shift.

## The Contract Design

```
Signer offline:
  message = SHA256("hello world")
           = b94d27b9...efcde9
  sig     = Schnorr.sign(secret_key, message)
           = ab69f346...76912

At spend time, witness provides:
  Witness[0] = sig       (64 bytes)
  Witness[1] = message   (32 bytes)
  Witness[2] = pubkey    (32 bytes)
Script (one byte):
  0xcc = OP_CHECKSIGFROMSTACK
       -> pops pubkey, message, sig
       -> verifies sig over message under pubkey
       -> pushes TRUE
```

The tapscript bytecode is exactly:

```
cc   <- OP_CHECKSIGFROMSTACK
```

One byte. No hash commitment in the script itself — the pubkey alone identifies the authorized signer.

---

## Commit Phase: Building the Taproot Address with btcaaron

`btcaaron` ships `inq_csfs_script()` which returns the single-byte `0xcc` tapscript. The commit phase is identical in structure to the CAT experiment: build a single-leaf TapTree, derive the address, fund it.

```
MESSAGE = hashlib.sha256(b"hello world").digest()

leaf_script = inq_csfs_script()
key = Key.from_wif(DEMO_KEY_WIF)
tap_tree = (
    TapTree(internal_key=key, network="signet")
    .custom(script=leaf_script, label="csfs")
).build()
addr = tap_tree.address
```

## btcaaron API Highlights

`**inq_csfs_script()**` returns a `RawScript` containing the single byte `0xcc`. This is Inquisition's opcode assignment for OP_CHECKSIGFROMSTACK under BIP348. On a standard node the same byte is an OP_SUCCESS opcode — more on this below.

`**TapTree(...).custom(script, label).build()**` derives the P2TR address via the same TapLeaf -> Merkle root -> TapTweak -> output key chain described in the previous post. The script being one byte makes no difference to the derivation logic.

## Funding the Address

```
txid = rpc_wallet("sendtoaddress", tap_tree.address, FUND_SATS / 1e8)
```

---

## Reveal Phase: Spending with an Offline Signature

The reveal transaction constructs the witness by signing the message offline with the `secp256k1` library, then submitting all three items — sig, message, pubkey — to the script.

```
def _make_witness():
    secret = wif_secret_bytes(DEMO_KEY_WIF)
    pk = PrivateKey(secret, raw=True)
    sig = pk.schnorr_sign(MESSAGE, "", raw=True)
    pub_x = pk.pubkey.serialize()[1:33]
    return [sig.hex(), MESSAGE.hex(), pub_x.hex()]

tx = (
    program.spend("csfs")
    .from_utxo(txid, vout, sats=sats)
    .to(change_addr, sats - fee_sats)
    .unlock_with(_make_witness())
    .build()
)

reveal_txid = broadcast_or_raise(tx.hex)
```

## btcaaron Spend API

`**_make_witness()**` produces three items in the order CSFS expects: signature first (deepest on stack), then message, then pubkey (topmost). The Taproot interpreter will load these as the initial execution stack before running the tapscript.

`**pk.schnorr_sign(MESSAGE, "", raw=True)**` signs the 32-byte message digest directly using BIP340 Schnorr. The second argument (`""`) is the auxiliary randomness string; passing empty uses a deterministic nonce.

`**.unlock_with([...])**` injects all three items before the script and control block, exactly as in the CAT experiment. The final witness layout is:

```
Witness[0] = ab69f346...76912      <- Schnorr sig (64 bytes)
Witness[1] = b94d27b9...efcde9     <- message = SHA256("hello world") (32 bytes)
Witness[2] = ff1f9fa3...9986b8     <- x-only pubkey (32 bytes)
Witness[3] = cc                    <- tapscript (OP_CHECKSIGFROMSTACK, 1 byte)
Witness[4] = c0ff1f9f...9986b8     <- control block (33 bytes)
```

---

## Transactions, OP_RETURN_204, and Stack Trace

## Commit: what lands on-chain

**TxID**: `[2d68a0e6...133803fe](https://mempool.space/signet/tx/2d68a0e621533c2f7391159f4c2e252f409c1cec0ec681ff9c6b11cb133803fe?showDetails=true)`

```
INPUT
  tb1p...                          0.00050000 sBTC  (funding source)

OUTPUTS
  tb1p822a0z...fqp6x5up            0.00050000 sBTC  <- CSFS lock UTXO
  (change)
```

The output `tb1p822a0z...fqp6x5up` is a standard P2TR address. No observer can tell that the script path is a single-byte OP_CSFS.

## Reveal: what mempool.space shows

**TxID**: `[cc1b6d35...85195f97](https://mempool.space/signet/tx/cc1b6d352f75348b6a52c7f5c68fc5caea2512423e08011e8f69a9bb85195f97?showDetails=true)`

```
INPUT
  tb1p822a0z...fqp6x5up            0.00050000 sBTC

OUTPUT
  tb1pghctez...es5gqyqw            0.00049500 sBTC  (V1_P2TR)
```

The witness data as shown by mempool.space:

```
Witness[0]  ab69f3465e011994ae9d33650a75fa8b0d5f333d...76912
            <- Schnorr sig (64 bytes)

Witness[1]  b94d27b9934d3e08a52e52d7da7dabfac484efe3...efcde9
            <- SHA256("hello world") (32 bytes)
Witness[2]  ff1f9fa326a9438227e6aa25030ccf89bcb8ce53...9986b8
            <- x-only pubkey (32 bytes)
Witness[3]  cc
            <- tapscript
Witness[4]  c0 ff1f9fa3...9986b8
            <- control block (leaf version 0xc0 + internal pubkey)
```

## The OP_RETURN_204 label — and what it actually means

mempool.space decodes the tapscript `cc` and displays it as:

```
P2TR tapscript   OP_RETURN_204
```

This label requires explanation. `0xcc` = 204 decimal. On nodes that have *not* activated BIP348, opcode 204 falls in the OP_SUCCESS range defined by BIP342 (opcodes 187–254 are OP_SUCCESS in Tapscript). An OP_SUCCESS opcode causes the tapscript to pass immediately — no further evaluation. So a non-upgraded node reads `cc`, recognizes it as OP_SUCCESS, and marks the script valid without checking the signature at all.

On Bitcoin Inquisition 29.2, which has BIP348 activated, the same byte `cc` is interpreted as OP_CHECKSIGFROMSTACK. The node actually pops pubkey, message, and sig off the stack and performs the Schnorr verification.

This is the standard soft fork upgrade mechanism. The new rule turns an “always pass” opcode into a real constraint. Miners running Inquisition enforce the new semantics; legacy nodes see OP_SUCCESS and accept the block because they have no rule to reject it. mempool.space, running standard software, therefore labels it `OP_RETURN_204` — their display name for "opcode 204, meaning unknown." The word "RETURN" here is not OP_RETURN the opcode; it is a mempool.space naming convention for unrecognized opcodes.

## Stack execution

**Executing**: `OP_CHECKSIGFROMSTACK` (single opcode, `0xcc`)

The Taproot interpreter strips Witness[3] (script) and Witness[4] (control block), leaving Witness[0..2] as the execution stack:

---

### Initial State: three witness items loaded

```
+--------------------------------------------+
| ff1f9fa3...9986b8                          |  <- pubkey    (Witness[2], top)
| b94d27b9...efcde9                          |  <- message   (Witness[1])
| ab69f346...76912                           |  <- sig       (Witness[0], bottom)
+--------------------------------------------+
```

Three explicit inputs. The transaction itself is not on the stack and plays no role in what follows.

---

### Step 1 — OP_CHECKSIGFROMSTACK: pop pubkey, message, sig — verify — push result

```
+--------------------------------------------+
| 01                                         |  <- TRUE
+--------------------------------------------+
```

OP_CSFS pops all three items (top-first: pubkey, then message, then sig) and runs BIP340 Schnorr verification:

```
verify: Schnorr(sig=ab69f346...76912,
                msg=b94d27b9...efcde9,
                pub=ff1f9fa3...9986b8)

result: VALID -> push 01
```

Script terminates with a single truthy value. The spend is valid.

---

### Why does the sig not cover the transaction?

With OP_CHECKSIG, the signer must know the transaction being spent — the signature is computed over the sighash, which commits to inputs, outputs, and amounts. If the outputs change, the signature breaks.

With OP_CSFS, the signer committed to `SHA256("hello world")` — a message that has nothing to do with the transaction. The signature was computed before the transaction existed. This is the delegation primitive: a key holder can pre-authorize an action by signing a statement, and anyone who obtains that signature can construct a transaction that passes the CSFS check, regardless of what the outputs look like. Combined with OP_CTV (next post), you can constrain both the authorization (CSFS) and the outputs (CTV) simultaneously.

---

## Address Reconstruction with RootScope

The tapscript is a single byte: `0xcc`. That makes the derivation maximally transparent.

## The Derivation Chain

```
TapLeaf hash = tagged_hash("TapLeaf",  0xc0 || 0x01 || 0xcc)
               (leaf version 0xc0, script length 1, script byte 0xcc)
Merkle root  = TapLeaf hash
tweak t      = tagged_hash("TapTweak",  internal_pubkey || merkle_root)
output key Q = internal_pubkey + t*G
P2TR address = Bech32m("tb", Q.x_only)
```

## Verification Code

```
script_bytes = bytes([0xcc])   # OP_CHECKSIGFROMSTACK, 1 byte

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
# Expected: tb1p822a0z...fqp6x5up  [OK]
```

Notice: the internal pubkey in the control block (`ff1f9fa3...9986b8`) is the **same** key provided in the witness as the CSFS pubkey. This is intentional for the demo — the same key controls both the Taproot key path and the CSFS verification. In production designs these would typically be different keys.

## RootScope Visual Output

```
Internal Key
  ff1f9fa3...9986b8
        |
    TapLeaf (0xc0)
    script: cc  (1 byte)
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
    tb1p822a0z...fqp6x5up   [OK]
```

The one-byte script produces the same derivation depth as any other single-leaf tree. The address gives no indication of the script’s size or content.

---

## Where CSFS Sits in the CAT / CSFS / CTV Series

This is the second post in a three-part series. Each opcode in the series constrains a different layer of a transaction:

Opcode BIP What it constrains Mechanism Post OP_CAT 347 Stack composition Concatenate two elements; enables serialization [1] OP_CSFS 348 Signature scope Verify a signature over any message, not just tx [2] OP_CTV 119 Output template Commit the spend tx to a pre-defined hash [3]

OP_CAT operates purely on the stack and knows nothing about transactions. OP_CSFS understands signatures and keys, but deliberately decouples the message from the transaction. OP_CTV goes furthest — it commits the entire spending transaction to a hash baked into the locking script, requiring exact output reproduction.

The three together form a covenant toolkit. A realistic pattern: use CAT to serialize transaction output data onto the stack, use CSFS to verify that an authorized party signed that output template, and use CTV to enforce the template is reproduced exactly. Each opcode handles one layer; none of them alone is sufficient.

Next post: OP_CHECKTEMPLATEVERIFY on Signet — committing to outputs at UTXO creation time, and why CPFP is the practical fee-bumping strategy when the output template is fixed.

---

## What We Built

We designed the simplest possible CSFS contract: a one-byte tapscript (`0xcc`) that verifies a Schnorr signature over an arbitrary 32-byte message. The message — `SHA256("hello world")` — was signed offline before the transaction existed. At spend time, the witness supplies the sig, message, and pubkey explicitly; OP_CSFS verifies without consulting the transaction sighash at all.

We used `btcaaron`'s `inq_csfs_script()` to get the tapscript byte, built a single-leaf TapTree with `TapTree(...).custom(...).build()`, and constructed the witness with `_make_witness()` + `.unlock_with()`. RootScope verified the address reconstruction: internal key + one-byte script -> TapLeaf hash -> TapTweak -> output key -> `tb1p822a0z...fqp6x5up`.

The key thing mempool.space reveals: the decoded tapscript reads `OP_RETURN_204`, not `OP_CHECKSIGFROMSTACK`. That is not a bug in the explorer. It is the soft fork mechanism in action — non-upgraded nodes see OP_SUCCESS and pass the script unconditionally; Inquisition nodes see the actual CSFS semantics and enforce the signature check. The same upgrade pattern governs Taproot, SegWit, and every future Bitcoin soft fork.

Both transactions are permanently confirmed on Signet.

---

## Resources

- Bitcoin Inquisition: [github.com/bitcoin-inquisition](https://github.com/bitcoin-inquisition/)

- btcaaron toolkit: [github.com/aaron-recompile/btcaaron](https://github.com/aaron-recompile/btcaaron)

- RootScope visualizer: [github.com/aaron-recompile/rootscope](https://github.com/aaron-recompile/rootscope)

---

*Signet | Bitcoin Inquisition 29.2 | Commit *`[*2d68a0e6...133803fe*](https://mempool.space/signet/tx/2d68a0e621533c2f7391159f4c2e252f409c1cec0ec681ff9c6b11cb133803fe?showDetails=true)`* | Reveal *`[*cc1b6d35...85195f97*](https://mempool.space/signet/tx/cc1b6d352f75348b6a52c7f5c68fc5caea2512423e08011e8f69a9bb85195f97?showDetails=true)`

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [March 17, 2026](https://medium.com/p/9cf70ab07583).

[Canonical link](https://medium.com/@aaron.recompile/op-checksigfromstack-on-signet-sign-anything-verify-on-stack-9cf70ab07583)

Exported from [Medium](https://medium.com) on July 3, 2026.
