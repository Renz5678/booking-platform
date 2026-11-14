from datetime import date, time

from pydantic import BaseModel, ConfigDict, model_validator


class AvailabilityBase(BaseModel):
    is_recurring: bool
    day_of_week: int | None = None
    specific_date: date | None = None
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def validate_schedule(self) -> "AvailabilityBase":
        if self.is_recurring:
            if self.day_of_week is None:
                raise ValueError("day_of_week must be provided if is_recurring is True")
            if self.day_of_week < 0 or self.day_of_week > 6:
                raise ValueError("day_of_week must be between 0 (Monday) and 6 (Sunday)")
            if self.specific_date is not None:
                raise ValueError("specific_date should not be provided if is_recurring is True")
        else:
            if self.specific_date is None:
                raise ValueError("specific_date must be provided if is_recurring is False")
            if self.day_of_week is not None:
                raise ValueError("day_of_week should not be provided if is_recurring is False")

        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")

        return self


class AvailabilityCreate(AvailabilityBase):
    pass


class AvailabilityResponse(AvailabilityBase):
    id: str
    counselor_id: str

    model_config = ConfigDict(from_attributes=True)

