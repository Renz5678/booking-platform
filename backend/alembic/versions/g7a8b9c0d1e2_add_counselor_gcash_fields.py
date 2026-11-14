"""add counselor gcash fields

Revision ID: g7a8b9c0d1e2
Revises: f6a1b2c3d4e5
Create Date: 2026-11-14 20:36:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "g7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "f6a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("counselor_profiles", sa.Column("gcash_number", sa.String(), nullable=True))
    op.add_column("counselor_profiles", sa.Column("gcash_qr_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("counselor_profiles", "gcash_qr_url")
    op.drop_column("counselor_profiles", "gcash_number")
