from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String, Text

from app.db.base import Base


class SiteContent(Base):
    """
    Stores dynamic site content manageable by admins.
    (e.g., motivational_quote, faq_entries, crisis_banner_text)
    """
    __tablename__ = "site_content"

    # The key acts as the unique identifier
    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    
    updated_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
