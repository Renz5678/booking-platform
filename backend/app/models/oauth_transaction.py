from sqlalchemy import Column, String, DateTime, ForeignKey
from app.db.base import Base


class OAuthTransaction(Base):
    __tablename__ = "oauth_transactions"
    state_hash = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("auth_sessions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    purpose = Column(String, nullable=False)
    verifier = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
