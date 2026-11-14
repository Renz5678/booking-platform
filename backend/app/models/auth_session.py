from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey
from app.db.base import Base


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    mfa_verified = Column(Boolean, nullable=False, default=False)
    mfa_deadline = Column(DateTime(timezone=True), nullable=True)
    revoked = Column(Boolean, nullable=False, default=False)
