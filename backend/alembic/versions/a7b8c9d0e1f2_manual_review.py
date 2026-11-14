"""Manual GCash review and real refund references."""
from alembic import op
import sqlalchemy as sa
revision = "a7b8c9d0e1f2"
down_revision = "f6a1b2c3d4e5"
branch_labels = depends_on = None


def upgrade():
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("payments")}
    for name, kind in [("transaction_reference", sa.String(64)), ("submitted_at", sa.DateTime(timezone=True)),
                       ("review_deadline", sa.DateTime(timezone=True)), ("reviewed_by", sa.String()),
                       ("reviewed_at", sa.DateTime(timezone=True)), ("review_reason", sa.String(500)),
                       ("refund_reference", sa.String(64)), ("refunded_at", sa.DateTime(timezone=True))]:
        if name not in existing:
            op.add_column("payments", sa.Column(name, kind, nullable=True))
            if name in {"transaction_reference", "refund_reference"}:
                op.create_index("uq_payments_" + name, "payments", [name], unique=True)
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column("payments", "status", type_=sa.String(32))


def downgrade():
    raise RuntimeError("Payment review records must be preserved; restore a verified backup instead")
