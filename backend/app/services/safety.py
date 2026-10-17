
from app.services.tools import (
    check_data_quality,
    detect_prompt_injection,
    detect_multimodal_contradiction
)


URGENCY_RANK = {
    "ROUTINE_REVIEW": 0,
    "PROMPT_REVIEW": 1,
    "URGENT_REVIEW": 2
}


def detect_specialist_conflict(
    hf_reasoning,
    gly_reasoning
):

    hf_urgency = hf_reasoning.get(
        "urgency",
        "UNKNOWN"
    )

    gly_urgency = gly_reasoning.get(
        "urgency",
        "UNKNOWN"
    )

    if (
        hf_urgency in URGENCY_RANK
        and gly_urgency in URGENCY_RANK
        and abs(
            URGENCY_RANK[hf_urgency]
            - URGENCY_RANK[gly_urgency]
        ) >= 2
    ):
        return {
            "detected": True,
            "reason":
                "SPECIALIST_URGENCY_DISAGREEMENT",
            "hf_urgency":
                hf_urgency,
            "glycemic_urgency":
                gly_urgency
        }

    return {
        "detected": False,
        "reason": None,
        "hf_urgency":
            hf_urgency,
        "glycemic_urgency":
            gly_urgency
    }


class SafetyEngine:

    def evaluate(
        self,
        patient,
        hf_result,
        gly_result,
        image_result=None
    ):

        reasons = []

        # --------------------------------
        # 1. Data quality
        # --------------------------------

        quality = check_data_quality(
            patient
        )

        reasons.extend(
            quality["issues"]
        )


        # --------------------------------
        # 2. Prompt injection
        # --------------------------------

        injection = (
            detect_prompt_injection(
                patient
            )
        )

        if injection["detected"]:
            reasons.append(
                "PROMPT_INJECTION_DETECTED"
            )


        # --------------------------------
        # 3. Multimodal contradiction
        # --------------------------------

        multimodal = (
            detect_multimodal_contradiction(
                patient
            )
        )

        if multimodal["detected"]:
            reasons.append(
                "MULTIMODAL_CONTRADICTION"
            )


        # --------------------------------
        # 4. Image-service failure
        # --------------------------------

        if (
            patient.meal_image_path
            and image_result is not None
            and image_result.get("status")
            not in {
                "API_SUCCESS",
                "CACHE_HIT"
            }
        ):
            reasons.append(
                "MEAL_IMAGE_MODEL_ERROR"
            )


        # --------------------------------
        # 5. Specialist output existence
        # --------------------------------

        if hf_result is None:
            reasons.append(
                "HF_RESULT_MISSING"
            )

        if gly_result is None:
            reasons.append(
                "GLYCEMIC_RESULT_MISSING"
            )


        # --------------------------------
        # 6. HF checks
        # --------------------------------

        if hf_result is not None:

            hf_rag_status = (
                hf_result
                .get("rag", {})
                .get("status")
            )

            if (
                hf_rag_status
                == "INSUFFICIENT_EVIDENCE"
            ):
                reasons.append(
                    "HF_INSUFFICIENT_EVIDENCE"
                )

            elif (
                hf_rag_status
                == "RAG_NOT_CONFIGURED"
            ):
                reasons.append(
                    "HF_RAG_NOT_CONFIGURED"
                )


            hf_reasoning = (
                hf_result.get(
                    "reasoning",
                    {}
                )
            )

            if (
                hf_reasoning.get(
                    "reasoning_status"
                )
                == "MODEL_ERROR"
            ):
                reasons.append(
                    "HF_MODEL_ERROR"
                )

            elif (
                hf_reasoning.get(
                    "reasoning_status"
                )
                == "INSUFFICIENT_EVIDENCE"
            ):
                reasons.append(
                    "HF_REASONING_INSUFFICIENT_EVIDENCE"
                )


        # --------------------------------
        # 7. Glycemic checks
        # --------------------------------

        if gly_result is not None:

            gly_rag_status = (
                gly_result
                .get("rag", {})
                .get("status")
            )

            if (
                gly_rag_status
                == "INSUFFICIENT_EVIDENCE"
            ):
                reasons.append(
                    "GLYCEMIC_INSUFFICIENT_EVIDENCE"
                )

            elif (
                gly_rag_status
                == "RAG_NOT_CONFIGURED"
            ):
                reasons.append(
                    "GLYCEMIC_RAG_NOT_CONFIGURED"
                )


            gly_reasoning = (
                gly_result.get(
                    "reasoning",
                    {}
                )
            )

            if (
                gly_reasoning.get(
                    "reasoning_status"
                )
                == "MODEL_ERROR"
            ):
                reasons.append(
                    "GLYCEMIC_MODEL_ERROR"
                )

            elif (
                gly_reasoning.get(
                    "reasoning_status"
                )
                == "INSUFFICIENT_EVIDENCE"
            ):
                reasons.append(
                    "GLYCEMIC_REASONING_INSUFFICIENT_EVIDENCE"
                )


        # --------------------------------
        # 8. Specialist conflict
        # --------------------------------

        conflict = None

        if (
            hf_result is not None
            and gly_result is not None
        ):
            conflict = (
                detect_specialist_conflict(
                    hf_result.get(
                        "reasoning",
                        {}
                    ),
                    gly_result.get(
                        "reasoning",
                        {}
                    )
                )
            )

            if conflict["detected"]:
                reasons.append(
                    conflict["reason"]
                )


        # Remove duplicate reasons while
        # preserving deterministic order.
        reasons = list(
            dict.fromkeys(
                reasons
            )
        )

        safe_to_continue = (
            len(reasons) == 0
        )


        return {
            "safe_to_continue":
                safe_to_continue,

            "action": (
                "CLINICIAN_REVIEW"
                if safe_to_continue
                else "SAFE_STOP"
            ),

            "reasons":
                reasons,

            "human_review_required":
                True,

            "prompt_injection":
                injection,

            "multimodal_check":
                multimodal,

            "specialist_conflict":
                conflict
        }
