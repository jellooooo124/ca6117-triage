
import uuid

from datetime import (
    datetime,
    timezone
)


class HumanReviewer:

    VALID_DECISIONS = {
        "APPROVE",
        "EDIT",
        "REJECT",
        "ESCALATE"
    }


    def review(
        self,
        workflow_result,
        decision,
        reviewer_id,
        edited_draft=None
    ):

        decision = (
            decision.upper()
        )


        if (
            decision
            not in self.VALID_DECISIONS
        ):
            raise ValueError(
                "Invalid review decision."
            )


        safety = (
            workflow_result[
                "safety_result"
            ]
        )


        # Deterministic SAFE_STOP
        # cannot be overridden.
        if (
            safety["action"]
            == "SAFE_STOP"
            and decision
            in {
                "APPROVE",
                "EDIT"
            }
        ):
            raise PermissionError(
                "SAFE_STOP cannot be "
                "overridden by APPROVE "
                "or EDIT."
            )


        status_map = {
            "APPROVE":
                "HUMAN_APPROVED",

            "EDIT":
                "HUMAN_EDITED",

            "REJECT":
                "HUMAN_REJECTED",

            "ESCALATE":
                "HUMAN_ESCALATED"
        }


        return {
            "review_id":
                "review_"
                + uuid.uuid4().hex[:12],

            "timestamp":
                datetime.now(
                    timezone.utc
                ).isoformat(),

            "run_id":
                workflow_result[
                    "run_id"
                ],

            "patient_id":
                workflow_result[
                    "patient_id"
                ],

            "reviewer_id":
                reviewer_id,

            "decision":
                decision,

            "edited_draft":
                edited_draft,

            "status":
                status_map[
                    decision
                ]
        }
