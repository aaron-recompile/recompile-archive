#!/usr/bin/env python3
"""
publish.py — experimental blog-syndication pipeline (test-the-water version).

One Markdown file (with YAML-ish frontmatter) -> a draft on dev.to via its
official API, plus the URL/steps to import the same piece into Medium.

Zero third-party deps — stdlib only. Frontmatter parser handles the small
subset we use (scalars + inline [list]); not a full YAML engine.

Usage:
  export DEVTO_API_KEY=xxxx           # from dev.to -> Settings -> Extensions
  python3 publish.py FILE.md --dry-run        # parse + preview, no network
  python3 publish.py FILE.md --platform devto # create a DRAFT on dev.to
  python3 publish.py FILE.md --platform devto --publish   # publish live

Notes:
  * `published:` in frontmatter is the default; --publish forces True,
    --draft forces False. Default here is DRAFT (safe).
  * dev.to: max 4 tags, lowercase alphanumeric — auto-sanitized.
"""
import argparse
import glob
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

STATE_FILE = "_publish_state.json"   # canonical_url -> {devto_id, devto_url}
DEVTO_HEADERS_BASE = {"Content-Type": "application/json",
                      "Accept": "application/vnd.forem.api-v1+json",
                      "User-Agent": "recompile-archive-publish/0.1"}


# ---------- frontmatter ----------

def split_frontmatter(text):
    """Return (meta: dict, body: str). Frontmatter is a leading --- ... --- block."""
    if not text.startswith("---"):
        return {}, text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.DOTALL)
    if not m:
        return {}, text
    raw, body = m.group(1), m.group(2)
    meta = {}
    for line in raw.splitlines():
        line = line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key, val = key.strip(), val.strip()
        # inline list  [a, b, c]
        if val.startswith("[") and val.endswith("]"):
            items = [x.strip().strip("'\"") for x in val[1:-1].split(",")]
            meta[key] = [x for x in items if x]
        else:
            v = val.strip().strip("'\"")
            if v.lower() in ("true", "false"):
                meta[key] = v.lower() == "true"
            else:
                meta[key] = v
    return meta, body.lstrip("\n")


def sanitize_devto_tags(tags):
    out = []
    for t in tags or []:
        clean = re.sub(r"[^a-z0-9]", "", str(t).lower())
        if clean:
            out.append(clean)
    return out[:4]


# ---------- dev.to ----------

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def _devto_key():
    key = os.environ.get("DEVTO_API_KEY")
    if not key:
        sys.exit("ERROR: set DEVTO_API_KEY (dev.to -> Settings -> Extensions -> DEV API Keys)")
    return key


def build_devto_payload(meta, body, publish):
    art = {
        "title": meta.get("title", "Untitled"),
        "published": publish,
        "body_markdown": body,
        "tags": sanitize_devto_tags(meta.get("tags")),
    }
    if meta.get("canonical_url"):
        art["canonical_url"] = meta["canonical_url"]
    if meta.get("subtitle"):
        art["description"] = meta["subtitle"]
    if meta.get("cover_image"):
        art["main_image"] = meta["cover_image"]
    return {"article": art}


def _devto_request(url, payload, method):
    key = _devto_key()
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={**DEVTO_HEADERS_BASE, "api-key": key},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"dev.to API error {e.code}: {e.read().decode()}")


def fetch_devto_index():
    """Ask dev.to for all my articles -> {canonical_url: id}. Makes dedup
    stateless (CI-friendly): the platform itself is the source of truth."""
    key = _devto_key()
    index, page = {}, 1
    while True:
        req = urllib.request.Request(
            f"https://dev.to/api/articles/me/all?per_page=100&page={page}",
            headers={**DEVTO_HEADERS_BASE, "api-key": key})
        try:
            with urllib.request.urlopen(req) as r:
                batch = json.loads(r.read())
        except urllib.error.HTTPError as e:
            sys.exit(f"dev.to API error {e.code}: {e.read().decode()}")
        if not batch:
            break
        for a in batch:
            if a.get("canonical_url"):
                index[a["canonical_url"]] = a["id"]
        if len(batch) < 100:
            break
        page += 1
    return index


def post_to_devto(meta, body, publish, remote_index=None, state=None):
    """Create or (if the canonical already exists) update a dev.to article.
    Dedup priority: remote_index (live from dev.to) > local state cache."""
    payload = build_devto_payload(meta, body, publish)
    canon = meta.get("canonical_url")
    state = load_state() if state is None else state

    existing_id = None
    if canon and remote_index and canon in remote_index:
        existing_id = remote_index[canon]
    elif canon and state.get(canon):
        existing_id = state[canon].get("devto_id")

    if existing_id:
        data = _devto_request(f"https://dev.to/api/articles/{existing_id}", payload, "PUT")
        action = "UPDATED"
    else:
        data = _devto_request("https://dev.to/api/articles", payload, "POST")
        action = "CREATED"

    if canon:
        state[canon] = {"devto_id": data.get("id"), "devto_url": data.get("url")}
        save_state(state)

    st = "PUBLISHED" if publish else "DRAFT"
    print(f"  dev.to {action} [{st}]  id={data.get('id')}  {data.get('url')}")
    return data


# ---------- Hashnode (GraphQL) ----------

HASHNODE_GQL = "https://gql.hashnode.com/"


def _hashnode_gql(query, variables):
    token = os.environ.get("HASHNODE_TOKEN")
    if not token:
        sys.exit("ERROR: set HASHNODE_TOKEN (hashnode.com/settings/developer)")
    req = urllib.request.Request(
        HASHNODE_GQL,
        data=json.dumps({"query": query, "variables": variables}).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": token,
                 "User-Agent": "recompile-archive-publish/0.1"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            out = json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"hashnode API error {e.code}: {e.read().decode()}")
    if out.get("errors"):
        sys.exit(f"hashnode GraphQL error: {json.dumps(out['errors'])}")
    return out["data"]


def post_to_hashnode(meta, body, publish):
    """Publish a post to Hashnode. Needs HASHNODE_TOKEN + HASHNODE_PUBLICATION_ID.
    Hashnode has no draft-by-api toggle as clean as dev.to; we use publishPost
    (live) or createDraft depending on `publish`."""
    pub_id = os.environ.get("HASHNODE_PUBLICATION_ID")
    if not pub_id:
        sys.exit("ERROR: set HASHNODE_PUBLICATION_ID (see README: query publications)")

    tags = [{"slug": t, "name": t} for t in sanitize_devto_tags(meta.get("tags"))]
    inp = {
        "title": meta.get("title", "Untitled"),
        "contentMarkdown": body,
        "tags": tags,
        "publicationId": pub_id,
    }
    if meta.get("canonical_url"):
        inp["originalArticleURL"] = meta["canonical_url"]
    if meta.get("cover_image"):
        inp["coverImageOptions"] = {"coverImageURL": meta["cover_image"]}

    if publish:
        q = ("mutation Publish($input: PublishPostInput!){"
             "publishPost(input:$input){post{id url}}}")
        data = _hashnode_gql(q, {"input": inp})
        post = data["publishPost"]["post"]
        print(f"  hashnode PUBLISHED  id={post['id']}  {post['url']}")
    else:
        q = ("mutation Draft($input: CreateDraftInput!){"
             "createDraft(input:$input){draft{id}}}")
        data = _hashnode_gql(q, {"input": inp})
        print(f"  hashnode DRAFT created  id={data['createDraft']['draft']['id']}")
    return data


def medium_import_hint(meta):
    print("\n  Medium (semi-auto, no API token needed):")
    print("    1. Publish/host this piece at a public URL (your archive page).")
    print("    2. Go to Medium -> your avatar -> Stories -> 'Import a story'.")
    print("    3. Paste that public URL -> Import. Medium fetches the RENDERED")
    print("       page (tables + code + ASCII survive) and auto-sets canonical.")
    print("    4. Review the draft, then Publish.")
    cu = meta.get("canonical_url")
    if cu:
        print(f"    (canonical for this piece: {cu})")


# ---------- main ----------

def resolve_publish(meta, args):
    if args.publish:
        return True
    if args.draft:
        return False
    return bool(meta.get("published", False))


def process_one(path, args, state, remote_index):
    with open(path, encoding="utf-8") as f:
        meta, body = split_frontmatter(f.read())
    publish = resolve_publish(meta, args)

    if args.dry_run or not args.platform:
        print(f"- {meta.get('title')!r}")
        print(f"    tags={sanitize_devto_tags(meta.get('tags'))}  "
              f"canonical={meta.get('canonical_url')}  "
              f"publish={publish}  body={len(body)}ch")
        return
    if args.platform == "devto":
        post_to_devto(meta, body, publish, remote_index, state)
    elif args.platform == "hashnode":
        post_to_hashnode(meta, body, publish)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="+", help=".md file(s) and/or directories of .md")
    ap.add_argument("--platform", choices=["devto", "hashnode"], help="where to post")
    ap.add_argument("--dry-run", action="store_true", help="parse + preview only")
    ap.add_argument("--publish", action="store_true", help="publish live (default: draft)")
    ap.add_argument("--draft", action="store_true", help="force draft")
    args = ap.parse_args()

    files = []
    for p in args.path:
        if os.path.isdir(p):
            files.extend(sorted(glob.glob(os.path.join(p, "*.md"))))
        elif p.endswith(".md") and os.path.exists(p):
            files.append(p)
    files = sorted(dict.fromkeys(files))   # dedupe, stable
    if not files:
        print("no .md files to process."); return

    print("=" * 64)
    print(f"  {len(files)} file(s)  platform={args.platform or '(preview)'}  "
          f"mode={'LIVE' if args.publish else 'draft'}")
    print("=" * 64)

    # stateless dedup: ask dev.to what already exists (CI-safe, no state file needed)
    remote_index = None
    if args.platform == "devto" and not args.dry_run:
        remote_index = fetch_devto_index()
        print(f"  (dev.to index: {len(remote_index)} existing articles)")

    state = load_state()
    for i, path in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] {os.path.basename(path)}")
        process_one(path, args, state, remote_index)
        if args.platform and not args.dry_run and i < len(files):
            time.sleep(1.0)   # be gentle with rate limits

    if len(files) == 1 and (args.dry_run or not args.platform):
        with open(files[0], encoding="utf-8") as f:
            meta, _ = split_frontmatter(f.read())
        medium_import_hint(meta)


if __name__ == "__main__":
    main()
