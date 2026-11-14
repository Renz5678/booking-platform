"""Database enforcement of one unpaid hold and non-overlapping sessions.

Existing conflicting data must be reconciled before this migration can succeed.
"""
from alembic import op
revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = depends_on = None


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
        op.execute("""ALTER TABLE bookings ADD CONSTRAINT bookings_no_active_overlap
            EXCLUDE USING gist (counselor_id WITH =,
            tstzrange(scheduled_start, scheduled_end, '[)') WITH &&)
            WHERE (status IN ('pending_payment', 'confirmed'))""")
        op.execute("""CREATE UNIQUE INDEX bookings_one_pending_client ON bookings(client_id)
            WHERE status = 'pending_payment'""")


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP INDEX bookings_one_pending_client")
        op.execute("ALTER TABLE bookings DROP CONSTRAINT bookings_no_active_overlap")
