from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


# ---- Series ----

class SeriesCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    description: Optional[str] = None


class SeriesUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None


class SeriesResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str]

    model_config = {"from_attributes": True}


# ---- Article ----

class ArticleCreate(BaseModel):
    title: str = Field(min_length=1)
    subtitle: Optional[str] = None
    published_at: Optional[date] = None
    url: Optional[str] = None
    position: Optional[int] = None
    series_id: Optional[int] = None


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    published_at: Optional[date] = None
    url: Optional[str] = None
    position: Optional[int] = None
    series_id: Optional[int] = None


class ArticleResponse(BaseModel):
    id: int
    title: str
    subtitle: Optional[str]
    published_at: Optional[date]
    url: Optional[str]
    position: Optional[int]
    series_id: Optional[int]

    model_config = {"from_attributes": True}


# ---- Nested (relationship) ----

class SeriesWithArticles(SeriesResponse):
    articles: list[ArticleResponse]


class ArticleWithSeries(ArticleResponse):
    series: Optional[SeriesResponse]
