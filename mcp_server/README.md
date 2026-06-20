# Recompile Archive — MCP server (v1, offline)

Exposes Aaron's writing archive to a local Claude (Claude Code / Claude Desktop)
as MCP tools, so the model can query the real archive instead of guessing.
Every tool returns real DB rows **including the source URL**, so answers stay
grounded and citable — no hallucinated links.

**v1 is offline**: it talks straight to the local Postgres started by the
project's `docker-compose` (`localhost:5432`). The stack must be running
(`docker compose up`). No internet needed except the LLM client itself.

## Tools

| Tool | What it returns |
|---|---|
| `list_series()` | every series + article count |
| `list_articles(series_slug?)` | articles, optionally filtered to one series |
| `get_article(article_id)` | one article (with series) |
| `search(query, limit=10)` | keyword-ranked articles with URLs |
| `get_profile()` | the full CV-grade artifacts manifest (repos, packages, papers, contributions, grants/roles, platforms) read live from `artifacts.yaml` |

`list_*` / `get_article` / `search` cover Aaron's **writing**; `get_profile`
adds everything else (tooling, research, grants…) so a model can write a
*complete* bio. `get_profile` reads `RECOMPILE_ARTIFACTS_YAML` (defaults to
`/Volumes/MAC_Programs/grants_26_summer/artifacts.yaml`) — editing that file is
all it takes to update the manifest; nothing is duplicated into the DB.

## Setup

```bash
cd mcp_server
python3.11 -m venv .venv          # needs Python 3.10+
./.venv/bin/pip install -r requirements.txt
```

The DB connection defaults to the docker-compose Postgres
(`postgresql://postgres:password@localhost:5432/recompile`); override with the
`RECOMPILE_DATABASE_URL` env var if needed.

## Wire it into a local Claude

**Claude Code** — add to `.mcp.json` (or `claude mcp add`):

```json
{
  "mcpServers": {
    "recompile-archive": {
      "command": "/ABSOLUTE/PATH/recompile-archive/mcp_server/.venv/bin/python",
      "args": ["/ABSOLUTE/PATH/recompile-archive/mcp_server/server.py"]
    }
  }
}
```

**Claude Desktop** — same block in `claude_desktop_config.json`
(`~/Library/Application Support/Claude/`).

Then ask things like *"what have I written about Eltoo on signet? give links"* —
Claude calls `search` and answers from the real rows.

## Roadmap (not in v1)

- **pgvector full-text**: fetch article bodies, chunk + embed, so `search`
  matches paragraph-level content instead of just title/subtitle.
- **over-API variant**: point at the production API instead of the local DB so
  it works anywhere (the local DB is faster / offline; the API is portable).
- **write tools** (add/edit article) gated behind an admin token, mirroring the
  planned read-only / internal-write split on the web app.
