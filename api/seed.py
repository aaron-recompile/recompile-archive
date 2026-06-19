"""Seed the database with real Aaron Recompile blog data.

Idempotent: skips seeding if any series already exists.
Run with:
    docker compose exec backend python seed.py
or locally:
    python seed.py
"""

from datetime import date

from database import Base, SessionLocal, engine
from models import Article, Series


SERIES = [
    {
        "name": "Not Just HODLing — Real Bitcoin Script Engineering",
        "slug": "not-just-hodling",
        "description": "Hands-on Bitcoin Script engineering: timelocks, multisig, Taproot trees, control blocks, and stack execution — built and tested on testnet.",
        "articles": [
            {
                "title": "How I Built a Time-Locked Bitcoin Script with CSV and P2SH",
                "subtitle": "Not Just HODLing: Real Bitcoin Script Engineering #1",
                "published_at": date(2025, 6, 29),
                "url": "https://medium.com/@aaron.recompile/how-i-built-a-time-locked-bitcoin-script-with-csv-and-p2sh-c48c0389709d",
                "position": 1,
            },
            {
                "title": "A Guide to Creating Taproot Scripts with Python Bitcoinutils",
                "subtitle": "Not Just HODLing: Real Bitcoin Script Engineering #2",
                "published_at": date(2025, 6, 29),
                "url": "https://medium.com/@aaron.recompile/a-guide-to-creating-taproot-scripts-with-python-bitcoinutils-e088633bc2a7",
                "position": 2,
            },
            {
                "title": "Building a 4-Leaf Taproot Tree in Python: The First Complete Implementation on Bitcoin Testnet",
                "subtitle": "Not Just HODLing #3 — a complete Taproot tree with five spending paths in Python and live-tested",
                "published_at": date(2025, 7, 1),
                "url": "https://medium.com/@aaron.recompile/building-a-4-leaf-taproot-tree-in-python-the-first-complete-implementation-on-bitcoin-testnet-c8b66c331f29",
                "position": 3,
            },
            {
                "title": "Taproot Control Block Deep Analysis & Stack Execution Visualization | Part 2",
                "subtitle": "In Part 1, we implemented a complete 4-leaf Taproot tree. Now we open the control block and visualize the stack.",
                "published_at": date(2025, 7, 7),
                "url": "https://medium.com/@aaron.recompile/taproot-control-block-deep-analysis-stack-execution-visualization-5ff10f98032c",
                "position": 4,
            },
        ],
    },
    {
        "name": "OP_* on Signet — Bitcoin Inquisition",
        "slug": "op-on-signet",
        "description": "Running experimental Bitcoin opcodes on Signet via Bitcoin Inquisition: OP_CAT, OP_CHECKSIGFROMSTACK, OP_CTV, OP_INTERNALKEY, and SIGHASH_ANYPREVOUT.",
        "articles": [
            {
                "title": "OP_CAT on Signet — Concatenation, Commitment, and Bitcoin Inquisition",
                "subtitle": "Satoshi disabled it in 2010. We ran it on-chain in 2026.",
                "published_at": date(2026, 3, 16),
                "url": "https://medium.com/@aaron.recompile/op-cat-on-signet-concatenation-commitment-and-bitcoin-inquisition-ed34a07866d6",
                "position": 1,
            },
            {
                "title": "OP_CHECKSIGFROMSTACK on Signet — Sign Anything, Verify on Stack",
                "subtitle": "Satoshi disabled OP_CAT in 2010. OP_CSFS was never even enabled. We ran it on-chain in 2026.",
                "published_at": date(2026, 3, 17),
                "url": "https://medium.com/@aaron.recompile/op-checksigfromstack-on-signet-sign-anything-verify-on-stack-9cf70ab07583",
                "position": 2,
            },
            {
                "title": "OP_CHECKTEMPLATEVERIFY on Signet — Locking Outputs at UTXO Creation Time",
                "subtitle": "With OP_CAT you assemble data. With OP_CSFS you authorize it. With OP_CTV you enforce it.",
                "published_at": date(2026, 3, 19),
                "url": "https://medium.com/@aaron.recompile/op-checktemplateverify-on-signet-locking-outputs-at-utxo-creation-time-1d623fbe3899",
                "position": 3,
            },
            {
                "title": "OP_INTERNALKEY + OP_CHECKSIGFROMSTACK on Signet — Identity-Bound Authorization",
                "subtitle": "Pure CSFS asks: did someone sign this? IK + CSFS asks: did the owner sign this?",
                "published_at": date(2026, 3, 21),
                "url": "https://medium.com/@aaron.recompile/op-internalkey-op-checksigfromstack-on-signet-identity-bound-authorization-04f0440557bc",
                "position": 4,
            },
            {
                "title": "OP_CAT + OP_CHECKSIGFROMSTACK on Signet — Dynamic Message, Oracle Authorization",
                "subtitle": "Combining concatenation and stack-signature verification for oracle-driven scripts.",
                "published_at": date(2026, 3, 27),
                "url": "https://medium.com/@aaron.recompile/op-cat-op-checksigfromstack-on-signet-dynamic-message-oracle-authorization-8c73e1ef5353",
                "position": 5,
            },
            {
                "title": "SIGHASH_ANYPREVOUT on Signet: When Signatures Stop Binding to UTXOs",
                "subtitle": "Standard CHECKSIG asks: did you sign for this UTXO? ANYPREVOUT relaxes that.",
                "published_at": date(2026, 4, 11),
                "url": "https://medium.com/@aaron.recompile/sighash-anyprevout-on-signet-when-signatures-stop-binding-to-utxos-eed4fc475668",
                "position": 6,
            },
        ],
    },
    {
        "name": "Mastering Taproot",
        "slug": "mastering-taproot",
        "description": "Excerpts from the Mastering Taproot book project: deep chapters on P2SH foundations, Taproot internals, and the script-path stack.",
        "articles": [
            {
                "title": "How Bitcoin P2SH Scripts Work: From 2-of-3 Multisig to Timelocked Inheritance",
                "subtitle": "from Mastering Taproot — full chapter",
                "published_at": date(2025, 7, 13),
                "url": "https://medium.com/@aaron.recompile/how-bitcoin-p2sh-scripts-work-from-2-of-3-multisig-to-timelocked-inheritance-8015010dd6f2",
                "position": 1,
            },
        ],
    },
    {
        "name": "Delving Bitcoin",
        "slug": "delving-bitcoin",
        "description": "First-hand research posts on Delving Bitcoin: Bitcoin Inquisition signet experiments and covenant design, several with on-chain signet TXIDs in-thread.",
        "articles": [
            {
                "title": "Bitcoin Inquisition 29.2 (opcode experiment index)",
                "subtitle": "Inquisition 29.2 (on Core 29.3rc2) heretically activates BIP 118 (ANYPREVOUT), BIP 119 (CTV), BIP 347 (OP_CAT) and BIP 348 (CSFS) on signet — the opcode playground these experiments run on.",
                "url": "https://delvingbitcoin.org/t/bitcoin-inqusition-29-2/2236",
                "position": 1,
            },
            {
                "title": "Eltoo State Chain on Signet — 3 rounds, 6 tx (APO+CTV)",
                "subtitle": "A three-round Eltoo-style state chain on Inquisition signet, each state UTXO a three-leaf Taproot tree (CTV settle, APO update, CSV escape) — six confirmed transactions.",
                "url": "https://delvingbitcoin.org/t/eltoo-state-chain-on-signet-three-rounds-six-transactions-apo-ctv/2413",
                "position": 2,
            },
            {
                "title": "Eltoo State Chain on Signet Again — 3 rounds, 2 tx (CSFS+CTV, rekey+ladder, no CAT)",
                "subtitle": "Same three-round scenario, primitive switched to CSFS+CTV: a single CSFS delegation ladder with CTV-enforced settlement compresses the six transactions down to two — no OP_CAT.",
                "url": "https://delvingbitcoin.org/t/eltoo-state-chain-on-signet-again-three-rounds-two-transactions-csfs-ctv-with-rekey-and-ladder-no-cat/2430",
                "position": 3,
            },
            {
                "title": "Challenge: Covenants for Braidpool",
                "subtitle": "Bob McElrath's open challenge to find covenant constructions for Braidpool's rolling coinbase aggregation (RCA → UHPO) custody; Aaron joined the thread with a reply.",
                "url": "https://delvingbitcoin.org/t/challenge-covenants-for-braidpool/1370",
                "position": 4,
            },
            {
                "title": "What exactly is bound in CSFS, IK+CSFS, and CHECKSIG?",
                "subtitle": "An observable comparison of what three Tapscript constructions actually bind: CSFS binds a stack-supplied message (replayable), IK+CSFS binds identity, CHECKSIG binds the tx sighash (non-replayable).",
                "url": "https://delvingbitcoin.org/t/what-exactly-is-bound-in-csfs-ik-csfs-and-checksig/2351",
                "position": 5,
            },
            {
                "title": "Taproot-native prevout binding via sighash-preimage decomposition",
                "subtitle": "Binding one input's outpoint to another using the sha_prevouts field of the sighash preimage as the anchor — full witness layout for the CTV+CSFS BitVM-bridge binding problem.",
                "url": "https://delvingbitcoin.org/t/taproot-native-prevout-binding-via-sighash-preimage-decomposition/2483",
                "position": 6,
            },
            {
                "title": "CTV+CSFS: Can We Reach Consensus on a First Step Towards Covenants",
                "subtitle": "The long-running debate on whether CTV+CSFS is the right first covenant step — including whether it is truly equivalent to APO / Lightning Symmetry; Aaron participated in the discussion.",
                "url": "https://delvingbitcoin.org/t/ctv-csfs-can-we-reach-consensus-on-a-first-step-towards-covenants/1509/14",
                "position": 7,
            },
            {
                "title": "CTV / APO / CAT Activity on Signet",
                "subtitle": "AJ Towns' survey of how BIP 118 (APO), BIP 119 (CTV) and BIP 347 (OP_CAT) have actually been used on signet since 2022; Aaron participated in the thread.",
                "url": "https://delvingbitcoin.org/t/ctv-apo-cat-activity-on-signet/1257",
                "position": 8,
            },
        ],
    },
]

STANDALONES = [
    {
        "title": "Bitcoin Script Doesn't Execute What's on the Stack: A Developer's Journey From Misconception to Clarity",
        "subtitle": "Not everything on the Bitcoin stack is meant to be executed — some things are meant to be verified, then forgotten.",
        "published_at": date(2025, 7, 13),
        "url": "https://medium.com/@aaron.recompile/bitcoin-script-doesnt-execute-what-s-on-the-stack-a-developer-s-journey-from-misconception-to-5fd4229a0864",
    },
    {
        "title": "The Anatomy of Bitcoin Scripts: From P2PKH to Taproot",
        "subtitle": "Understanding these primitives is the foundation for everything that follows — Lightning, covenant proposals, and beyond.",
        "published_at": date(2025, 11, 23),
        "url": "https://medium.com/@aaron.recompile/the-anatomy-of-bitcoin-scripts-from-p2pkh-to-taproot-4db16924232f",
    },
    {
        "title": "Commit-Reveal vs Dual-Layer Scripts: The Real Architecture of Bitcoin Script",
        "subtitle": "The universal truth: Commit → Reveal and Single-Layer vs Dual-Layer Scripts.",
        "published_at": date(2025, 12, 2),
        "url": "https://medium.com/@aaron.recompile/commit-reveal-vs-dual-layer-scripts-the-real-architecture-of-bitcoin-script-665a79b0bd34",
    },
    {
        "title": "Why Counterparty's Fake-Pubkey Grinding Reveals the Real Boundary Between Bitcoin Consensus and Policy",
        "subtitle": "Consensus guarantees possibility. Policy guarantees sanity.",
        "published_at": date(2025, 11, 22),
        "url": "https://medium.com/@aaron.recompile/why-counterpartys-fake-pubkey-grinding-reveals-the-real-boundary-between-bitcoin-consensus-and-3c891f0e7ec9",
    },
    {
        "title": "Why V3 Matters: Bitcoin's Relay Layer Was Rewritten, and Most People Didn't Notice",
        "subtitle": "V3, Package Relay, and Ephemeral Anchors quietly fixed a structural flaw in Bitcoin's fee and relay model.",
        "published_at": date(2025, 11, 28),
        "url": "https://medium.com/@aaron.recompile/why-v3-matters-bitcoins-relay-layer-was-rewritten-and-most-people-didn-t-notice-5d4f1b56b5bd",
    },
    {
        "title": "Bitcoin Doesn't Use Encryption — What Adam Back's Comment Really Means",
        "subtitle": "Bitcoin has nothing encrypted. Its security is built on verification, not secrecy — and the real quantum risk is forgery, not decryption.",
        "published_at": date(2025, 11, 16),
        "url": "https://medium.com/@aaron.recompile/bitcoin-doesnt-use-encryption-what-adam-back-s-comment-really-means-4c3f1527a4d3",
    },
    {
        "title": "RootScope: A Tool for Reconstructing Taproot Script Paths — Step by Step",
        "subtitle": "When you spend from a Taproot script path, the hash chain is deterministic. Reconstructing it by hand is a trap.",
        "published_at": date(2026, 3, 9),
        "url": "https://medium.com/@aaron.recompile/rootscope-a-tool-for-reconstructing-taproot-script-paths-step-by-step-106012af54b9",
    },
    {
        "title": "The Missing Developer Stack of Taproot",
        "subtitle": "Why Taproot still lacks the infrastructure developers need.",
        "published_at": date(2026, 3, 11),
        "url": "https://medium.com/@aaron.recompile/the-missing-developer-stack-of-taproot-61352dad7f96",
    },
]


def seed():
    """Idempotent + additive seed.

    Adds any series whose slug is not already present (with its articles), and
    any standalone article whose url is not already present. Existing rows are
    left untouched, so this is safe to re-run on a populated production DB to
    pull in newly-added content without wiping data.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        added_series = 0
        added_articles = 0

        for series_spec in SERIES:
            spec = dict(series_spec)  # copy so we don't mutate the module-level list
            articles = spec.pop("articles")
            if db.query(Series).filter_by(slug=spec["slug"]).first():
                continue
            series = Series(**spec)
            db.add(series)
            db.flush()
            for art in articles:
                db.add(Article(series_id=series.id, **art))
                added_articles += 1
            added_series += 1

        for art in STANDALONES:
            if art.get("url") and db.query(Article).filter_by(url=art["url"]).first():
                continue
            db.add(Article(**art))
            added_articles += 1

        db.commit()
        n_series = db.query(Series).count()
        n_articles = db.query(Article).count()
        print(
            f"Seed complete: +{added_series} series, +{added_articles} articles "
            f"(now {n_series} series, {n_articles} articles)."
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed()
