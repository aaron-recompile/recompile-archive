# _publish-lab — blog syndication pipeline (experimental, gitignored)

One Markdown file → dev.to (auto, API) + Medium (semi-auto, Import-a-story).
Primary target is **dev.to** (markdown-native, real API, dev audience).
Medium's write API is closed to us (no pre-2025 integration token), so Medium
is a downgraded syndication channel via its Import-by-URL tool.

## Files

- `medium_html_to_md.py` — convert a Medium data-export post (`posts/*.html`)
  into clean Markdown + frontmatter (title/subtitle/tags/canonical/cover).
- `publish.py` — publish a `.md` (or a whole dir) to dev.to. Tracks each
  piece's dev.to id in `_publish_state.json` (keyed by canonical_url), so
  re-runs UPDATE instead of creating duplicates.
- `content/` — the 19 back-catalog Medium articles, converted to `.md`.
- `_publish_state.json` — canonical_url → {devto_id, devto_url}. Do not delete;
  it's what prevents duplicate posts.

## Recover the back-catalog (already done once)

Medium → Settings → Security and apps → "Download your information" → unzip.

```bash
python3 medium_html_to_md.py --batch <export>/posts -o content
```

## Publish

```bash
export DEVTO_API_KEY=xxxx            # dev.to → Settings → Extensions

python3 publish.py content --dry-run                    # preview all
python3 publish.py content --platform devto --draft     # push all as DRAFTS
python3 publish.py content --platform devto --publish   # flip all to LIVE
python3 publish.py content/one.md --platform devto      # single file
```

`--publish`/`--draft` override the `published:` frontmatter. Re-running after
editing a `.md` updates the same dev.to article (via the state file).

## New article going forward

Write `content/my-post.md` with frontmatter, then
`python3 publish.py content/my-post.md --platform devto --publish`.

Dedup is **stateless**: publish.py asks dev.to `me/all` for existing articles
and matches on `canonical_url`, so re-running updates in place — never dupes.
(`_publish_state.json` is just a local cache; it's gitignored and not needed.)

## CI/CD (GitHub Action)

`.github/workflows/publish.yml`: on push to `main` touching
`_publish-lab/content/**.md`, it publishes **only the changed files** to dev.to
(`--publish`). Manual `workflow_dispatch` with `all=true` republishes everything.

Setup (one-time):
1. GitHub repo → Settings → Secrets and variables → Actions → New secret
   `DEVTO_API_KEY` = your dev.to key.
2. Commit + push `_publish-lab/` (pipeline + content) and `.github/workflows/`.
   Secrets/cache/raw export stay gitignored.

Then: edit or add `content/*.md`, `git push` → it's live on dev.to.

## Hashnode (second auto-target)

1. Sign up at hashnode.com, create a publication (you get `you.hashnode.dev`).
2. Token: hashnode.com/settings/developer → generate a Personal Access Token.
3. Publication id: run the query in `hashnode_publication_id.gql` notes below,
   or `python3 publish.py --help`. Quick way — POST to https://gql.hashnode.com/
   with `{ me { publications(first:5){edges{node{id title}}} } }`.
4. Publish:
   ```bash
   export HASHNODE_TOKEN=xxxx
   export HASHNODE_PUBLICATION_ID=xxxx
   python3 publish.py content --platform hashnode --publish   # or --draft
   ```
   `originalArticleURL` is set to the Medium canonical automatically.

## Archive DB ingest (roadmap step 3)

`api/ingest_content.py` loads each `content/*.md` body into `Article.content`
(new Text column), matching by Medium post id. Foundation for pgvector RAG.

```bash
docker compose up -d db backend
docker compose exec backend python ingest_content.py --dry-run   # preview
docker compose exec backend python ingest_content.py             # write
```

## Notes

- Images (incl. Medium "tables" that are actually PNGs) are hotlinked from
  Medium's CDN; dev.to side-loads them on publish.
- Medium route: host the piece publicly (archive page), then Medium → Stories →
  "Import a story" → paste URL (auto-sets canonical, preserves formatting).
- TODO: wrap `publish.py` in a GitHub Action (key in Secrets) for git-push CI/CD;
  add Hashnode (`publishPost` GraphQL); wire `content/` into the archive DB.
