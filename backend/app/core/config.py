"""Application settings module.

Re-exports Settings and settings instance from app.config.
"""
from app.config import Settings, settings

__all__ = ["Settings", "settings"]
