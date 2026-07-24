from datetime import date, time

from pydantic import BaseModel, validator


class AvailabilityBase(BaseModel):
    day_of_week: int | None = None
    specific_date: date | None = None
    start_time: time
    end_time: time
    is_recurring: bool

    @validator("day_of_week", always=True)
    def validate_day_or_date(cls, v, values):
        is_recurring = values.get("is_recurring", False)
        specific_date = values.get("specific_date")

        if is_recurring:
            if v is None:
                raise ValueError("day_of_week must be provided if is_recurring is True")
            if v < 0 or v > 6:
                raise ValueError(
                    "day_of_week must be between 0 (Monday) and 6 (Sunday)"
                )
            if specific_date is not None:
                raise ValueError(
                    "specific_date should not be provided if is_recurring is True"
                )
        else:
            if specific_date is None:
                raise ValueError(
                    "specific_date must be provided if is_recurring is False"
                )
            if v is not None:
                raise ValueError(
                    "day_of_week should not be provided if is_recurring is False"
                )

        return v

    @validator("end_time")
    def validate_time_range(cls, v, values):
        start_time = values.get("start_time")
        if start_time and v <= start_time:
            raise ValueError("end_time must be after start_time")
        return v


class AvailabilityCreate(AvailabilityBase):
    pass


class AvailabilityResponse(AvailabilityBase):
    id: str
    counselor_id: str

    class Config:
        from_attributes = True
