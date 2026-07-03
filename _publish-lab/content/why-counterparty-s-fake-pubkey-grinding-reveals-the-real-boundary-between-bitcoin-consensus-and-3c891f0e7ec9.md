---
title: "Why Counterparty’s Fake-Pubkey Grinding Reveals the Real Boundary Between Bitcoin Consensus and…"
subtitle: "Consensus guarantees possibility. Policy guarantees sanity."
tags: [bitcoin]
canonical_url: "https://medium.com/@aaron.recompile/why-counterparty-s-fake-pubkey-grinding-reveals-the-real-boundary-between-bitcoin-consensus-and-3c891f0e7ec9"
cover_image: "https://cdn-images-1.medium.com/max/800/1*tqg0U8kx7sZYpTuN_PMQrg.jpeg"
published: false
---

```
Bitcoin is not a state machine.
It is a verifiable sequence of events.

"Event Machine Letters - Protocol Thoughts on Bitcoin's Architecture" begins here.
```

---

## Introduction

While writing Chapter 5 of my book [*How People Tried to Push Non-Transaction Data into Bitcoin*](https://btcstudy.gitbook.io/bitcoin-data-embedding/book/manuscript/ch05_counterparty-multisig), I fell into a technical rabbit hole: How did Counterparty manage to store structured payloads inside bare multisig outputs?

The answer turned out to be more interesting than expected — not because of multisig itself, but because Counterparty’s “fake-pubkey grinding” exposes a deep and often misunderstood distinction in Bitcoin:

**Consensus guarantees possibility.** 
 **Policy guarantees sanity.**

Most debates around Bitcoin protocol behavior (including recent ones) come from mixing these two layers together. Counterparty provides a perfect historical case study for why this distinction matters.

---

## 1. Counterparty’s Hack: Multisig as a Data Container

Counterparty (2014) was the first protocol to systematically embed arbitrary data in Bitcoin by encoding payloads inside fake public keys placed in a 1-of-3 bare multisig output:

```
OP_1 <fake_pubkey1> <fake_pubkey2> <real_pubkey> OP_3 OP_CHECKMULTISIG
```

- The fake pubkeys contained 64 bytes of payload

- The real pubkey ensured the output was theoretically spendable

- OP_RETURN carried only the instruction header

- Multisig carried the full structured payload

This design allowed Counterparty to break through the ~80-byte OP_RETURN limit and support more complex protocol messages.

But it also forced Counterparty to confront Bitcoin’s deepest rules.

---

## 2. Why Fake Pubkeys Must Be Valid EC Points

At first glance, one might think:

> *“If Counterparty never plans to spend these outputs, who cares if the pubkeys are valid?”*

Bitcoin cares — a lot.

Before a transaction can enter the mempool, Bitcoin Core performs a full consensus-level script validity check. This check ensures:

- The script is syntactically valid

- No opcode triggers immediate failure

- Every pubkey is a valid secp256k1 point

- CHECKMULTISIG would not immediately error

Bitcoin does not allow an output that is provably unspendable due to script error. That would violate consensus rules, not policy.

Thus:

**Even if no one will ever spend the output, fake pubkeys still must be on the secp256k1 curve.**

This is why Counterparty clients had to grind fake pubkeys:

**Grinding =**

Search for an x-coordinate that:

1. Encodes the payload (high bits), and

1. Produces a valid curve point (low bits adjusted until valid)

Only such points can be accepted into the mempool and relayed across the network.

Without a valid EC point, the transaction never broadcasts — it fails before policy even enters the picture.

---

## 3. Consensus vs. Policy: What Counterparty Accidentally Taught Us

Counterparty’s architecture forces us to confront the difference between two layers often confused in Bitcoin debates.

## Consensus Layer: Strict Logic, Wide Permission

Consensus rules guarantee:

- Every output is theoretically spendable

- Script execution will not immediately error

- Public keys are valid

- CHECKMULTISIG would not produce ScriptError

- Script semantics are self-consistent

Consensus does not care:

- whether an output will ever be spent

- whether the pubkey is used as a data container

- whether the protocol “abuses” Bitcoin

- whether it’s storing JPEGs or metadata

- whether users are burning dust forever

Bitcoin consensus is maximalist in a very precise way:

**If your pubkey is valid and your script is internally consistent, consensus says “Yes.”**

It is rule-bound but not value-judging — almost Confucian in spirit.

## Policy Layer: Pragmatic, Local, Protective

Policy rules — Bitcoin Core’s mempool rules — are not consensus. They exist only to prevent node DoS and spam.

Policy restricts:

- bare multisig relay

- multisig N ranges

- dust thresholds

- OP_RETURN sizes

- nonstandard script forms

These rules:

- vary between node implementations

- do not affect the blockchain

- do not define Bitcoin’s consensus

- only determine whether the transaction is relayed and mined easily

This is why Counterparty eventually became marginalized:

- Consensus allowed it

- Policy discouraged it

Bare multisig became a disfavored pattern, even though it remains fully valid at the consensus layer.

---

## 4. The Real Insight: Bitcoin Allows Abuse at Consensus, Discourages It at Policy

Counterparty sits precisely at the intersection of the two:

**Consensus:**

“That fake pubkey is a valid secp256k1 point? Then this multisig output is fine.”

**Policy:**

“Don’t fill the UTXO set with garbage. We may choose not to relay this.”

**Users:**

“These outputs are dust. We’re never spending them anyway.”

Thus, Counterparty becomes:

**Consensus permissiveness ×** 
 **Policy defensiveness ×** 
 **User economic behavior**

It’s far more than a curiosity of early NFT history. It’s a case study in how Bitcoin’s layered design produces emergent behavior.

---

## 5. Why This Distinction Matters Today

A surprising number of recent Bitcoin debates — OP_RETURN policy changes, Ordinals arguments, BitVM anchoring, and even knothole discussions — stem from the same misunderstanding:

**People mix up consensus rules (what is allowed) with policy rules (what is relayed or encouraged).**

Counterparty’s fake-pubkey grinding is the earliest and clearest reminder of this separation.

Understanding it is essential for understanding Bitcoin’s evolution — and the fights that continue around it.

---

## Conclusion

Counterparty wasn’t just a creative hack for storing data in Bitcoin. It was the first protocol to unintentionally illuminate the boundary between *can* and *should*, between consensus and policy.

And many misunderstandings in today’s discussions remain unsolved simply because this boundary is still not widely understood.

If we want to reason clearly about Bitcoin’s future, this distinction is the place to start.

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [November 24, 2025](https://medium.com/p/3c891f0e7ec9).

[Canonical link](https://medium.com/@aaron.recompile/why-counterpartys-fake-pubkey-grinding-reveals-the-real-boundary-between-bitcoin-consensus-and-3c891f0e7ec9)

Exported from [Medium](https://medium.com) on July 3, 2026.
