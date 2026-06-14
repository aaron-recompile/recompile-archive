import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, get_db
from models import Article, Base, Series
from schemas import (
    ArticleCreate,
    ArticleResponse,
    ArticleUpdate,
    ArticleWithSeries,
    SeriesCreate,
    SeriesResponse,
    SeriesUpdate,
    SeriesWithArticles,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Recompile Archive API", version="1.0.0")

# Comma-separated origins from env, defaulting to local dev only.
# In production set CORS_ALLOWED_ORIGINS to include the deployed frontend URL,
# e.g. "https://archive.bitcoincoding.dev,http://localhost:3000"
_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"name": "Recompile Archive API", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- Series ----------

@app.get("/series", response_model=list[SeriesResponse])
def list_series(db: Session = Depends(get_db)):
    return db.query(Series).order_by(Series.name).all()


@app.get("/series/{series_id}", response_model=SeriesWithArticles)
def get_series(series_id: int, db: Session = Depends(get_db)):
    series = db.query(Series).filter(Series.id == series_id).first()
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found")
    return series


@app.post("/series", response_model=SeriesResponse, status_code=201)
def create_series(data: SeriesCreate, db: Session = Depends(get_db)):
    if db.query(Series).filter(Series.slug == data.slug).first():
        raise HTTPException(status_code=409, detail="Slug already exists")
    series = Series(**data.model_dump())
    db.add(series)
    db.commit()
    db.refresh(series)
    return series


@app.put("/series/{series_id}", response_model=SeriesResponse)
def update_series(series_id: int, data: SeriesUpdate, db: Session = Depends(get_db)):
    series = db.query(Series).filter(Series.id == series_id).first()
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(series, field, value)
    db.commit()
    db.refresh(series)
    return series


@app.delete("/series/{series_id}")
def delete_series(series_id: int, db: Session = Depends(get_db)):
    series = db.query(Series).filter(Series.id == series_id).first()
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found")
    db.delete(series)
    db.commit()
    return {"message": "Series deleted", "id": series_id}


# ---------- Articles ----------

@app.get("/articles", response_model=list[ArticleResponse])
def list_articles(
    series_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Article)
    if series_id is not None:
        query = query.filter(Article.series_id == series_id)
    return query.order_by(Article.published_at.desc().nullslast()).all()


@app.get("/articles/{article_id}", response_model=ArticleWithSeries)
def get_article(article_id: int, db: Session = Depends(get_db)):
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@app.post("/articles", response_model=ArticleResponse, status_code=201)
def create_article(data: ArticleCreate, db: Session = Depends(get_db)):
    if data.series_id is not None:
        if db.query(Series).filter(Series.id == data.series_id).first() is None:
            raise HTTPException(status_code=400, detail="Referenced series does not exist")
    article = Article(**data.model_dump())
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@app.put("/articles/{article_id}", response_model=ArticleResponse)
def update_article(article_id: int, data: ArticleUpdate, db: Session = Depends(get_db)):
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    payload = data.model_dump(exclude_unset=True)
    if "series_id" in payload and payload["series_id"] is not None:
        if db.query(Series).filter(Series.id == payload["series_id"]).first() is None:
            raise HTTPException(status_code=400, detail="Referenced series does not exist")

    for field, value in payload.items():
        setattr(article, field, value)
    db.commit()
    db.refresh(article)
    return article


@app.delete("/articles/{article_id}")
def delete_article(article_id: int, db: Session = Depends(get_db)):
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    db.delete(article)
    db.commit()
    return {"message": "Article deleted", "id": article_id}


# ======================================================================
# AI endpoints
# ======================================================================

import json
import anthropic
from pydantic import BaseModel

# Anthropic client — reads ANTHROPIC_API_KEY from environment (loaded by load_dotenv in database.py).
# Haiku 4.5 chosen for cost: ~$1/M input + $5/M output, ~3x cheaper than Sonnet for this workload.
ai_client = anthropic.Anthropic()
AI_MODEL = "claude-haiku-4-5"


def _extract_json(text: str) -> dict:
    """Best-effort JSON extraction from a model response that may include
    prose before/after the JSON object."""
    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end <= start:
        raise ValueError(f"No JSON object found in response: {text[:200]}")
    return json.loads(text[start:end])


# ---------- /ai/search — semantic search over articles ----------

class SearchRequest(BaseModel):
    query: str
    limit: int = 5


class SearchMatch(BaseModel):
    article_id: int
    title: str
    relevance: str  # "high" | "medium" | "low"
    why_relevant: str


class SearchResponse(BaseModel):
    query: str
    matches: list[SearchMatch]
    summary: str


@app.post("/ai/search", response_model=SearchResponse)
def ai_search(req: SearchRequest, db: Session = Depends(get_db)):
    """AI-powered natural-language search across the article archive.

    Approach: LLM-with-context. We list all articles (id, title, subtitle,
    series) in the system prompt; the model returns ranked matches with
    reasoning. No embeddings/RAG yet — fine for archives at this scale
    (tens of articles); pgvector would be the next step.
    """
    articles = db.query(Article).all()
    if not articles:
        return SearchResponse(
            query=req.query, matches=[], summary="The archive is empty."
        )

    article_lines = []
    for a in articles:
        series_name = a.series.name if a.series else "unsorted"
        line = f"[{a.id}] {a.title}"
        if a.subtitle:
            line += f" — {a.subtitle}"
        line += f" (series: {series_name})"
        article_lines.append(line)
    article_list = "\n".join(article_lines)

    system = (
        "You are a search assistant for a personal Bitcoin technical writing archive. "
        "Given a user query and a list of articles (with title, subtitle, series), "
        "find the top matches and explain WHY each one is relevant. "
        "Output STRICT JSON only (no prose around it) in this exact shape:\n"
        '{"matches": [{"article_id": <int>, "title": <str>, '
        '"relevance": "high"|"medium"|"low", "why_relevant": <str>}], '
        '"summary": <str>}\n'
        f"Return at most {req.limit} matches, sorted by relevance descending. "
        "Only include articles that are genuinely relevant. If nothing matches, "
        "return an empty matches list and explain why in summary."
    )

    response = ai_client.messages.create(
        model=AI_MODEL,
        max_tokens=1024,
        system=system,
        messages=[
            {"role": "user", "content": f"Query: {req.query}\n\nArticles:\n{article_list}"}
        ],
    )

    try:
        data = _extract_json(response.content[0].text)
        return SearchResponse(query=req.query, **data)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI returned malformed response: {e}",
        )


# ---------- /ai/summarize — generate a summary + key concepts ----------

class SummarizeRequest(BaseModel):
    article_id: int


class SummarizeResponse(BaseModel):
    article_id: int
    title: str
    summary: str
    key_concepts: list[str]


@app.post("/ai/summarize", response_model=SummarizeResponse)
def ai_summarize(req: SummarizeRequest, db: Session = Depends(get_db)):
    """Generate a 150-200 word summary + 3-5 key technical concepts for an
    article, based on its title, subtitle, and series context.

    Note: we don't store article body text in the DB (just metadata + URL),
    so the model expands from title/subtitle signaling. Future work: fetch
    the URL contents for richer summaries.
    """
    article = db.query(Article).filter(Article.id == req.article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    series_context = ""
    if article.series:
        series_context = (
            f"\n\nIt belongs to the series '{article.series.name}': "
            f"{article.series.description or '(no description)'}"
        )

    system = (
        "You are a technical writing summarizer for Bitcoin protocol articles. "
        "Given an article's title, subtitle, and series context, write a "
        "150-200 word expanded summary of what the article likely covers "
        "(based on the title/subtitle signaling), then extract 3-5 key "
        "technical concepts as short tags (e.g. 'Taproot', 'control block', "
        "'P2SH', 'CSV timelock').\n"
        "Output STRICT JSON only:\n"
        '{"summary": <str>, "key_concepts": [<str>, ...]}'
    )

    user_msg = (
        f"Title: {article.title}\n"
        f"Subtitle: {article.subtitle or '(none)'}"
        + series_context
    )

    response = ai_client.messages.create(
        model=AI_MODEL,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )

    try:
        data = _extract_json(response.content[0].text)
        return SummarizeResponse(
            article_id=article.id,
            title=article.title,
            summary=data["summary"],
            key_concepts=data["key_concepts"],
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI returned malformed response: {e}",
        )


# ---------- /ai/classify — suggest which series a new article belongs to ----------

class ClassifyRequest(BaseModel):
    title: str
    subtitle: str | None = None


class ClassifyAlternative(BaseModel):
    series_id: int
    series_name: str


class ClassifyResponse(BaseModel):
    suggested_series_id: int | None
    suggested_series_name: str
    confidence: str  # "high" | "medium" | "low" | "no_match"
    reasoning: str
    alternatives: list[ClassifyAlternative]


@app.post("/ai/classify", response_model=ClassifyResponse)
def ai_classify(req: ClassifyRequest, db: Session = Depends(get_db)):
    """Given a candidate new article's title/subtitle, suggest which existing
    series it best fits into, with reasoning + alternative suggestions.
    """
    series_list = db.query(Series).all()
    if not series_list:
        return ClassifyResponse(
            suggested_series_id=None,
            suggested_series_name="(no series exist yet)",
            confidence="no_match",
            reasoning="No series have been created in the archive yet. "
                      "Create a series first before classifying articles.",
            alternatives=[],
        )

    series_context = "\n".join(
        f"[{s.id}] {s.name}: {s.description or '(no description)'}"
        for s in series_list
    )

    system = (
        "You are a content classifier for a Bitcoin technical writing archive. "
        "Given a candidate article's title and subtitle, decide which existing "
        "series it best fits into. Consider topic alignment with each series "
        "description. If a strong fit exists, set confidence='high'. If multiple "
        "series could fit, set 'medium' and list them in alternatives. If nothing "
        "really fits, set confidence='no_match'.\n"
        "Output STRICT JSON only:\n"
        '{"suggested_series_id": <int or null>, '
        '"suggested_series_name": <str>, '
        '"confidence": "high"|"medium"|"low"|"no_match", '
        '"reasoning": <str>, '
        '"alternatives": [{"series_id": <int>, "series_name": <str>}]}'
    )

    user_msg = (
        f"Candidate article:\n"
        f"  Title: {req.title}\n"
        f"  Subtitle: {req.subtitle or '(none)'}\n\n"
        f"Existing series:\n{series_context}"
    )

    response = ai_client.messages.create(
        model=AI_MODEL,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )

    try:
        data = _extract_json(response.content[0].text)
        return ClassifyResponse(**data)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI returned malformed response: {e}",
        )


# ---------- /ai/agent — tool-using agent over Article + Series ----------

from agent import run_agent


class AgentRequest(BaseModel):
    message: str


@app.post("/ai/agent")
def ai_agent(req: AgentRequest, db: Session = Depends(get_db)):
    """Natural-language agent that can read, create, and update articles
    and series via tool use. Returns the model's final reply, the full
    agent_steps log, and the iteration count.

    See agent.py for tool schemas, tool functions, and the run_agent loop.
    """
    return run_agent(req.message, db)
