import importlib.util
import json
from pathlib import Path
import pytest
spec = importlib.util.spec_from_file_location("counselor_import", Path(__file__).parents[1] / "scripts/import_counselors.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_seed_duplicates_and_unknown_fields(tmp_path):
    row = {"email": "staff@example.com", "full_name": "Staff Name", "bio": "Bio", "specialization_tags": [], "initial_password_env": "ALAGA_COUNSELOR_1_PASSWORD"}
    path = tmp_path / "seed.json"
    path.write_text(json.dumps([row, row]))
    with pytest.raises(ValueError):
        module.load(path)
    path.write_text(json.dumps([{**row, "password": "never-allow-json-passwords"}]))
    with pytest.raises(ValueError):
        module.load(path)


def test_seed_invalid_json(tmp_path):
    path = tmp_path / "seed.json"
    path.write_text("{")
    with pytest.raises(ValueError):
        module.load(path)


@pytest.mark.asyncio
async def test_seed_apply_rerun_and_transaction_rollback(tmp_path, db, monkeypatch):
    from conftest import TestingSessionLocal
    from sqlalchemy import select
    from app.models.user import User, RoleEnum
    from unittest.mock import AsyncMock
    monkeypatch.setattr(module, "AsyncSessionLocal", TestingSessionLocal)
    mock_engine = AsyncMock()
    monkeypatch.setattr(module, "engine", mock_engine)
    monkeypatch.setenv("ALAGA_COUNSELOR_1_PASSWORD", "StrongPassword123")
    monkeypatch.setenv("ALAGA_COUNSELOR_2_PASSWORD", "StrongPassword456")
    row = {"email": "seeded@example.com", "full_name": "Seeded Staff", "bio": "Bio", "specialization_tags": [], "initial_password_env": "ALAGA_COUNSELOR_1_PASSWORD"}
    path = tmp_path / "seed.json"
    path.write_text(json.dumps([row]))
    from types import SimpleNamespace
    args = SimpleNamespace(file=str(path), apply=True)
    await module.main(args)
    await module.main(args)
    assert len((await db.execute(select(User).where(User.email == row["email"]))).scalars().all()) == 1
    db.add(User(email="existing@example.com", full_name="Client", password_hash="unused", role=RoleEnum.client))
    await db.commit()
    path.write_text(json.dumps([{**row, "email": "rollback@example.com"}, {**row, "email": "existing@example.com", "initial_password_env": "ALAGA_COUNSELOR_2_PASSWORD"}]))
    with pytest.raises(ValueError):
        await module.main(args)
    assert (await db.execute(select(User).where(User.email == "rollback@example.com"))).scalar_one_or_none() is None
