"""Single-use session-bound OAuth PKCE transactions."""
from alembic import op
import sqlalchemy as sa
revision = "f6a1b2c3d4e5"
down_revision = "e5f6a1b2c3d4"
branch_labels = depends_on = None


def upgrade():
    if "oauth_transactions" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table("oauth_transactions",
        sa.Column("state_hash", sa.String(), primary_key=True),
        sa.Column("session_id", sa.String(), sa.ForeignKey("auth_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(), nullable=False),
        sa.Column("verifier", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("oauth_transactions")
