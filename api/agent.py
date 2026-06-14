"""
Tool-using agent that manages the Recompile Archive
through natural language. Standard Anthropic tool-use loop —
6 tools operate on Series and Article models.

6 tools:
  list_articles, get_article, list_series, get_series,
  create_article, update_article
"""

import json
from typing import Any, Optional

import anthropic
from sqlalchemy.orm import Session

from models import Article, Series


ai_client = anthropic.Anthropic()
AGENT_MODEL = "claude-haiku-4-5"
MAX_ITERATIONS = 10


SYSTEM_PROMPT = """You are an agent for managing a Bitcoin technical writing archive.

The archive has two tables: Series (collections like "Not Just HODLing — Real Bitcoin Script Engineering") and Article (with title, subtitle, published_at, url, position, series_id).

Workflow rules:
- When the user refers to an article or series by name, call list_articles or list_series FIRST to look up the id before calling update_article.
- When creating an article, if the user mentions a series by name, look up its id with list_series before calling create_article.
- After tool calls complete, give a concise natural-language summary of what you did and any answer the user asked for.
- Don't fabricate ids, titles, slugs, or URLs. Look things up first.
- For "find articles about X" queries: use list_articles, scan the titles/subtitles, and pick the most relevant. Explain WHY each pick is relevant."""


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def _article_to_dict(a: Article) -> dict:
    return {
        "id": a.id,
        "title": a.title,
        "subtitle": a.subtitle,
        "published_at": str(a.published_at) if a.published_at else None,
        "url": a.url,
        "position": a.position,
        "series_id": a.series_id,
        "series_name": a.series.name if a.series else None,
    }


def _series_to_dict(s: Series) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "slug": s.slug,
        "description": s.description,
        "article_count": len(s.articles) if s.articles else 0,
    }


# ----------------------------------------------------------------------
# Tool schemas (Claude reads these to decide when to use which tool)
# ----------------------------------------------------------------------

TOOLS: list[dict] = [
    {
        "name": "list_articles",
        "description": (
            "List all articles in the archive, optionally filtered by series_id. "
            "Returns each article's id, title, subtitle, url, position, series_id, "
            "and series_name. Use this to find articles by topic, scan the archive, "
            "or look up an article's id by title before calling update_article."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "series_id": {
                    "type": "integer",
                    "description": "Optional: only return articles in this series.",
                }
            },
            "required": [],
        },
    },
    {
        "name": "get_article",
        "description": (
            "Get full details of a single article by id. Use this when you already "
            "have an id and need to confirm the article's current state before "
            "modifying it."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "article_id": {"type": "integer", "description": "The article's id."}
            },
            "required": ["article_id"],
        },
    },
    {
        "name": "list_series",
        "description": (
            "List all series (article collections) in the archive. Returns each "
            "series's id, name, slug, description, and article_count. Use this to "
            "suggest which series a new article should belong to, or to scan the "
            "overall structure of the archive."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_series",
        "description": (
            "Get full details of a single series by id, including all articles "
            "in it. Use this to inspect the contents of one series."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "series_id": {"type": "integer", "description": "The series id."}
            },
            "required": ["series_id"],
        },
    },
    {
        "name": "create_article",
        "description": (
            "Create a new article in the archive. Title is required. The other "
            "fields (subtitle, published_at, url, position, series_id) are optional. "
            "If the user mentions a series by name, look up its id via list_series "
            "first; don't fabricate a series_id. "
            "published_at must be an ISO date string like '2025-06-29'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Article title."},
                "subtitle": {"type": "string", "description": "Optional one-line subtitle."},
                "published_at": {"type": "string", "description": "ISO date 'YYYY-MM-DD'."},
                "url": {"type": "string", "description": "External URL (e.g., Medium link)."},
                "position": {"type": "integer", "description": "Order within the series."},
                "series_id": {"type": "integer", "description": "Series id (look up via list_series)."},
            },
            "required": ["title"],
        },
    },
    {
        "name": "update_article",
        "description": (
            "Update fields of an existing article by id. Any subset of "
            "title/subtitle/published_at/url/position/series_id may be passed. "
            "If the user refers to the article by title, look up the id with "
            "list_articles first. Be careful: changing series_id moves the article."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "article_id": {"type": "integer", "description": "Article id to update."},
                "title": {"type": "string"},
                "subtitle": {"type": "string"},
                "published_at": {"type": "string", "description": "ISO date 'YYYY-MM-DD'."},
                "url": {"type": "string"},
                "position": {"type": "integer"},
                "series_id": {"type": "integer"},
            },
            "required": ["article_id"],
        },
    },
]


# ----------------------------------------------------------------------
# Tool functions (Option A — direct SQLAlchemy access)
# ----------------------------------------------------------------------

def list_articles_fn(db: Session, series_id: Optional[int] = None) -> list[dict]:
    q = db.query(Article)
    if series_id is not None:
        q = q.filter(Article.series_id == series_id)
    q = q.order_by(Article.published_at.desc().nullslast())
    return [_article_to_dict(a) for a in q.all()]


def get_article_fn(db: Session, article_id: int) -> dict:
    a = db.query(Article).filter(Article.id == article_id).first()
    if a is None:
        return {"error": f"No article with id {article_id}"}
    return _article_to_dict(a)


def list_series_fn(db: Session) -> list[dict]:
    return [_series_to_dict(s) for s in db.query(Series).order_by(Series.name).all()]


def get_series_fn(db: Session, series_id: int) -> dict:
    s = db.query(Series).filter(Series.id == series_id).first()
    if s is None:
        return {"error": f"No series with id {series_id}"}
    out = _series_to_dict(s)
    out["articles"] = [_article_to_dict(a) for a in s.articles]
    return out


def create_article_fn(
    db: Session,
    title: str,
    subtitle: Optional[str] = None,
    published_at: Optional[str] = None,
    url: Optional[str] = None,
    position: Optional[int] = None,
    series_id: Optional[int] = None,
) -> dict:
    from datetime import date as _date

    if series_id is not None:
        if db.query(Series).filter(Series.id == series_id).first() is None:
            return {"error": f"No series with id {series_id}"}

    parsed_date = None
    if published_at:
        try:
            parsed_date = _date.fromisoformat(published_at)
        except ValueError as e:
            return {"error": f"published_at must be 'YYYY-MM-DD': {e}"}

    a = Article(
        title=title,
        subtitle=subtitle,
        published_at=parsed_date,
        url=url,
        position=position,
        series_id=series_id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _article_to_dict(a)


def update_article_fn(db: Session, article_id: int, **fields) -> dict:
    from datetime import date as _date

    a = db.query(Article).filter(Article.id == article_id).first()
    if a is None:
        return {"error": f"No article with id {article_id}"}

    # Validate series_id if changing
    if "series_id" in fields and fields["series_id"] is not None:
        if db.query(Series).filter(Series.id == fields["series_id"]).first() is None:
            return {"error": f"Target series id {fields['series_id']} does not exist"}

    # Parse date if present
    if "published_at" in fields and fields["published_at"]:
        try:
            fields["published_at"] = _date.fromisoformat(fields["published_at"])
        except ValueError as e:
            return {"error": f"published_at must be 'YYYY-MM-DD': {e}"}

    for k, v in fields.items():
        if hasattr(a, k):
            setattr(a, k, v)

    db.commit()
    db.refresh(a)
    return _article_to_dict(a)


# ----------------------------------------------------------------------
# Agent loop
# ----------------------------------------------------------------------

def run_agent(user_message: str, db: Session) -> dict[str, Any]:
    """Run the tool-using agent loop. Returns response, agent_steps, iterations."""
    tool_functions = {
        "list_articles": lambda **kw: list_articles_fn(db, **kw),
        "get_article": lambda **kw: get_article_fn(db, **kw),
        "list_series": lambda **kw: list_series_fn(db, **kw),
        "get_series": lambda **kw: get_series_fn(db, **kw),
        "create_article": lambda **kw: create_article_fn(db, **kw),
        "update_article": lambda **kw: update_article_fn(db, **kw),
    }

    messages: list[dict] = [{"role": "user", "content": user_message}]
    agent_steps: list[dict] = []

    for iteration in range(MAX_ITERATIONS):
        response = ai_client.messages.create(
            model=AGENT_MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            final_text = "".join(
                b.text for b in response.content if b.type == "text"
            )
            return {
                "response": final_text,
                "agent_steps": agent_steps,
                "iterations": iteration + 1,
            }

        if response.stop_reason == "tool_use":
            messages.append(
                {
                    "role": "assistant",
                    "content": [b.model_dump() for b in response.content],
                }
            )

            tool_results: list[dict] = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                fn = tool_functions.get(block.name)
                if fn is None:
                    result = {"error": f"Unknown tool: {block.name}"}
                else:
                    try:
                        result = fn(**(block.input or {}))
                    except Exception as e:
                        result = {"error": f"{type(e).__name__}: {e}"}

                agent_steps.append(
                    {
                        "iteration": iteration,
                        "tool": block.name,
                        "input": block.input,
                        "result": result,
                    }
                )

                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result, default=str),
                    }
                )

            messages.append({"role": "user", "content": tool_results})
            continue

        return {
            "response": f"Agent stopped unexpectedly: {response.stop_reason}",
            "agent_steps": agent_steps,
            "iterations": iteration + 1,
        }

    return {
        "response": f"Agent exceeded max iterations ({MAX_ITERATIONS}).",
        "agent_steps": agent_steps,
        "iterations": MAX_ITERATIONS,
    }
