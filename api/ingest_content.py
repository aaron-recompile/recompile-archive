#!/usr/bin/env python3
"""
ingest_content.py — load the full Markdown bodies from _publish-lab/content/
into the archive DB (Article.content), so the archive holds real article text
(foundation for the pgvector full-text RAG on the roadmap).

Matches each .md to an existing Article by the Medium post id (trailing hex of
the URL). Unmatched pieces are created as new (uncategorized) Articles.

Run inside the api container (or with DATABASE_URL set):
    python ingest_content.py            # ingest ../\_publish-lab/content
    python ingest_content.py --dir /path/to/content
"""
import argparse
import os
import re
import glob

from sqlalchemy import text

from database import SessionLocal, engine
from models import Article

CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "_publish-lab", "content")


def split_frontmatter(txt):
    if not txt.startswith("---"):
        return {}, txt
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", txt, re.DOTALL)
    if not m:
        return {}, txt
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.lstrip().startswith("#"):
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip("'\"")
    return meta, m.group(2).lstrip("\n")


def post_id(url):
    """Trailing hex id of a Medium URL, e.g. ...-4db16924232f -> 4db16924232f."""
    if not url:
        return None
    m = re.search(r"-([0-9a-f]{8,})$", url.strip())
    return m.group(1) if m else None


def ensure_content_column():
    """Add the column to an already-created table (create_all won't ALTER)."""
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE articles ADD COLUMN IF NOT EXISTS content TEXT"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=CONTENT_DIR)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.dir, "*.md")))
    print(f"{len(files)} markdown files in {args.dir}")

    if not args.dry_run:
        ensure_content_column()

    db = SessionLocal()
    try:
        by_id = {}
        for a in db.query(Article).all():
            pid = post_id(a.url)
            if pid:
                by_id[pid] = a

        matched = created = 0
        for f in files:
            meta, body = split_frontmatter(open(f, encoding="utf-8").read())
            canon = meta.get("canonical_url")
            pid = post_id(canon)
            art = by_id.get(pid)
            title = meta.get("title", os.path.basename(f))
            if art:
                print(f"  match  {pid}  {title[:60]}")
                if not args.dry_run:
                    art.content = body
                matched += 1
            else:
                print(f"  NEW    {pid}  {title[:60]}")
                if not args.dry_run:
                    db.add(Article(title=title, subtitle=meta.get("subtitle"),
                                   url=canon, content=body))
                created += 1
        if not args.dry_run:
            db.commit()
        print(f"\n{'(dry-run) ' if args.dry_run else ''}matched={matched} created={created}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
