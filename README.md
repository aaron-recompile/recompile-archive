# Recompile Archive

A small AI-augmented archive for my long-form Bitcoin protocol writing — search, summarize, classify, and converse with my own articles through a tool-using agent.

**Live:** [archive.bitcoincoding.dev](https://archive.bitcoincoding.dev) *(deployment in progress)*
**Sister site:** [bitcoincoding.dev](https://bitcoincoding.dev) — *Mastering Taproot* interactive labs.

## What it does

A personal home for the long-form articles I publish on Medium under [@aaron.recompile](https://medium.com/@aaron.recompile) — series like *Not Just HODLing — Real Bitcoin Script Engineering* and *OP_\* on Signet — Bitcoin Inquisition*. The CRUD layer files articles under series; the AI layer makes the archive useful by letting me ask questions of my own writing in plain English.

Four AI features, all grounded in the database (not generic chat):

- **Search** — natural-language query → ranked articles with per-match `why_relevant` reasoning.
- **Summarize** — article id → 150–200 word summary + 3–5 key concepts.
- **Classify** — candidate title/subtitle → suggested series + confidence + alternatives.
- **Agent** — 6-tool agent loop (`list_articles`, `get_article`, `list_series`, `get_series`, `create_article`, `update_article`) for multi-step natural-language commands.

## Architecture

```
Next.js 16 (frontend)  ←→  FastAPI (backend)  ←→  Postgres 16
   /, /series, /articles,        15 endpoints:           Series ─┐ (1:N FK)
   /articles/new, /ai            10 CRUD + 4 AI                  └─→ Article
                                       │
                                       └─→  Claude (Haiku 4.5)
                                            via the Anthropic SDK
```

- **Two related models** with a real foreign key (`Article.series_id → Series.id`, cascade delete).
- **Grounding, not recall.** Every AI endpoint injects real DB content into the system prompt before each call. `/ai/search` lists every article (id + title + subtitle + series) inline; the model can only return article ids that actually exist.
- **Structured output.** Three of the four AI endpoints force a JSON Schema, so hallucinated response shapes are structurally impossible. The fourth (the agent) uses tool-use loops with the same grounding discipline.
- **Three Docker services** (`db`, `backend`, `frontend`) wired by one root `docker-compose.yml`. Postgres healthcheck gates backend startup.

## Run locally

```bash
git clone https://github.com/aaron-recompile/recompile-archive.git
cd recompile-archive

# Set your Anthropic API key (get one at https://console.anthropic.com)
cp .env.example .env
$EDITOR .env   # paste your ANTHROPIC_API_KEY

# Bring up the full stack
docker compose up --build

# One-time: seed the database
docker compose exec backend python seed.py
```

Then:
- Frontend → <http://localhost:3000>
- Backend → <http://localhost:8000> (Swagger at `/docs`)

## Notes on the agent

The agent loop itself is about 30 lines (`api/agent.py`). The real engineering is in the tool *descriptions* — single sentences like *"if the user refers to the article by title, look up the id with `list_articles` first; don't fabricate ids"* are what make the model safe instead of confident-but-wrong. The model's behavior is programmed in English, not Python. In the agent era, prompt engineering and software engineering converge at the tool description layer.

## What's next

- **pgvector** over actual article body text — currently grounded in title/subtitle metadata; the next step is to fetch the full Medium content, chunk and embed it, and let the agent cite specific passages.
- Same RAG pattern, retargeted at BIPs and academic Bitcoin papers — then the same engine becomes a daily-driver research tool, not just a personal archive.

## License

MIT. See [LICENSE](LICENSE).
