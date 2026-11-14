"""Persist revocable rotating authentication sessions."""
from alembic import op
import sqlalchemy as sa
revision = "d4e5f6a1b2c3"
down_revision = "c3d4e5f6a1b2"
branch_labels = None
depends_on = None


def upgrade():
    if "auth_sessions" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table("auth_sessions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("refresh_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])


def downgrade():
    op.drop_table("auth_sessions")
