
from typing import (
    Literal,
    Optional
)

from pydantic import BaseModel

from app.domain.models import (
    PatientState
)


class TriageRequest(BaseModel):

    patient: PatientState

    mode: Literal[
        "simulation",
        "live"
    ] = "simulation"


    simulation_profile: Literal[
        "standard",
        "glycemic_model_error"
    ] = "standard"



class ReviewRequest(BaseModel):

    decision: Literal[
        "APPROVE",
        "EDIT",
        "REJECT",
        "ESCALATE"
    ]

    reviewer_id: str = (
        "demo_clinician"
    )

    edited_draft: Optional[str] = None
