"""Recompile Archive — MCP server (v1, offline / local DB).

Exposes Aaron's writing archive as MCP tools so a local Claude (Claude Code,
Claude Desktop, …) can query it directly instead of guessing. Every tool
returns real rows from the Postgres DB — including the source URL — so the
calling model stays grounded and can cite exact links instead of hallucinating.

This v1 talks straight to the local Postgres started by docker-compose
(`localhost:5432`). No internet needed except the LLM client itself.

Run (stdio transport):
    RECOMPILE_DATABASE_URL=postgresql://postgres:password@localhost:5432/recompile \
        python server.py

Tools: list_series, list_articles, get_article, search.
"""

import json
import os
import re

import psycopg
import yaml
from psycopg.rows import dict_row
from mcp.server.fastmcp import FastMCP

DATABASE_URL = os.environ.get(
    "RECOMPILE_DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/recompile",
)

# Canonical CV-grade artifacts manifest (positioning, repos, papers, grants,
# roles, …) — the breadth the article DB doesn't hold. Single source of truth,
# read live so editing the YAML is enough; nothing is duplicated into the DB.
ARTIFACTS_YAML = os.environ.get(
    "RECOMPILE_ARTIFACTS_YAML",
    "/Volumes/MAC_Programs/grants_26_summer/artifacts.yaml",
)

mcp = FastMCP("recompile-archive")


def _q(sql: str, params: tuple = ()) -> list[dict]:
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchall()


@mcp.tool()
def list_series() -> list[dict]:
    """List every series in the archive with its article count.

    Returns id, name, slug, description and article_count for each series.
    """
    return _q(
        """
        SELECT s.id, s.name, s.slug, s.description, count(a.id) AS article_count
        FROM series s LEFT JOIN articles a ON a.series_id = s.id
        GROUP BY s.id ORDER BY s.name
        """
    )


@mcp.tool()
def list_articles(series_slug: str | None = None) -> list[dict]:
    """List articles, optionally restricted to one series by its slug.

    Each row has id, title, subtitle, url, published_at, position and series.
    Pass series_slug (e.g. "delving-bitcoin") to filter; omit it for everything.
    """
    base = (
        "SELECT a.id, a.title, a.subtitle, a.url, a.published_at::text AS published_at, "
        "a.position, s.name AS series, s.slug AS series_slug "
        "FROM articles a LEFT JOIN series s ON a.series_id = s.id "
    )
    if series_slug:
        return _q(
            base
            + "WHERE s.slug = %s ORDER BY a.position NULLS LAST, a.published_at DESC",
            (series_slug,),
        )
    return _q(base + "ORDER BY a.published_at DESC NULLS LAST")


@mcp.tool()
def get_article(article_id: int) -> dict | None:
    """Fetch a single article by id (with its series). Returns None if missing."""
    rows = _q(
        "SELECT a.id, a.title, a.subtitle, a.url, a.published_at::text AS published_at, "
        "a.position, s.name AS series, s.slug AS series_slug "
        "FROM articles a LEFT JOIN series s ON a.series_id = s.id WHERE a.id = %s",
        (article_id,),
    )
    return rows[0] if rows else None


@mcp.tool()
def search(query: str, limit: int = 10) -> list[dict]:
    """Keyword search across article titles, subtitles and series names.

    Splits the query into terms and ranks articles by how many term hits they
    have. Returns only real archive entries (with their source URL), so the
    caller can cite exact links rather than inventing them. Use this to answer
    "what have I written about X?" type questions.
    """
    rows = _q(
        "SELECT a.id, a.title, a.subtitle, a.url, a.published_at::text AS published_at, "
        "s.name AS series FROM articles a LEFT JOIN series s ON a.series_id = s.id"
    )
    terms = [t for t in re.split(r"\s+", query.lower()) if t]
    if not terms:
        return []
    scored = []
    for r in rows:
        hay = " ".join(
            str(r.get(k) or "") for k in ("title", "subtitle", "series")
        ).lower()
        score = sum(hay.count(t) for t in terms)
        if score:
            scored.append((score, r))
    scored.sort(key=lambda x: -x[0])
    return [r for _, r in scored[:limit]]


@mcp.tool()
def get_profile() -> dict:
    """Aaron's full artifacts manifest — the CV-grade inventory beyond the article archive.

    Returns positioning, repos, packages, books, papers, protocol contributions,
    grants/roles (e.g. OpenSats, Chaincode Labs), platforms and notable
    interactions — all from the canonical artifacts.yaml. Use this (together with
    the article tools) to write a complete bio or to answer "what has Aaron
    built / published / contributed", not just "what has Aaron written".
    """
    try:
        with open(ARTIFACTS_YAML) as f:
            data = yaml.safe_load(f)
    except FileNotFoundError:
        return {"error": f"artifacts manifest not found at {ARTIFACTS_YAML}"}
    # Coerce dates etc. to JSON-safe primitives.
    return json.loads(json.dumps(data, default=str))


if __name__ == "__main__":
    mcp.run()
