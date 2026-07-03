#!/usr/bin/env python3
"""
medium_html_to_md.py — convert a Medium data-export post (posts/*.html) into a
clean Markdown file with frontmatter, ready for publish.py -> dev.to.

Zero third-party deps (stdlib html.parser). Tuned to Medium's export markup:
  h1.p-name (title) | section.p-summary (subtitle) | section.e-content (body)
  blocks: graf--h3/h4, graf--p, graf--pre, graf--li, graf--figure, blockquote
  inline: markup--strong, markup--em, markup--code, markup--a
  <pre> holds <br/> line breaks + hljs spans (stripped to text)

Usage:
  python3 medium_html_to_md.py IN.html [-o OUT.md]
  python3 medium_html_to_md.py --batch EXPORT_DIR/posts -o content/
"""
import argparse
import os
import re
import sys
from html.parser import HTMLParser

USER = "aaron.recompile"  # medium handle for canonical reconstruction

TAG_KEYWORDS = [  # title-keyword -> dev.to tag (max 4 picked, bitcoin always first)
    ("taproot", "taproot"), ("signet", "bitcoin"), ("script", "bitcoin"),
    ("covenant", "bitcoin"), ("p2sh", "bitcoin"), ("multisig", "bitcoin"),
    ("op_", "bitcoin"), ("relay", "bitcoin"), ("encryption", "cryptography"),
]


def slug_and_id_from_filename(fn):
    """'2025-11-28_The-Anatomy-...-4db16924232f.html' -> (slug, id)."""
    base = re.sub(r"\.html$", "", os.path.basename(fn))
    base = re.sub(r"^\d{4}-\d{2}-\d{2}_", "", base)          # drop date prefix
    m = re.search(r"-([0-9a-f]{8,})$", base)
    post_id = m.group(1) if m else ""
    slug = re.sub(r"-{2,}", "-", base.lower()).strip("-")     # collapse -- -> -
    return slug, post_id


def canonical_url(fn):
    slug, _ = slug_and_id_from_filename(fn)
    return f"https://medium.com/@{USER}/{slug}"


def pick_tags(title):
    tags = ["bitcoin"]
    tl = title.lower()
    for kw, tag in TAG_KEYWORDS:
        if kw in tl and tag not in tags:
            tags.append(tag)
    if "taproot" in tl and "taproot" not in tags:
        tags.append("taproot")
    return tags[:4]


class MediumParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.subtitle = ""
        self.cover_image = ""
        self.blocks = []            # finished markdown blocks
        self._buf = []              # inline buffer for current block
        self._block = None          # 'h3','h4','p','pre','li','quote'
        self._href = None
        self._in_title_h1 = False
        self._in_subtitle = False
        self._in_body = False
        self._skip_block = False    # skip duplicated-title h3
        self._list_ordered = False

    # ---- helpers ----
    def _flush(self):
        text = "".join(self._buf)
        if self._block != "pre":
            text = re.sub(r"[ \t]+", " ", text).strip()
        if text and not self._skip_block:
            if self._block in ("h3",):
                self.blocks.append("## " + text)
            elif self._block == "h4":
                self.blocks.append("### " + text)
            elif self._block == "pre":
                self.blocks.append("```\n" + text.strip("\n") + "\n```")
            elif self._block == "quote":
                self.blocks.append("> " + text.replace("\n", "\n> "))
            elif self._block == "li":
                bullet = "1. " if self._list_ordered else "- "
                self.blocks.append(bullet + text)
            else:
                self.blocks.append(text)
        self._buf = []
        self._block = None
        self._skip_block = False

    # ---- tag handlers ----
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "")
        if tag == "h1" and "p-name" in cls:
            self._in_title_h1 = True
        elif tag == "section" and a.get("data-field") == "subtitle":
            self._in_subtitle = True
        elif tag == "section" and a.get("data-field") == "body":
            self._in_body = True
        if not self._in_body:
            return
        if tag == "pre":
            self._flush(); self._block = "pre"
        elif tag in ("h3", "h4"):
            self._flush(); self._block = tag
            if "graf--title" in cls:           # Medium repeats the title as first h3
                self._skip_block = True
        elif tag == "p":
            self._flush(); self._block = "p"
        elif tag == "blockquote":
            self._flush(); self._block = "quote"
        elif tag in ("ul", "ol"):
            self._list_ordered = (tag == "ol")
        elif tag == "li":
            self._flush(); self._block = "li"
        elif tag == "br":
            if self._block == "pre":
                self._buf.append("\n")
            else:
                self._buf.append("  \n")
        elif tag in ("strong", "b") and self._block != "pre":
            self._buf.append("**")
        elif tag in ("em", "i") and self._block != "pre":
            self._buf.append("*")
        elif tag == "code" and self._block != "pre":
            self._buf.append("`")
        elif tag == "a":
            self._href = a.get("href"); self._buf.append("[")
        elif tag == "img":
            src = a.get("src", "")
            if a.get("data-is-featured") == "true" and not self.cover_image:
                self.cover_image = src
            elif src:
                self._flush(); self.blocks.append(f"![]({src})")
        elif tag == "hr":
            self._flush()
            if self.blocks and self.blocks[-1] != "---":
                self.blocks.append("---")

    def handle_endtag(self, tag):
        if tag == "h1" and self._in_title_h1:
            self._in_title_h1 = False
        elif tag == "section" and self._in_subtitle:
            self._in_subtitle = False
        if not self._in_body:
            return
        if tag in ("pre", "h3", "h4", "p", "blockquote", "li"):
            self._flush()
        elif tag in ("strong", "b") and self._block != "pre":
            self._buf.append("**")
        elif tag in ("em", "i") and self._block != "pre":
            self._buf.append("*")
        elif tag == "code" and self._block != "pre":
            self._buf.append("`")
        elif tag == "a":
            self._buf.append(f"]({self._href or ''})"); self._href = None

    def handle_data(self, data):
        if self._in_title_h1:
            self.title += data
        elif self._in_subtitle:
            self.subtitle += data.strip() + " "
        elif self._in_body and self._block:
            self._buf.append(data)


def convert(path):
    html = open(path, encoding="utf-8").read()
    p = MediumParser()
    p.feed(html)
    # tidy blocks: drop leading/trailing dividers, collapse blanks
    blocks = [b for b in p.blocks if b.strip()]
    while blocks and blocks[0] == "---":
        blocks.pop(0)
    while blocks and blocks[-1] == "---":
        blocks.pop()
    body = "\n\n".join(blocks) + "\n"

    title = p.title.strip()
    subtitle = re.sub(r"\s+", " ", p.subtitle).strip()
    fm = ["---",
          f'title: "{title.replace(chr(34), "")}"']
    if subtitle:
        fm.append(f'subtitle: "{subtitle.replace(chr(34), "")}"')
    fm.append(f"tags: [{', '.join(pick_tags(title))}]")
    fm.append(f'canonical_url: "{canonical_url(path)}"')
    if p.cover_image:
        fm.append(f'cover_image: "{p.cover_image}"')
    fm.append("published: false")
    fm.append("---")
    return "\n".join(fm) + "\n\n" + body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("-o", "--out")
    ap.add_argument("--batch", action="store_true", help="input is a dir of *.html")
    args = ap.parse_args()

    if args.batch:
        outdir = args.out or "content"
        os.makedirs(outdir, exist_ok=True)
        files = sorted(f for f in os.listdir(args.input) if f.endswith(".html"))
        for f in files:
            md = convert(os.path.join(args.input, f))
            slug, _ = slug_and_id_from_filename(f)
            outp = os.path.join(outdir, slug + ".md")
            with open(outp, "w", encoding="utf-8") as fh:
                fh.write(md)
            print(f"  {f}\n    -> {outp}  ({len(md)} chars)")
        print(f"\n{len(files)} posts converted into {outdir}/")
    else:
        md = convert(args.input)
        if args.out:
            with open(args.out, "w", encoding="utf-8") as fh:
                fh.write(md)
            print(f"wrote {args.out} ({len(md)} chars)")
        else:
            sys.stdout.write(md)


if __name__ == "__main__":
    main()
