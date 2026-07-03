---
title: "Bitcoin Script Doesn’t Execute What’s on the Stack: A Developer’s Journey From Misconception to…"
subtitle: "Not everything on the Bitcoin stack is meant to be executed — some things are meant to be verified, then forgotten"
tags: [bitcoin]
canonical_url: "https://medium.com/@aaron.recompile/bitcoin-script-doesn-t-execute-what-s-on-the-stack-a-developer-s-journey-from-misconception-to-5fd4229a0864"
cover_image: "https://cdn-images-1.medium.com/max/800/1*Da5Q3oVjQ1jZRZxkDdt4Dg.png"
published: false
---

```
HODLing is the beginning.
But Bitcoin was meant to be programmed.

"Not Just HODLing: Real Bitcoin Script Engineering" starts here.
```

---

*“Why does the redeemScript in a P2SH transaction get executed after hash comparison?”*

*“Can’t I just duplicate it before hashing, so it’s still on the stack and ready to be executed?”*

That’s what I used to think — until I truly understood Bitcoin Script’s execution model.

This article documents a subtle misconception I had while learning P2SH, and how I reasoned my way out of it.

---

## ❓ The Misconception: Scripts on the Stack Should Execute

When I first studied Pay-to-Script-Hash (P2SH), I thought:

> *“If I push <sig> <redeemScript> onto the stack, then use OP_DUP + OP_HASH160 to check the hash, one copy of redeemScript will remain on the stack. Can’t we just continue execution from there?”*

This logic might make sense in a generic stack-based language like Forth. But in Bitcoin Script, it doesn’t work that way.

## 🔍 The Truth: Bitcoin Script Never Executes Stack Data as Code

In Bitcoin Script:

> ***Only the instructions written in the script body are executed. Anything on the stack is treated as data, not executable code.***

That means:

- Even if you push a full redeemScript onto the stack, it won’t be interpreted as code.

- There’s no EVAL opcode.

- Nothing in the language will “run” a script fragment stored on the stack.

## ✅ Then How Does P2SH Work?

This is where Bitcoin’s **consensus rules**, not the script language itself, step in.

Here’s what actually happens in a P2SH spend:

1. The scriptSig is executed, pushing <sig> <redeemScript> onto the stack.

1. The scriptPubKey (which looks like OP_HASH160 <hash> OP_EQUAL) is run.

1. If the hash of redeemScript matches, Bitcoin Core **pulls out the redeemScript from the stack** and executes it as a brand new script.

1. ***The redeemScript gets executed not because it’s “still on the stack”, but because the Bitcoin engine explicitly takes it out and runs it.***

---

## 🧪 A Common Mistake: Demonstrated and Corrected

Let’s look at a broken example of stack state during hash comparison:

❌ Incorrect Version:

```
### 4. PUSH_EXPECTED_HASH  
| 2a873f3c...890fb2 (expected_hash)       |
| c5b28d6b...890fb2 (redeem_script_hash)  |
| 30450220...78c201 (signature)           |
└─────────────────────────────────────────┘
```

```
### 5. OP_EQUAL  
| TRUE (hash_match) ← ❌ Impossible!      |
```

These two hash values are different. OP_EQUAL cannot return TRUE.

## ✅ Correct Version:

```
### 4. PUSH_EXPECTED_HASH  
| c5b28d6b...890fb2 (expected_hash)       |
| c5b28d6b...890fb2 (redeem_script_hash)  |
| 30450220...78c201 (signature)           |
└─────────────────────────────────────────┘
```

```
### 5. OP_EQUAL  
| TRUE (hash_match)                       |
| 30450220...78c201 (signature)           |
└─────────────────────────────────────────┘
```

Only when the redeemScript hash exactly matches the expected value does execution proceed.

## ✨ My Moment of Clarity

I used to think:

> *“If the script is still on the stack, Bitcoin will just continue executing it.”*

But the reality is:

> *“Bitcoin Core explicitly extracts the redeemScript from scriptSig and ****runs it as a new script****, after verifying its hash.”*

This isn’t something the scripting language does. It’s something **the consensus engine** does.

## 🧠 Why This Matters for Developers

Bitcoin Script is **linear and explicit**. It does not support:

- Arbitrary control flow

- Self-modifying or self-evaluating code

- Executing values from the stack as new scripts

If you want something executed, it must be written into the script body — or explicitly injected by consensus rules (like P2SH or Taproot).

## 🖼️ Bonus: Realistic P2SH Execution Stack Diagram

Here’s a full breakdown of what actually happens during a standard P2SH spend with a CSV timelock:

## 🔵 P2SH Validation Phase: Executing

## scriptSig + scriptPubKey

## 1. PUSH_SIGNATURE

```
| 30450220…78c201 (signature)             |
└─────────────────────────────────────────┘
```

## 2. PUSH_REDEEMSCRIPT

```
| 5121028a…91f2ac (redeem_script)         |
| 30450220…78c201 (signature)             |
└─────────────────────────────────────────┘
```

## 3. OP_HASH160

```
| c5b28d6b…890fb2 (redeem_script_hash)    |
| 30450220…78c201 (signature)             |
└─────────────────────────────────────────┘
```

## 4. PUSH_EXPECTED_HASH

```
| c5b28d6b…890fb2 (expected_hash)         |
| c5b28d6b…890fb2 (redeem_script_hash)    |
| 30450220…78c201 (signature)             |
└─────────────────────────────────────────┘
```

## 5. OP_EQUAL

```
| TRUE (hash_match)                       |
| 30450220…78c201 (signature)             |
└─────────────────────────────────────────┘
```

**(redeemScript successfully validated)**

## 🟢 Redeem Script Execution Phase

Bitcoin Core now begins interpreting redeemScript as a new script:

```
0140
OP_CHECKSEQUENCEVERIFY
OP_DROP
028a9f4c...91f2
OP_CHECKSIG
```

## 6. PUSH_DELAY

```
| 0140 (csv_delay)                        |
| 30450220…78c201 (signature)             |
└─────────────────────────────────────────┘
```

## 7. OP_CHECKSEQUENCEVERIFY

```
| 0140 (csv_delay)                        |
| 30450220…78c201 (signature)             |
└─────────────────────────────────────────┘
```

## 8. OP_DROP

```
| 30450220…78c201 (signature)             |
└─────────────────────────────────────────┘
```

## 9. PUSH_PUBKEY

```
| 028a9f4c…91f2 (public_key)              |
| 30450220…78c201 (signature)             |
└─────────────────────────────────────────┘
```

## 10. OP_CHECKSIG

```
|  TRUE (signature_valid)                 |
└─────────────────────────────────────────┘
```

## 🧾 Summary

- ✅ **Stack data is not executable**

- ✅ **P2SH works via consensus-layer script injection**

- ✅ **Misunderstanding stack/code separation leads to broken assumptions**

Bitcoin Script doesn’t let you “leave code on the stack and hope it runs”. Execution must be explicit, linear, and structured.

This is the essence of **Real Bitcoin Script Engineering**. All code and on-chain data analysis are available at my [github](https://github.com/btcstudy/btcstudy.github.io/tree/main/bitcoin-script-engineering-demo_01) repo. Feel free to Star and Fork!

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [July 13, 2025](https://medium.com/p/5fd4229a0864).

[Canonical link](https://medium.com/@aaron.recompile/bitcoin-script-doesnt-execute-what-s-on-the-stack-a-developer-s-journey-from-misconception-to-5fd4229a0864)

Exported from [Medium](https://medium.com) on July 3, 2026.
