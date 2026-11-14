"""Add lease_token to outbox_jobs and ledger tracking to verified_transfers."""
from alembic import op
import sqlalchemy as sa

revision = "e1f2a3b4c5d6"
down_revision = "d0e1f2a3b4c5"
branch_labels = depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "outbox_jobs" in tables:
        outbox_cols = {c["name"] for c in inspector.get_columns("outbox_jobs")}
        if "lease_token" not in outbox_cols:
            op.add_column("outbox_jobs", sa.Column("lease_token", sa.String(), nullable=True))

    if "verified_transfers" in tables:
        transfer_cols = {c["name"] for c in inspector.get_columns("verified_transfers")}
        if "booking_id" not in transfer_cols:
            op.add_column("verified_transfers", sa.Column("booking_id", sa.String(), nullable=True))
            op.create_index("ix_verified_transfers_booking_id", "verified_transfers", ["booking_id"])
        if "refunded_at" not in transfer_cols:
            op.add_column("verified_transfers", sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True))
        if "refunded_by" not in transfer_cols:
            op.add_column("verified_transfers", sa.Column("refunded_by", sa.String(), nullable=True))


def downgrade():
    raise RuntimeError("Preserve operational and money history; restore a verified backup instead")
