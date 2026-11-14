"""Durable operations and authenticated documents."""
from alembic import op
import sqlalchemy as sa
revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = depends_on = None


def upgrade():
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())
    definitions = {
        "outbox_jobs": [sa.Column("id", sa.String(), primary_key=True), sa.Column("operation_key", sa.String(), unique=True, nullable=False), sa.Column("kind", sa.String(), nullable=False), sa.Column("payload", sa.JSON(), nullable=False), sa.Column("status", sa.String(), nullable=False), sa.Column("attempts", sa.Integer(), nullable=False), sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False), sa.Column("lease_until", sa.DateTime(timezone=True)), sa.Column("error_code", sa.String()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)],
        "recovery_tokens": [sa.Column("token_hash", sa.String(), primary_key=True), sa.Column("user_id", sa.String(), nullable=False, index=True), sa.Column("purpose", sa.String(), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False)],
        "audit_events": [sa.Column("id", sa.String(), primary_key=True), sa.Column("actor_id", sa.String(), nullable=False), sa.Column("target_id", sa.String(), nullable=False), sa.Column("action", sa.String(), nullable=False), sa.Column("outcome", sa.String(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)],
    }
    for table, columns in definitions.items():
        if table not in existing:
            op.create_table(table, *columns)
    additions = {"bookings": [sa.Column("schedule_version", sa.Integer(), nullable=False, server_default="1"), sa.Column("provisioning_status", sa.String(), nullable=False, server_default="pending"), sa.Column("client_calendar_event_id", sa.String())], "counselor_profiles": [sa.Column("credential_object", sa.JSON())]}
    for table, columns in additions.items():
        names = {c["name"] for c in sa.inspect(bind).get_columns(table)}
        for column in columns:
            if column.name not in names:
                op.add_column(table, column)


def downgrade():
    raise RuntimeError("Restore a backup rather than dropping operational history")
