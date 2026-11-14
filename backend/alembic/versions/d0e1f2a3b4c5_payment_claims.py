"""Separate claims, verified money and idempotent requests."""
from alembic import op
import sqlalchemy as sa
revision = "d0e1f2a3b4c5"
down_revision = "c9d0e1f2a3b4"
branch_labels = depends_on = None


def upgrade():
    existing = sa.inspect(op.get_bind()).get_table_names()
    definitions = {
        "payment_claims": [sa.Column("id", sa.String(), primary_key=True), sa.Column("booking_id", sa.String(), nullable=False, index=True), sa.Column("reference", sa.String(64), nullable=False), sa.Column("status", sa.String(), nullable=False), sa.Column("reason", sa.String(500)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)],
        "verified_transfers": [sa.Column("id", sa.String(), primary_key=True), sa.Column("reference", sa.String(64), nullable=False, unique=True), sa.Column("claim_id", sa.String(), nullable=False, unique=True), sa.Column("amount", sa.Numeric(10,2), nullable=False), sa.Column("status", sa.String(), nullable=False), sa.Column("refund_reference", sa.String(64), unique=True), sa.Column("verified_by", sa.String(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)],
        "booking_requests": [sa.Column("key", sa.String(), primary_key=True), sa.Column("payload_hash", sa.String(), nullable=False), sa.Column("response", sa.JSON())],
    }
    for table, columns in definitions.items():
        if table not in existing:
            op.create_table(table, *columns)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email))")


def downgrade():
    raise RuntimeError("Restore a backup rather than removing money history")
