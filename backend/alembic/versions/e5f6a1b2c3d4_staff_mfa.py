"""Staff MFA and active-account enforcement."""
from alembic import op
import sqlalchemy as sa
revision = "e5f6a1b2c3d4"
down_revision = "d4e5f6a1b2c3"
branch_labels = depends_on = None


def upgrade():
    additions = {
        "users": [sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
                  sa.Column("mfa_secret", sa.Text()),
                  sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
                  sa.Column("mfa_last_counter", sa.Integer(), nullable=False, server_default="-1"),
                  sa.Column("mfa_recovery_hashes", sa.JSON()),
                  sa.Column("mfa_failed_attempts", sa.Integer(), nullable=False, server_default="0"),
                  sa.Column("mfa_locked_until", sa.DateTime(timezone=True))],
        "auth_sessions": [sa.Column("mfa_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
                          sa.Column("mfa_deadline", sa.DateTime(timezone=True))]}
    inspector = sa.inspect(op.get_bind())
    for table, columns in additions.items():
        existing = {col["name"] for col in inspector.get_columns(table)}
        for column in columns:
            if column.name not in existing:
                op.add_column(table, column)
    # Existing staff sessions must reauthenticate with a new challenge deadline.
    op.execute("UPDATE auth_sessions SET revoked = true")


def downgrade():
    for column in ("mfa_deadline", "mfa_verified"):
        op.drop_column("auth_sessions", column)
    for column in ("mfa_locked_until", "mfa_failed_attempts", "mfa_recovery_hashes", "mfa_last_counter", "mfa_enabled", "mfa_secret", "is_active"):
        op.drop_column("users", column)
