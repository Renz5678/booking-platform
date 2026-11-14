"""Add verification OTP to users

Revision ID: e43199c88481
Revises: 
Create Date: 2026-07-26 15:08:49.014549

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e43199c88481'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "users" not in existing_tables:
        role_enum = sa.Enum("client", "counselor", "admin", name="roleenum")
        booking_status_enum = sa.Enum(
            "pending_payment",
            "confirmed",
            "cancelled",
            "completed",
            "no_show",
            name="bookingstatus",
        )
        payment_status_enum = sa.Enum("pending", "paid", "failed", "refunded", name="paymentstatus")
        payment_method_enum = sa.Enum("gcash", "maya", "card", name="paymentmethod")

        op.create_table(
            "users",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("password_hash", sa.String(), nullable=False),
            sa.Column("full_name", sa.String(), nullable=False),
            sa.Column("role", role_enum, nullable=False),
            sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("verification_otp", sa.String(), nullable=True),
            sa.Column("verification_otp_expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

        op.create_table(
            "counselor_profiles",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("bio", sa.Text(), nullable=True),
            sa.Column("specialization_tags", sa.JSON(), nullable=True),
            sa.Column("credentials_url", sa.String(), nullable=True),
            sa.Column("is_verified", sa.Boolean(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id"),
        )

        op.create_table(
            "availability",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("counselor_id", sa.String(), nullable=False),
            sa.Column("day_of_week", sa.Integer(), nullable=True),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("is_recurring", sa.Boolean(), nullable=True),
            sa.Column("specific_date", sa.Date(), nullable=True),
            sa.ForeignKeyConstraint(["counselor_id"], ["counselor_profiles.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

        op.create_table(
            "bookings",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("client_id", sa.String(), nullable=False),
            sa.Column("counselor_id", sa.String(), nullable=False),
            sa.Column("scheduled_start", sa.DateTime(timezone=True), nullable=False),
            sa.Column("scheduled_end", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", booking_status_enum, nullable=False),
            sa.Column("meeting_link", sa.String(), nullable=True),
            sa.Column("google_calendar_event_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["client_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["counselor_id"], ["counselor_profiles.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

        op.create_table(
            "payments",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("booking_id", sa.String(), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("currency", sa.String(), nullable=False),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("provider_payment_id", sa.String(), nullable=True),
            sa.Column("status", payment_status_enum, nullable=False),
            sa.Column("payment_method", payment_method_enum, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("booking_id"),
        )

        op.create_table(
            "intake_forms",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("booking_id", sa.String(), nullable=False),
            sa.Column("concern_category", sa.String(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("booking_id"),
        )

        op.create_table(
            "contact_messages",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("subject", sa.String(), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        return

    existing_cols = {col["name"] for col in inspector.get_columns("users")}
    if "verification_otp" not in existing_cols:
        op.add_column('users', sa.Column('verification_otp', sa.String(), nullable=True))
    if "verification_otp_expires_at" not in existing_cols:
        op.add_column('users', sa.Column('verification_otp_expires_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('users', 'verification_otp_expires_at')
    op.drop_column('users', 'verification_otp')
    # ### end Alembic commands ###
