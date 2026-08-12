"""add_photo_url_to_counselor_profile

Revision ID: c3d4e5f6a1b2
Revises: b2c3d4e5f6a1
Create Date: 2026-08-12 12:50:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a1b2'
down_revision: str | None = 'b2c3d4e5f6a1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('counselor_profiles', sa.Column('photo_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('counselor_profiles', 'photo_url')
