from pydantic import BaseModel


class ContentUpdate(BaseModel):
    value: str


class ContentResponse(BaseModel):
    key: str
    value: str
    updated_at: str | None = None
