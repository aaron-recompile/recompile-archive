---
title: "How I Built a Time-Locked Bitcoin Script with CSV and P2SH"
subtitle: "Not Just HODLing: Real Bitcoin Script Engineering #1"
tags: [bitcoin]
canonical_url: "https://medium.com/@aaron.recompile/how-i-built-a-time-locked-bitcoin-script-with-csv-and-p2sh-c48c0389709d"
cover_image: "https://cdn-images-1.medium.com/max/800/1*H4MMEwfAIpy58ZdZ7HhuHA.png"
published: false
---

```
HODLing is the beginning.
But Bitcoin was meant to be programmed.

“Not Just HODLing: Real Bitcoin Script Engineering” starts here.
```

---

## Why Read This Article?

In the Bitcoin development world, most tutorials only teach you concepts, not how to actually write code, and even fewer guide you to thoroughly dissect a real Bitcoin transaction from the perspective of on-chain data and script principles.

This article uses a real case and complete code to help you master, in one go:

1. **P2SH script validation mechanism**

1. **CSV (CheckSequenceVerify) timelock mechanism**

1. **P2PKH signature validation mechanism**

You’ll see not just code, but also **step-by-step on-chain data animation**, as well as debug ideas and common error analysis at every stage.

---

## Article Structure Preview

- Motivation and Case Overview

- Building and Spending the P2SH Script (Full Code)

- Three-Layer Script Mechanism Breakdown

- Animated Stack Execution Walkthrough

- Debugging and On-Chain Data Analysis

- Summary and Takeaways

---

## 1. Motivation and Case Overview

The goal of this case:

- Use Python to build a P2SH address that can only be spent after 3 blocks (a P2PKH script with a CSV timelock)

- Actually send and spend coins, **broadcasting on-chain for real**

- Through this single case, help you fully understand P2SH, CSV, and P2PKH script mechanisms, and be able to reverse every step in a block explorer

The real on-chain transaction for this case:

[https://mempool.space/testnet/tx/34f5bf0cf328d77059b5674e71442ded8cdcfc723d0136733e0dbf180861906f](https://mempool.space/testnet/tx/34f5bf0cf328d77059b5674e71442ded8cdcfc723d0136733e0dbf180861906f)

I recommend opening this link as you read, and comparing each script and data step by step.

---

## 2. Building and Spending the P2SH Script (Full Code)

## 1. Build the P2SH (P2PKH with CSV timelock)

```
from bitcoinutils.setup import setup
from bitcoinutils.transactions import Sequence
from bitcoinutils.keys import P2shAddress, PrivateKey
from bitcoinutils.script import Script
from bitcoinutils.constants import TYPE_RELATIVE_TIMELOCK
import os, sys
import configparser

conf = configparser.ConfigParser()
conf_file = os.path.join(os.path.abspath(os.path.dirname(sys.argv[0])), "wa_info.conf")
conf.read(conf_file)
def main():
    setup("testnet")
    relative_blocks = 3
    seq = Sequence(TYPE_RELATIVE_TIMELOCK, relative_blocks)
    p2pkh_sk = PrivateKey(conf.get("testnet3", "private_key_wif"))
    p2pkh_addr = p2pkh_sk.get_public_key().get_address()
    redeem_script = Script([
        seq.for_script(),
        "OP_CHECKSEQUENCEVERIFY",
        "OP_DROP",
        "OP_DUP",
        "OP_HASH160",
        p2pkh_addr.to_hash160(),
        "OP_EQUALVERIFY",
        "OP_CHECKSIG",
    ])
    print(f"Redeem script (hex): {redeem_script.to_hex()}")
    addr = P2shAddress.from_script(redeem_script)
    print(f"P2SH address: {addr.to_string()}")
    conf.set('testnet3', 'p2sh_csv_addr', addr.to_string())
    with open(conf_file, "w") as f:
        conf.write(f)
if __name__ == "__main__":
    main()
```

## 2. Spend the P2SH (spend script)

```
from bitcoinutils.setup import setup
from bitcoinutils.utils import to_satoshis
from bitcoinutils.transactions import Transaction, TxInput, TxOutput, Sequence
from bitcoinutils.keys import P2pkhAddress, PrivateKey
from bitcoinutils.script import Script
from bitcoinutils.constants import TYPE_RELATIVE_TIMELOCK
import os, sys
import configparser
import requests

conf = configparser.ConfigParser()
conf_file = os.path.join(os.path.abspath(os.path.dirname(sys.argv[0])), "wa_info.conf")
conf.read(conf_file)
def main():
    setup("testnet")
    relative_blocks = 3
    txid = "8e763d0269963e666949606e84e811a24df9cb525d7c436096b0c8a72be3533f"
    vout = 0
    seq = Sequence(TYPE_RELATIVE_TIMELOCK, relative_blocks)
    seq_for_n_seq = seq.for_input_sequence()
    txin = TxInput(txid, vout, sequence=seq_for_n_seq)
    p2pkh_sk = PrivateKey(conf.get("testnet3", "private_key_wif"))
    p2pkh_pk = p2pkh_sk.get_public_key().to_hex()
    p2pkh_addr = p2pkh_sk.get_public_key().get_address()
    redeem_script = Script([
        seq.for_script(),
        "OP_CHECKSEQUENCEVERIFY",
        "OP_DROP",
        "OP_DUP",
        "OP_HASH160",
        p2pkh_addr.to_hash160(),
        "OP_EQUALVERIFY",
        "OP_CHECKSIG",
    ])
    to_addr = P2pkhAddress("mn3XG8tZQjyUsoAmECTYFqVUECNJzEdapj")
    txout = TxOutput(to_satoshis(0.00000588), to_addr.to_script_pub_key())
    tx = Transaction([txin], [txout])
    print("Raw unsigned transaction:", tx.serialize())
    sig = p2pkh_sk.sign_input(tx, 0, redeem_script)
    txin.script_sig = Script([sig, p2pkh_pk, redeem_script.to_hex()])
    signed_tx = tx.serialize()
    print("Raw signed transaction:", signed_tx)
    print("TxId:", tx.get_txid())
    mempool_api = "<https://mempool.space/testnet/api/tx>"
    try:
        response = requests.post(mempool_api, data=signed_tx)
        if response.status_code == 200:
            txid = response.text
            print(f"Success! TxID: {txid}")
            print(f"View transaction: <https://mempool.space/testnet/tx/{txid}>")
        else:
            print(f"Broadcast failed: {response.text}")
    except Exception as e:
        print(f"Error: {e}")
if __name__ == "__main__":
    main()
```

## 3. Three-Layer Script Mechanism Breakdown

## 1. P2SH Validation (Outer Layer)

On-chain locking script (scriptPubKey):

```
OP_HASH160 <20-byte script hash> OP_EQUAL
```

Purpose: Checks if the redeem script you provide matches the hash locked in the output.

---

## 2. CSV Timelock Validation (Middle Layer)

First part of the redeem script:

```
3 OP_CHECKSEQUENCEVERIFY OP_DROP
```

Purpose: Only if nSequence is at least 3 (i.e., after 3 blocks), the script continues.

---

## 3. P2PKH Signature Validation (Inner Layer)

Second part of the redeem script:

```
OP_DUP OP_HASH160 <pubkey hash> OP_EQUALVERIFY OP_CHECKSIG
```

Purpose: Standard Bitcoin signature validation.

---

## 4. Animated Stack Execution Walkthrough

## 1. P2SH Validation Stage

## Step 1: ScriptSig pushes redeem script

```
┌───────────────────────────────┐
│53b27576...88ac (redeem script)│
├───────────────────────────────┤
│...(pubkey, signature)         │
└───────────────────────────────┘
```

## Step 2: OP_HASH160

```
┌───────────────────────────────┐
│79b6f3...cabaadcc (redeem script HASH160)│
├───────────────────────────────┤
│...(pubkey, signature)         │
└───────────────────────────────┘
```

## Step 3: OP_PUSHBYTES_20

```
┌───────────────────────────────┐
│79b6f3...cabaadcc (script hash in output)│
├───────────────────────────────┤
│79b6f3...cabaadcc (redeem script HASH160)│
├───────────────────────────────┤
│...(pubkey, signature)         │
└───────────────────────────────┘
```

## Step 4: OP_EQUAL

- Compares the top two hashes. If equal, continue; otherwise, fail.

---

## 2. CSV Timelock Validation Stage

## Step 1: Push 3 (CSV lock value)

```
┌────────────┐
│3           │
├────────────┤
│0250be...   │
├────────────┤
│30440220... │
└────────────┘
```

## Step 2: OP_CHECKSEQUENCEVERIFY

- If nSequence < 3, fail with non-BIP68-final.

- If nSequence ≥ 3, continue.

## Step 3: OP_DROP

```
┌────────────┐
│0250be...   │
├────────────┤
│30440220... │
└────────────┘
```

---

## 3. P2PKH Signature Validation Stage

## Step 1: OP_DUP

```
┌────────────┐
│0250be...   │
├────────────┤
│0250be...   │
├────────────┤
│30440220... │
└────────────┘
```

## Step 2: OP_HASH160

```
┌────────────┐
│5cdc28...   │  ← pubkey HASH160
├────────────┤
│0250be...   │
├────────────┤
│30440220... │
└────────────┘
```

## Step 3: OP_PUSHBYTES_20 (pubkey hash in script)

```
┌────────────┐
│5cdc28...   │  ← script's pubkey hash
├────────────┤
│5cdc28...   │  ← just computed HASH160
├────────────┤
│0250be...   │
├────────────┤
│30440220... │
└────────────┘
```

## Step 4: OP_EQUALVERIFY

```
┌────────────┐
│0250be...   │
├────────────┤
│30440220... │
└────────────┘
```

## Step 5: OP_CHECKSIG

- Uses pubkey and signature to verify. If valid, script succeeds and coins are spent.

---

## 5. Debugging and On-Chain Data Analysis

## 1. Common Errors and Troubleshooting

## (1) non-BIP68-final

- **Symptom**: Broadcast fails with `non-BIP68-final`

- **Reason**: You set a CSV timelock (e.g., 3 blocks), but not enough blocks have passed; nSequence is insufficient

- **Solution**:

- Wait for enough blocks before spending

- Check that your `relative_blocks` parameter and nSequence match

## (2) bad-txns-in-belowout

- **Symptom**: Broadcast fails with `bad-txns-in-belowout, value in < value out`

- **Reason**: Your input UTXO value is less than the output value (including change and fee)

- **Solution**:

- Check your input UTXO value

- Set output and change properly, leaving enough for fees

---

## 2. On-Chain Data Analysis Walkthrough

## Step 1: Open a block explorer

- Visit [https://mempool.space/testnet/tx/34f5bf0cf328d77059b5674e71442ded8cdcfc723d0136733e0dbf180861906f](https://mempool.space/testnet/tx/34f5bf0cf328d77059b5674e71442ded8cdcfc723d0136733e0dbf180861906f)

- Find the Inputs and Outputs sections

## Step 2: Compare ScriptSig and scriptPubKey

- **ScriptSig**: See OP_PUSHBYTES_71 (signature), OP_PUSHBYTES_33 (pubkey), OP_PUSHBYTES_28 (redeem script)

- **Previous output script** (scriptPubKey): OP_HASH160 <20-byte hash> OP_EQUAL

## Step 3: Manually step through script execution

- Use ScriptSig data to execute P2SH validation (OP_HASH160 + OP_EQUAL)

- If valid, execute redeem script: first CSV timelock (OP_CHECKSEQUENCEVERIFY), then P2PKH signature check

- Use the stack animation above to follow each step

## Step 4: Compare HEX and ASM

- In the block explorer, find the HEX and ASM for ScriptSig and scriptPubKey

- Match each byte and opcode to your code and the execution steps

---

## 3. Debugging Tips

- When you see errors, check mempool.space or [blockstream.info](http://blockstream.info/) for actual on-chain data

- Print raw transactions and script contents at each step, and compare with on-chain data

- If script execution fails, draw the stack changes by hand to find where it went wrong

---

## 4. Real Case Analysis

For this case, you can see on [mempool.space](https://mempool.space/testnet/tx/34f5bf0cf328d77059b5674e71442ded8cdcfc723d0136733e0dbf180861906f):

- Each ScriptSig item (signature, pubkey, redeem script)

- The scriptPubKey hash

- The actual execution order and stack changes

- If you spend too early, you’ll see non-BIP68-final

---

**With this code-onchain-debug workflow, you can not only write scripts, but also understand and debug every on-chain transaction.**

---

## 6. Summary and Takeaways

Through a real case and code, you have mastered:

- P2SH script validation

- CSV timelock mechanism

- P2PKH signature validation

- Animated stack-based script execution

- Debugging and on-chain data analysis

This is the essence of **Real Bitcoin Script Engineering**.

---

## Source Code

All code and on-chain data analysis are available at my [github](https://github.com/btcstudy/btcstudy.github.io/tree/main/bitcoin-script-engineering-demo_01) repo

Feel free to Star and Fork!

---

## References

- [python-bitcoin-utils official examples](https://github.com/karask/python-bitcoin-utils/tree/master/examples)

- [A Guide to creating TapRoot Scripts with bitcoinjs-lib](https://dev.to/eunovo/a-guide-to-creating-taproot-scripts-with-bitcoinjs-lib-4oph)

- [On-chain case at mempool.space](https://mempool.space/testnet/tx/34f5bf0cf328d77059b5674e71442ded8cdcfc723d0136733e0dbf180861906f)

By [Aaron Recompile](https://medium.com/@aaron.recompile) on [June 29, 2025](https://medium.com/p/c48c0389709d).

[Canonical link](https://medium.com/@aaron.recompile/how-i-built-a-time-locked-bitcoin-script-with-csv-and-p2sh-c48c0389709d)

Exported from [Medium](https://medium.com) on July 3, 2026.
