
import re


INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"ignore\s+the\s+system",
    r"system\s+prompt",
    r"developer\s+message",
    r"reveal\s+.*prompt",
    r"override\s+.*instructions",
    r"do\s+not\s+follow\s+.*instructions",
    r"pretend\s+you\s+are\s+the\s+system",
    r"set\s+aside\s+(all\s+)?(earlier|previous|prior)\s+(rules|instructions)",
    r"(show|reveal|display)\s+.*(hidden|secret)\s+(system\s+)?(instructions|prompt)",
    r"忽略(?:之前|先前|以上|前面)的?(?:所有)?(?:指示|指令|規則|规则)",
    r"(?:顯示|显示|揭露|透露).*(?:隱藏|隐藏).*(?:系統|系统)?(?:指令|指示|提示詞|提示词)",
]


def calculate_weight_change(patient):

    if (
        patient.weight_kg_today is None
        or patient.weight_kg_prior is None
    ):
        return {
            "tool": "calculate_weight_change",
            "status": "MISSING_DATA",
            "weight_change_kg": None
        }

    change = (
        float(patient.weight_kg_today)
        - float(patient.weight_kg_prior)
    )

    return {
        "tool": "calculate_weight_change",
        "status": "OK",
        "weight_change_kg": round(
            change,
            2
        )
    }


def check_data_quality(patient):
    """
    IMPORTANT:
    >24 hours is a prototype data-freshness policy,
    not a guideline-derived clinical threshold.
    """

    issues = []

    if patient.wearable_missing:
        issues.append(
            "WEARABLE_MISSING"
        )

    if patient.weight_kg_today is None:
        issues.append(
            "CURRENT_WEIGHT_MISSING"
        )

    if patient.glucose_mmol_l is None:
        issues.append(
            "GLUCOSE_MISSING"
        )

    if (
        patient.data_age_hours is not None
        and patient.data_age_hours > 24
    ):
        issues.append(
            "PROTOTYPE_STALE_DATA_GT_24H"
        )

    return {
        "tool": "check_data_quality",
        "status": (
            "OK"
            if not issues
            else "ISSUES_FOUND"
        ),
        "issues": issues
    }


def detect_prompt_injection(patient):

    fields = {
        "symptoms_text":
            patient.symptoms_text,

        "meal_text":
            patient.meal_text,

        "meal_image_description":
            patient.meal_image_description
    }

    matches = []

    for field_name, text in fields.items():

        text = text or ""

        for pattern in INJECTION_PATTERNS:

            if re.search(
                pattern,
                text,
                flags=re.IGNORECASE
            ):
                matches.append({
                    "field":
                        field_name,
                    "pattern":
                        pattern
                })

    return {
        "detected":
            bool(matches),

        "matches":
            matches
    }


def detect_multimodal_contradiction(
    patient
):
    """
    Conservative, machine-checkable prototype rule.

    This does NOT infer clinical truth from an image.
    It only catches a narrow contradiction:
    text explicitly states no meal was consumed while
    an image description reports visible food.
    """

    text = (
        patient.meal_text
        or ""
    ).lower()

    image_text = (
        patient.meal_image_description
        or ""
    ).strip()

    no_meal_markers = [
        "did not eat",
        "didn't eat",
        "no meal",
        "nothing eaten",
        "ate nothing",
        "skipped meal"
    ]

    detected = (
        bool(image_text)
        and any(
            marker in text
            for marker
            in no_meal_markers
        )
    )

    return {
        "detected":
            detected,

        "reason": (
            "TEXT_REPORTS_NO_MEAL_BUT_IMAGE_CONTAINS_FOOD"
            if detected
            else None
        )
    }
