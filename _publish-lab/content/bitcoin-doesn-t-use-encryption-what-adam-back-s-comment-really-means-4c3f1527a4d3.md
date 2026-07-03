---
title: "Bitcoin Doesn’t Use Encryption — What Adam Back’s Comment Really Means"
subtitle: "Bitcoin has nothing encrypted. Its security is built on verification, not secrecy — and the real quantum risk is forgery, not decryption."
tags: [bitcoin, cryptography]
canonical_url: "https://medium.com/@aaron.recompile/bitcoin-doesn-t-use-encryption-what-adam-back-s-comment-really-means-4c3f1527a4d3"
cover_image: "https://cdn-images-1.medium.com/max/800/1*QJptTVU-vK47Te4muxCv4w.png"
published: false
---

```
Bitcoin is not a state machine.
It is a verifiable sequence of events.

"Event Machine Letters — Protocol Thoughts on Bitcoin’s Architecture" begins here.
```

---

When Chamath recently claimed that quantum computing could “break Bitcoin’s encryption,” Adam Back replied in six words:

**“Bitcoin doesn’t use encryption.”**

To most readers, it looked like a trivial correction.

![](https://cdn-images-1.medium.com/max/800/1*MZhJIRtyOpYXtw4w4q-ZFQ.png)

For anyone who understands Bitcoin at the protocol level, that sentence reveals a deeper technical reality — a reminder of something far more fundamental:

> ***Most people do not understand what type of cryptography Bitcoin actually relies on — and what type it deliberately avoids.***

This misunderstanding fuels almost every mainstream narrative about “quantum threats,”

and why Bitcoin supposedly needs “better encryption.”

Bitcoin has no encryption to break — only verification that must hold.

Let’s clarify the model.

---

## 1. Encryption vs. Verification — the core misunderstanding

Encryption is about **secrecy**.

Verification is about **truth**.

These two concepts are often conflated, but in cryptography they could not be more different.

## Encryption systems:

- hide data

- require a secret to reveal it

- rely on confidentiality

## Bitcoin:

- hides nothing

- publishes everything

- relies on public validation

A Bitcoin node sees:

- every block

- every transaction

- every script

- every witness

- every Merkle commitment

- every Taproot leaf / control block

There is **no ciphertext**, no private ledger, no encrypted payloads.

People call Bitcoin “encrypted” because the words *crypto* and *cryptocurrency* mislead them.

But the ledger is fully transparent and always has been.

## **Bitcoin does not protect secrets. Bitcoin protects integrity**

It does not rely on “nobody can read this.”

It relies on “anybody can check this.”

---

## 2. What actually protects Bitcoin

Bitcoin uses two cryptographic primitives — but neither is encryption:

## (1) Digital Signatures (ECDSA / Schnorr)

They do *not* hide data.

They only prove that a private key authorized a spend.

A signature is proof of intent, not a lockbox.

## (2) Hash Functions (SHA256 / RIPEMD160)

They are irreversible and collision-resistant — but not encryption.

A hash is not meant to be decrypted; it is meant to detect tampering.

Hashes secure:

- transaction IDs

- scripts

- Merkle trees

- Taproot commitments

- UTXO identity

- witness boundaries

Bitcoin’s security model is:

> ***Truth comes from verification, not secrecy.***

---

## 3. What quantum computers actually threaten

Quantum computers don’t “decrypt Bitcoin” because there is nothing to decrypt.

The real theoretical risk lies in:

## ✔public-key exposure + discrete-log hardness

If a UTXO has already revealed its public key on-chain

(e.g., reused addresses or already-spent outputs),

a powerful enough quantum computer *might* forge a signature.

This is forgery — not decryption.

## And even then, Bitcoin has built-in mitigations:

- Most UTXOs **do not expose public keys until spending** (hashed P2PKH/P2WPKH model).

- Funds can be migrated to PQ-safe Taproot leaves.

- A soft fork can add post-quantum signature types.

- Nodes simply verify the new signatures — the consensus model does not change.

Quantum computing challenges **one primitive** (ECDLP),

not Bitcoin’s architecture.

---

## 4. Why Adam Back’s correction matters

Adam’s background is deep cypherpunk and cryptographic engineering.

For him, the distinction is foundational:

## **Encryption = confidentiality， Signatures & hashes = verifiability**

Confusing the two leads to:

- false fears (“quantum will decrypt Bitcoin”)

- bad mental models (“Bitcoin’s privacy depends on encryption”)

- wrong assumptions (“Bitcoin needs constant L1 crypto upgrades”)

- incorrect security forecasts (“when signatures get weak, Bitcoin dies”)

But Bitcoin’s design is intentionally built to survive cryptographic evolution:

> ***The only invariant is that nodes must verify truth publicly.***

> ***Not that any particular algorithm must remain unbreakable forever.***

This is why Bitcoin is resilient —

its core is *verifiability*, not opacity.

---

## 5. The real lesson

When people say “Bitcoin is secured by cryptography,”

they picture encryption — a vault of secrets.

That is not Bitcoin.

Bitcoin is secured by:

- **public verifiability**

- **unforgeable signatures**

- **irreversible hashing**

- **global consensus rules**

- **data transparency**

- **a UTXO model designed around exposure minimization**

- **upgradeable signature algorithms**

This is why:

- Bitcoin cannot be “decrypted.”

- Quantum computers cannot “see inside” anything.

- Cryptographic upgrades do not threaten consensus.

- The protocol can outlive any single primitive.

Bitcoin’s strength is not secrecy.

Bitcoin’s strength is **truth anyone can verify**.

---

## If you enjoy analysis from a builder’s perspective…

…Bitcoin scripts, Taproot path construction, verification semantics,

and protocol-level security —

Follow along.

I write to clarify Bitcoin from first principles,

and to help more engineers understand the architecture under the surface.

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [November 16, 2025](https://medium.com/p/4c3f1527a4d3).

[Canonical link](https://medium.com/@aaron.recompile/bitcoin-doesnt-use-encryption-what-adam-back-s-comment-really-means-4c3f1527a4d3)

Exported from [Medium](https://medium.com) on July 3, 2026.
