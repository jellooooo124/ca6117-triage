
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field


class PatientState(BaseModel):
    """
    Validated patient/home-monitoring state used by
    the FastAPI backend and specialist agents.
    """

    patient_id: str

    weight_kg_today: Optional[float] = None
    weight_kg_prior: Optional[float] = None

    glucose_mmol_l: Optional[float] = None
    systolic_bp: Optional[int] = None
    heart_rate_bpm: Optional[int] = None

    symptoms_text: str = ""
    meal_text: str = ""
    meal_image_description: str = ""

    # Internal / future upload handling.
    meal_image_path: Optional[str] = None

    wearable_missing: bool = False

    data_age_hours: Optional[float] = None

    history: List[Dict[str, Any]] = Field(
        default_factory=list
    )
