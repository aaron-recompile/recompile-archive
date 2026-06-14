from sqlalchemy import Column, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class Series(Base):
    __tablename__ = "series"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)

    articles = relationship(
        "Article",
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="Article.position.asc().nullslast(), Article.published_at.desc()",
    )


class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    subtitle = Column(Text, nullable=True)
    published_at = Column(Date, nullable=True)
    url = Column(String, nullable=True)
    position = Column(Integer, nullable=True)

    series_id = Column(Integer, ForeignKey("series.id"), nullable=True, index=True)
    series = relationship("Series", back_populates="articles")
