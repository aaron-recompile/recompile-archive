---
title: "OP_INTERNALKEY + OP_CHECKSIGFROMSTACK on Signet — Identity-Bound Authorization"
subtitle: "Pure CSFS asks: did someone sign this? IK + CSFS asks: did the owner sign this?"
tags: [bitcoin]
canonical_url: "https://medium.com/@aaron.recompile/op-internalkey-op-checksigfromstack-on-signet-identity-bound-authorization-04f0440557bc"
cover_image: "https://cdn-images-1.medium.com/max/800/1*z-tdFHN-skpNd_nfq6Y_mg.png"
published: false
---

```
Bitcoin is not designed top-down.  
It is discovered through execution.

"Run the Future" — starts here.
```

> *Pure CSFS asks: did someone sign this? IK + CSFS asks: did the *owner* sign this?*

> Bitcoin does not enforce identity declarations. It enforces authorization structures.

---

**TL;DR** — Two opcodes, two bytes (`cbcc`), zero pubkey in the witness. OP_INTERNALKEY pushes the UTXO's internal key from Taproot execution context; OP_CHECKSIGFROMSTACK verifies that the key holder signed the message. Authorization is bound to UTXO identity at creation time, not declared at spend time. One structural consequence: a fixed message is replayable across UTXOs with the same internal key — the next experiment (CAT+CSFS) closes that window.

The distinction matters more than it looks.

In the standalone CSFS experiment, the witness supplies three items: signature, message, and pubkey. Any pubkey can walk in. If you have a key that matches the sig-message pair, you pass. The script has no opinion about who that key belongs to.

OP_INTERNALKEY changes the question. It is a single opcode that pushes the x-only internal pubkey of the current Taproot context onto the stack. The script no longer accepts a key from the witness — it reads the key from the UTXO itself. The authorized signer is whoever created this specific UTXO, not whoever happens to have a matching key.

Combined as `OP_INTERNALKEY OP_CHECKSIGFROMSTACK`, two bytes, this produces an authorization primitive that is bound to a specific Taproot identity: the internal key holder must have signed the message. The witness shrinks from three items to two — signature and message only. The pubkey never appears in the witness. It arrives at runtime from the execution context.

This post runs the first combo experiment: `cbcc` on Signet, with a commit-reveal cycle through Bitcoin Inquisition 29.2. The witness is two items. The stack execution is three steps. Both transactions are confirmed.

![](https://cdn-images-1.medium.com/max/800/1*NSBxGHO3iz6DjLVqDWpzhA.png)

Same verification primitive. Different binding surface.

Bitcoin changes when the binding surface changes.

---

## The IK+CSFS Contract

Compare pure CSFS to the combo:

```
Pure CSFS (OP_CHECKSIGFROMSTACK):
  witness  = [sig, message, pubkey]
  script   = OP_CHECKSIGFROMSTACK
  pubkey source: witness (caller-supplied)


IK + CSFS (OP_INTERNALKEY OP_CHECKSIGFROMSTACK):
  witness  = [sig, message]
  script   = OP_INTERNALKEY OP_CHECKSIGFROMSTACK
  pubkey source: Taproot context (UTXO-bound)
```

In the IK+CSFS version, the pubkey is never in the witness. It is pushed by OP_INTERNALKEY from the validated Taproot execution context — the internal key used to construct the TapTree the spender is revealing.

This matters because of how the Taproot verifier works. When a script-path spend occurs, the control block in the witness carries the candidate internal key `P` and a Merkle path. The verifier reconstructs the output key `Q' = P + tweak·G` and checks `Q' == Q` against the UTXO. Only after this consistency check passes does OP_INTERNALKEY expose the validated `P` to the execution stack. There is no way to inject a different key through the witness.

The result: the signer identity is bound to this UTXO’s creation. The same two-byte script can be used in any TapTree — but each instance enforces a different authorized signer, because each instance has a different internal key.

## The Contract Design

```
Signer offline:
  message = SHA256("authorized:group_combo_ik_csfs:v1")
           = c4820b82...313ebc
  sig     = Schnorr.sign(secret_key, message)
           = 5a5a5107...a1fdd37

At spend time, witness provides:
  Witness[0] = sig       (64 bytes)
  Witness[1] = message   (32 bytes)
Script (two bytes):
  0xcb = OP_INTERNALKEY           <- push internal key from Taproot context
  0xcc = OP_CHECKSIGFROMSTACK     <- verify sig(message, internal_key)
```

The tapscript bytecode:

```
cb   <- OP_INTERNALKEY
cc   <- OP_CHECKSIGFROMSTACK
```

Two bytes. No key in the script, no key in the witness. The authorized identity is implicit in the UTXO’s Taproot construction.

---

## Commit Phase: Building the Taproot Address with btcaaron

```
MESSAGE = hashlib.sha256(b"authorized:group_combo_ik_csfs:v1").digest()

key = Key.from_wif(DEMO_KEY_WIF)
leaf_script = RawScript(build_script(OP_INTERNALKEY, OP_CHECKSIGFROMSTACK))
program = (
    TapTree(internal_key=key, network="signet")
    .custom(script=leaf_script, label="ik_csfs")
).build()
addr = program.address
```

## btcaaron API Highlights

`**build_script(OP_INTERNALKEY, OP_CHECKSIGFROMSTACK)**` assembles the two-byte tapscript `cbcc`. Both opcodes are imported from `experiments.opcodes` as raw bytes — they are proposed opcodes, not standard btcaaron primitives, so they live in the experiment layer rather than the library.

`**TapTree(...).custom(script, label).build()**` derives the P2TR address via the same TapLeaf → Merkle root → TapTweak → output key chain as all previous experiments. Two-byte script, same derivation depth as any other single-leaf tree.

## Funding the Address

```
txid = fund_address(addr, FUND_TXID_FILE, fund_sats=50_000)
```

---

## Reveal Phase: Spending with Sig and Message Only

The witness is two items. No pubkey.

```
def _make_witness():
    secret = wif_secret_bytes(DEMO_KEY_WIF)
    sk = PrivateKey(secret, raw=True)
    sig = sk.schnorr_sign(MESSAGE, "", raw=True)
    return [sig.hex(), MESSAGE.hex()]

tx = (
    program.spend("ik_csfs")
    .from_utxo(txid, vout, sats=sats)
    .to(change_addr, sats - fee_sats)
    .unlock_with(_make_witness())
    .build()
)
reveal_txid = broadcast_or_raise(tx.hex)
```

## btcaaron Spend API

`**_make_witness()**` returns `[sig, message]` in that order. `sig` is pushed first (lands at stack bottom), `message` is pushed second (lands at stack top). No pubkey item — OP_INTERNALKEY will supply it at runtime.

`**pk.schnorr_sign(MESSAGE, "", raw=True)**` signs the 32-byte digest using BIP340 Schnorr with a deterministic nonce.

The final witness layout:

```
Witness[0] = 5a5a5107...a1fdd37    <- Schnorr sig (64 bytes)
Witness[1] = c4820b82...313ebc     <- message = SHA256("authorized:...") (32 bytes)
Witness[2] = cbcc                  <- tapscript (OP_INTERNALKEY OP_CHECKSIGFROMSTACK, 2 bytes)
Witness[3] = c1ff1f9fa3...9986b8   <- control block (33 bytes)
```

---

## Transactions, OP_RETURN_203 + OP_RETURN_204, and Stack Trace

## Commit: what lands on-chain

**TxID**: `[9930e922...0ea8](https://mempool.space/signet/tx/9930e922036a80d04a96a4b08f15838bcb880ce2a4be91da0b24af1484e10ea8?showDetails=true)`

```
OUTPUTS (relevant)
  tb1p...    0.00050000 sBTC  <- IK+CSFS lock UTXO
```

Standard P2TR output. Nothing about the two-byte script is visible externally.

## Reveal: what lands on-chain

**TxID**: `[8d0b2156...dd8f](https://mempool.space/signet/tx/8d0b2156e9425afe64cabf3c906da255b6b86c51cb8968f828d5253fc261dd8f?showDetails=true)`

```
Fee        : 500 sats
Features   : SegWit | Taproot | RBF

INPUT
  (IK+CSFS lock UTXO)    0.00050000 sBTC
OUTPUT
  (change address)       0.00049500 sBTC  (V1_P2TR)
```

The witness as shown by mempool.space:

```
Witness[0]  5a5a5107...a1fdd37
            <- Schnorr sig (64 bytes)

Witness[1]  c4820b82...313ebc
            <- SHA256("authorized:group_combo_ik_csfs:v1") (32 bytes)
Witness[2]  cbcc
            <- tapscript
Witness[3]  c1 ff1f9fa3...9986b8
            <- control block (leaf version 0xc0 + parity 1 + internal pubkey)
```

P2TR tapscript decoded:

```
OP_RETURN_203
OP_RETURN_204
```

## The OP_RETURN_203 + OP_RETURN_204 labels — and what they actually mean

*(Readers familiar with the OP_SUCCESS soft fork upgrade pattern can skip this section.)*

`0xcb` = 203 decimal. `0xcc` = 204 decimal. Both fall in BIP342's OP_SUCCESS range (opcodes 187–254 are OP_SUCCESS in Tapscript). On standard nodes, any OP_SUCCESS opcode causes the tapscript to pass immediately without evaluating anything further. On Bitcoin Inquisition 29.2, `0xcb` executes as OP_INTERNALKEY and `0xcc` as OP_CHECKSIGFROMSTACK.

mempool.space, running standard software, labels both as `OP_RETURN_203` and `OP_RETURN_204` — its naming convention for unrecognized opcodes, not OP_RETURN the data-embedding opcode. When two OP_SUCCESS opcodes appear in the same script, a non-upgraded node passes on the first one without reaching the second. Inquisition nodes execute both sequentially in full.

This is the same soft fork upgrade mechanism as the standalone CSFS experiment. The new rules turn “always pass” opcodes into real constraints; old nodes see OP_SUCCESS and accept the block because they have no rule to reject it.

## Stack execution

**Executing**: `OP_INTERNALKEY OP_CHECKSIGFROMSTACK`

The Taproot interpreter strips Witness[2] (script) and Witness[3] (control block), loading Witness[0..1] as the initial execution stack.

---

### Initial State: two witness items loaded as execution stack

```
+--------------------------------------------+
| c4820b82...313ebc                          |  <- message  (Witness[1], top)
| 5a5a5107...a1fdd37                         |  <- sig      (Witness[0], bottom)
+--------------------------------------------+
```

Two items. No pubkey anywhere on the stack yet.

---

### Step 1 — OP_INTERNALKEY: push internal key from Taproot context

```
+--------------------------------------------+
| ff1f9fa3...9986b8                          |  <- internal key (32 bytes, from context)
| c4820b82...313ebc                          |  <- message
| 5a5a5107...a1fdd37                         |  <- sig
+--------------------------------------------+
```

OP_INTERNALKEY reads the validated internal key from the Taproot execution context — the `P` that was checked against the UTXO's output key `Q` when the control block was processed. This value was never in the witness. It comes from the UTXO's construction history.

---

### Step 2 — OP_CHECKSIGFROMSTACK: pop pubkey, message, sig — verify — push result

```
+--------------------------------------------+
| 01                                         |  <- TRUE
+--------------------------------------------+
```

OP_CSFS pops top-first: internal key, then message, then sig. Executes BIP340 Schnorr verification:

```
verify: Schnorr(sig=5a5a5107...a1fdd37,
                msg=c4820b82...313ebc,
                pub=ff1f9fa3...9986b8)
result: VALID -> push 01
```

Script terminates with a single truthy value. The spend is valid.

---

### Why the witness has two items instead of three

In the standalone CSFS experiment, the spender supplies `[sig, message, pubkey]` — three explicit items. The pubkey is caller-supplied: whoever constructs the reveal transaction chooses which key to present. This works fine for verifying against an external key like an oracle or a co-signer, but it means the script has no binding to the UTXO's specific identity.

IK+CSFS replaces that third item with the execution context. The spender cannot choose a different pubkey. They cannot substitute a key that matches their own private key unless their private key happens to be the TapTree’s internal key. The authorization is not externally presented — it is structurally enforced by the UTXO’s Taproot construction.

The practical pattern: a cold key holder pre-signs authorization tickets `(sig, message)` offline. A hot-side executor broadcasts those tickets without ever holding the cold private key. The script enforces that only the internal key holder's signatures are valid — and the internal key is locked into the UTXO at creation time, not declared at spend time.

---

## Address Reconstruction with RootScope

The tapscript is two bytes: `cb` (OP_INTERNALKEY) and `cc` (OP_CHECKSIGFROMSTACK). The derivation chain is identical to any other single-leaf TapTree.

## The Derivation Chain

```
TapLeaf hash = tagged_hash("TapLeaf",  0xc0 || 0x02 || 0xcb || 0xcc)
               (leaf version 0xc0, script length 2, script bytes)
Merkle root  = TapLeaf hash
tweak t      = tagged_hash("TapTweak",  internal_pubkey || merkle_root)
output key Q = internal_pubkey + t*G
P2TR address = Bech32m("tb", Q.x_only)
```

## Verification Code

```
internal_pubkey = bytes.fromhex(
    "ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db4f78dbce6146499d9986b8"
)
script_bytes = bytes([0xcb, 0xcc])

tapleaf_hash = tagged_hash(
    "TapLeaf",
    bytes([0xc0]) + bytes([len(script_bytes)]) + script_bytes,
)
merkle_root = tapleaf_hash
tweak = tagged_hash("TapTweak", internal_pubkey + merkle_root)
Q    = Key.from_x_only(internal_pubkey).tweak_add(tweak)
addr = Q.to_p2tr_address(network="signet")
# Expected: tb1p...  [OK]
```

The same `internal_pubkey` (`ff1f9fa3...9986b8`) from all four solo experiments. Same key, two-byte tapscript, different Merkle root, different TapTweak, different address.

## RootScope Visual Output

```
Internal Key
  ff1f9fa3...9986b8  <----- also the key OP_INTERNALKEY pushes at runtime
        |
    TapLeaf (0xc0)
    script: cb cc  (2 bytes)
               ^--- OP_INTERNALKEY pushes this key from context
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
    tb1p...  [OK]
```

The control block opens with `c1`, not `c0` as in the CAT, CSFS, and CTV experiments. The different parity reflects a different TapTweak value — this two-byte script produces a different Merkle root than any of the 34-byte or 1-byte scripts, and the tweak lands on an odd-parity point.

There is a deeper connection here worth making explicit. RootScope performs forward derivation: given `P` and the script, compute `Q`. The Taproot verifier during control block processing performs the same computation in reverse: given `Q` from the UTXO and candidate `P` from the control block, verify that `P → Q` holds under the same formula. The math is identical; only what is known and what is being verified differs.

This is why OP_INTERNALKEY can be trusted. It does not reach into the witness and grab a key — it surfaces a value that was already validated by the control block check before script execution began. RootScope’s derivation chain is not just an address verification tool; it is a visualization of the trust chain that makes OP_INTERNALKEY meaningful. The key it pushes onto the stack is the same key that satisfies `Q = P + t·G` for this specific UTXO. That relationship, computed forward by RootScope and verified backward by the node, is the foundation.

---

## Where IK+CSFS Sits in the Series

The four solo experiments each isolated one opcode. The combo experiments start combining them. This is the first.

![](https://cdn-images-1.medium.com/max/800/1*RLRN58bXPs68KJzH8J0QzA.png)

The progression from CSFS alone to IK+CSFS is the progression from “someone signed this” to “the owner signed this.” OP_INTERNALKEY does one thing: it replaces a witness-supplied public key with the UTXO-bound Taproot identity. That single substitution turns a generic signature check into an ownership-gated authorization.

Next combo: CAT + CSFS — building the signed message dynamically from stack components rather than pre-committing it at script creation time.

---

## A Boundary Condition: Signature Replay

This experiment uses a fixed message constant:

```
MESSAGE = hashlib.sha256(b"authorized:group_combo_ik_csfs:v1").digest()
```

Once a successful reveal transaction is on-chain, the `(sig, message)` pair is permanently visible. If a second UTXO existed with the same `cbcc` script and the same internal key, that pair could be replayed against it — no private key required. The control block would validate, OP_INTERNALKEY would push the same `P`, and OP_CSFS would verify the same signature against the same message. The spend would pass.

This is not a flaw in IK+CSFS as a primitive. It is a consequence of using a fixed message in a contract that does not bind the authorization to a specific UTXO. The fix is straightforward: include UTXO-specific data in the message — the txid, vout, amount, or destination — so each signature is only valid for one spend:

```
MESSAGE = SHA256(txid || vout || amount || destination_scriptpubkey)
```

This is precisely what the next experiment addresses. CAT + CSFS composes the message dynamically at execution time from stack components. Each signature becomes specific to the spend it authorizes. The replay window closes. IK+CSFS establishes *who* can authorize; CAT+CSFS establishes *what* is being authorized and binds the two together.

---

## What We Built

We ran the first combo experiment: a two-byte tapscript that pairs OP_INTERNALKEY with OP_CHECKSIGFROMSTACK. The design is minimal — OP_INTERNALKEY pushes the UTXO’s internal key, then OP_CSFS verifies that the message `SHA256("authorized:group_combo_ik_csfs:v1")` was signed by that key. The witness supplies only the signature and the message. The pubkey never appears in the witness; it arrives from the Taproot execution context.

We built the TapTree with `btcaaron`'s `build_script(OP_INTERNALKEY, OP_CHECKSIGFROMSTACK)`, assembled the two-byte leaf, and derived the Signet address. The witness was constructed with `_make_witness()`, which signs the message offline using the same key that controls the TapTree's internal key path. The spend used `.unlock_with([sig, message])` — two items, no pubkey.

Both transactions confirmed on Signet. The trace file records the exact witness bytes. The stack execution is three steps: load two witness items, push the internal key via OP_INTERNALKEY, verify and push TRUE via OP_CSFS.

RootScope confirmed the address derivation: same internal key as all prior experiments, two-byte tapscript, different Merkle root, different output key, different address. The control block opens with `c1` rather than `c0` — the odd-parity outcome of this specific tweak combination.

The real applications of this combination emerge in multi-leaf trees and vault constructions. A leaf that uses IK+CSFS alongside a CTV leaf can enforce both who authorized a spend and exactly where the funds go, with neither condition visible from the P2TR address alone.

Run the future. Execute first. Formalize later.

---

## Evidence Index

Everything needed to reproduce this experiment end-to-end:

```
Script hex        cbcc
                  (cb = OP_INTERNALKEY, cc = OP_CHECKSIGFROMSTACK)

Internal pubkey   ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db4f78dbce6146499d9986b8
Message           c4820b82d8856e9d8df36a9138d20149a9cd2f5b83d2e33d1b7e026abc313ebc
                  (SHA256("authorized:group_combo_ik_csfs:v1"))
Commit TxID       9930e922036a80d04a96a4b08f15838bcb880ce2a4be91da0b24af1484e10ea8
Reveal TxID       8d0b2156e9425afe64cabf3c906da255b6b86c51cb8968f828d5253fc261dd8f
Control block     c1ff1f9fa326a9438227e6aa25030ccf89bcb8ce53db4f78dbce6146499d9986b8
                  (c1 = leaf version 0xc0 + odd parity)
Experiment code   experiments/group_opcodes/code/combo_ik_csfs.py
Trace output      experiments/group_opcodes/outputs/combo_ik_csfs_trace.json
Network           Signet | Bitcoin Inquisition 29.2
```

---

## Resources

- Bitcoin Inquisition: [github.com/bitcoin-inquisition](https://github.com/bitcoin-inquisition/)

- btcaaron toolkit: [github.com/aaron-recompile/btcaaron](https://github.com/aaron-recompile/btcaaron)

- RootScope visualizer: [github.com/aaron-recompile/rootscope](https://github.com/aaron-recompile/rootscope)

---

*Signet | Bitcoin Inquisition 29.2 | Commit *`[*9930e922...0ea8*](https://mempool.space/signet/tx/9930e922036a80d04a96a4b08f15838bcb880ce2a4be91da0b24af1484e10ea8?showDetails=true)`* | Reveal *`[*8d0b2156...dd8f*](https://mempool.space/signet/tx/8d0b2156e9425afe64cabf3c906da255b6b86c51cb8968f828d5253fc261dd8f?showDetails=true)`

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [March 21, 2026](https://medium.com/p/04f0440557bc).

[Canonical link](https://medium.com/@aaron.recompile/op-internalkey-op-checksigfromstack-on-signet-identity-bound-authorization-04f0440557bc)

Exported from [Medium](https://medium.com) on July 3, 2026.
