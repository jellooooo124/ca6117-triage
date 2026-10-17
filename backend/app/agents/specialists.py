
from app.services.tools import (
    calculate_weight_change,
    check_data_quality
)

from app.services.reasoning import (
    HF_SCHEMA_VERSION,
    GLY_SCHEMA_VERSION,
    build_reasoning_prompt,
    normalize_llm_result
)


class HeartFailureAgent:

    name = "heart_failure_agent"
    domain = "heart_failure"


    def __init__(
        self,
        retriever=None,
        llm_service=None
    ):
        self.retriever = retriever
        self.llm_service = llm_service


    def analyze(
        self,
        patient,
        allow_api=False,
        progress_callback=None
    ):


        def emit_progress(
            stage,
            state,
            message,
            progress_percent,
            details=None
        ):

            if progress_callback is None:
                return

            event = {
                "stage":
                    stage,

                "actor":
                    self.name,

                "state":
                    state,

                "message":
                    message,

                "progress_percent":
                    progress_percent
            }

            if details is not None:
                event["details"] = details

            progress_callback(
                event
            )


        # --------------------------------
        # 1. Deterministic tools
        # --------------------------------

        emit_progress(
            stage="HEART_FAILURE_TOOLS",
            state="RUNNING",
            message=(
                "Running deterministic clinical "
                "data and quality tools."
            ),
            progress_percent=22,
            details={
                "tools":
                    ['calculate_weight_change', 'check_data_quality']
            }
        )


        weight_result = (
            calculate_weight_change(
                patient
            )
        )

        quality_result = (
            check_data_quality(
                patient
            )
        )

        tool_results = {
            "weight_change":
                weight_result,

            "data_quality":
                quality_result
        }


        emit_progress(
            stage="HEART_FAILURE_TOOLS",
            state="COMPLETED",
            message=(
                "Deterministic tools completed."
            ),
            progress_percent=26,
            details={
                "tools":
                    ['calculate_weight_change', 'check_data_quality']
            }
        )


        emit_progress(
            stage="HEART_FAILURE_RETRIEVAL",
            state="RUNNING",
            message=(
                "Building a patient-specific "
                "query and retrieving guideline "
                "evidence."
            ),
            progress_percent=28
        )


        # --------------------------------
        # 2. Patient-specific RAG query
        # --------------------------------

        query_parts = [
            "heart failure",
            patient.symptoms_text,
            patient.meal_text,
            (
                "peripheral oedema "
                "systemic congestion "
                "volume overload signs symptoms "
                "decompensated heart failure"
            )
        ]

        if (
            weight_result.get(
                "weight_change_kg"
            )
            is not None
        ):
            query_parts.append(
                "weight change "
                + str(
                    weight_result[
                        "weight_change_kg"
                    ]
                )
                + " kg"
            )


        query = " ".join(
            str(part)
            for part in query_parts
            if part
        )


        # --------------------------------
        # 3. Hybrid RAG
        # --------------------------------

        if self.retriever is None:

            evidence = []

            rag_status = (
                "RAG_NOT_CONFIGURED"
            )

        else:

            evidence = (
                self.retriever.hybrid_search(
                    query=query,
                    top_k=3
                )
            )

            rag_status = (
                "EVIDENCE_RETRIEVED"
                if evidence
                else "INSUFFICIENT_EVIDENCE"
            )


        rag_output = {
            "status":
                rag_status,

            "query":
                query,

            "evidence":
                evidence
        }


        emit_progress(
            stage="HEART_FAILURE_RETRIEVAL",
            state=(
                "COMPLETED"
                if rag_status ==
                    "EVIDENCE_RETRIEVED"
                else "DEGRADED"
            ),
            message=(
                "Guideline evidence retrieved."
                if rag_status ==
                    "EVIDENCE_RETRIEVED"
                else
                "Guideline evidence was not "
                "available for grounded reasoning."
            ),
            progress_percent=34,
            details={
                "rag_status":
                    rag_status,

                "evidence_count":
                    len(evidence)
            }
        )


        base_result = {
            "agent":
                self.name,

            "domain":
                self.domain,

            "patient_id":
                patient.patient_id,

            "tool_results":
                tool_results,

            "rag":
                rag_output
        }


        emit_progress(
            stage="HEART_FAILURE_REASONING",
            state="RUNNING",
            message=(
                "Evaluating retrieved evidence "
                "and preparing grounded "
                "specialist reasoning."
            ),
            progress_percent=36
        )


        # --------------------------------
        # 4. Fail safely if RAG unavailable
        # --------------------------------

        if (
            rag_status
            != "EVIDENCE_RETRIEVED"
        ):

            reasoning = {
                "schema_version":
                    HF_SCHEMA_VERSION,

                "reasoning_status":
                    "INSUFFICIENT_EVIDENCE",

                "patient_findings":
                    [],

                "guideline_interpretation":
                    "",

                "clinical_concerns":
                    [],

                "evidence_used":
                    [],

                "uncertainties": [
                    (
                        "Heart Failure guideline "
                        "evidence unavailable."
                    )
                ],

                "urgency":
                    "UNKNOWN",

                "action_tags":
                    [],

                "needs_human_review":
                    True,

                "model_service_status":
                    "LLM_NOT_CALLED"
            }


        # --------------------------------
        # 5. Fail safely if LLM unavailable
        # --------------------------------

        elif self.llm_service is None:

            reasoning = {
                "schema_version":
                    HF_SCHEMA_VERSION,

                "reasoning_status":
                    "MODEL_ERROR",

                "patient_findings":
                    [],

                "guideline_interpretation":
                    "",

                "clinical_concerns":
                    [],

                "evidence_used":
                    [],

                "uncertainties": [
                    "LLM service not configured."
                ],

                "urgency":
                    "UNKNOWN",

                "action_tags":
                    [],

                "needs_human_review":
                    True,

                "model_service_status":
                    "LLM_NOT_CONFIGURED"
            }


        # --------------------------------
        # 6. Grounded reasoning
        # --------------------------------

        else:

            system_prompt, user_prompt = (
                build_reasoning_prompt(
                    domain=
                        "Heart Failure",

                    schema_version=
                        HF_SCHEMA_VERSION,

                    patient=
                        patient,

                    agent_result=
                        base_result
                )
            )


            llm_result = (
                self.llm_service.generate(
                    system_prompt=
                        system_prompt,

                    user_prompt=
                        user_prompt,

                    schema_version=
                        HF_SCHEMA_VERSION,

                    allow_api=
                        allow_api
                )
            )


            reasoning = (
                normalize_llm_result(
                    llm_result=
                        llm_result,

                    schema_version=
                        HF_SCHEMA_VERSION,

                    retrieved_evidence=
                        evidence
                )
            )


        reasoning_status = (
            reasoning.get(
                "reasoning_status"
            )
        )


        if (
            rag_status
            != "EVIDENCE_RETRIEVED"
        ):

            reasoning_event_state = (
                "SKIPPED"
            )

            reasoning_event_message = (
                "Grounded reasoning was skipped "
                "because guideline evidence was "
                "not available."
            )


        elif self.llm_service is None:

            reasoning_event_state = (
                "SKIPPED"
            )

            reasoning_event_message = (
                "Grounded reasoning was skipped "
                "because the model service was "
                "not configured."
            )


        elif reasoning_status in {
            "MODEL_ERROR",
            "INVALID_MODEL_OUTPUT",
            "INSUFFICIENT_EVIDENCE",
        }:

            reasoning_event_state = (
                "DEGRADED"
            )

            reasoning_event_message = (
                "Reasoning returned a fail-safe "
                "or degraded result."
            )


        else:

            reasoning_event_state = (
                "COMPLETED"
            )

            reasoning_event_message = (
                "Grounded specialist reasoning "
                "completed."
            )


        emit_progress(
            stage="HEART_FAILURE_REASONING",
            state=
                reasoning_event_state,

            message=
                reasoning_event_message,

            progress_percent=
                39,

            details={
                "reasoning_status":
                    reasoning_status,

                "model_service_status":
                    reasoning.get(
                        "model_service_status"
                    )
            }
        )


        return {
            **base_result,

            "status":
                "READY_FOR_SAFETY_EVALUATION",

            "reasoning":
                reasoning
        }



class GlycemicAgent:

    name = "glycemic_agent"
    domain = "glycemic"


    def __init__(
        self,
        retriever=None,
        llm_service=None
    ):
        self.retriever = retriever
        self.llm_service = llm_service


    def analyze(
        self,
        patient,
        allow_api=False,
        progress_callback=None
    ):


        def emit_progress(
            stage,
            state,
            message,
            progress_percent,
            details=None
        ):

            if progress_callback is None:
                return

            event = {
                "stage":
                    stage,

                "actor":
                    self.name,

                "state":
                    state,

                "message":
                    message,

                "progress_percent":
                    progress_percent
            }

            if details is not None:
                event["details"] = details

            progress_callback(
                event
            )


        # --------------------------------
        # 1. Deterministic tools
        # --------------------------------

        emit_progress(
            stage="GLYCEMIC_TOOLS",
            state="RUNNING",
            message=(
                "Running deterministic clinical "
                "data and quality tools."
            ),
            progress_percent=48,
            details={
                "tools":
                    ['check_data_quality', 'read_glucose_context']
            }
        )


        quality_result = (
            check_data_quality(
                patient
            )
        )


        glucose_context = {
            "tool":
                "read_glucose_context",

            "status": (
                "OK"
                if (
                    patient.glucose_mmol_l
                    is not None
                )
                else "MISSING_DATA"
            ),

            "glucose_mmol_l":
                patient.glucose_mmol_l,

            "meal_text":
                patient.meal_text,

            "meal_image_description":
                patient.meal_image_description
        }


        tool_results = {
            "data_quality":
                quality_result,

            "glucose_context":
                glucose_context
        }


        emit_progress(
            stage="GLYCEMIC_TOOLS",
            state="COMPLETED",
            message=(
                "Deterministic tools completed."
            ),
            progress_percent=52,
            details={
                "tools":
                    ['check_data_quality', 'read_glucose_context']
            }
        )


        emit_progress(
            stage="GLYCEMIC_RETRIEVAL",
            state="RUNNING",
            message=(
                "Building a patient-specific "
                "query and retrieving guideline "
                "evidence."
            ),
            progress_percent=54
        )


        # --------------------------------
        # 2. Patient-specific RAG query
        # --------------------------------

        query_parts = [
            "type 2 diabetes",
            "glycemic management",
            "blood glucose",
            "hyperglycemia hypoglycemia",
            patient.symptoms_text,
            patient.meal_text,
            patient.meal_image_description
        ]


        if (
            patient.glucose_mmol_l
            is not None
        ):
            query_parts.append(
                "measured glucose "
                + str(
                    patient.glucose_mmol_l
                )
                + " mmol/L"
            )


        query = " ".join(
            str(part)
            for part in query_parts
            if part
        )


        # --------------------------------
        # 3. Hybrid RAG
        # --------------------------------

        if self.retriever is None:

            evidence = []

            rag_status = (
                "RAG_NOT_CONFIGURED"
            )

        else:

            evidence = (
                self.retriever.hybrid_search(
                    query=query,
                    top_k=3
                )
            )

            rag_status = (
                "EVIDENCE_RETRIEVED"
                if evidence
                else "INSUFFICIENT_EVIDENCE"
            )


        rag_output = {
            "status":
                rag_status,

            "query":
                query,

            "evidence":
                evidence
        }


        emit_progress(
            stage="GLYCEMIC_RETRIEVAL",
            state=(
                "COMPLETED"
                if rag_status ==
                    "EVIDENCE_RETRIEVED"
                else "DEGRADED"
            ),
            message=(
                "Guideline evidence retrieved."
                if rag_status ==
                    "EVIDENCE_RETRIEVED"
                else
                "Guideline evidence was not "
                "available for grounded reasoning."
            ),
            progress_percent=60,
            details={
                "rag_status":
                    rag_status,

                "evidence_count":
                    len(evidence)
            }
        )


        base_result = {
            "agent":
                self.name,

            "domain":
                self.domain,

            "patient_id":
                patient.patient_id,

            "tool_results":
                tool_results,

            "rag":
                rag_output
        }


        emit_progress(
            stage="GLYCEMIC_REASONING",
            state="RUNNING",
            message=(
                "Evaluating retrieved evidence "
                "and preparing grounded "
                "specialist reasoning."
            ),
            progress_percent=62
        )


        # --------------------------------
        # 4. Fail safely if RAG unavailable
        # --------------------------------

        if (
            rag_status
            != "EVIDENCE_RETRIEVED"
        ):

            reasoning = {
                "schema_version":
                    GLY_SCHEMA_VERSION,

                "reasoning_status":
                    "INSUFFICIENT_EVIDENCE",

                "patient_findings":
                    [],

                "guideline_interpretation":
                    "",

                "clinical_concerns":
                    [],

                "evidence_used":
                    [],

                "uncertainties": [
                    (
                        "Glycemic guideline "
                        "evidence unavailable."
                    )
                ],

                "urgency":
                    "UNKNOWN",

                "action_tags":
                    [],

                "needs_human_review":
                    True,

                "model_service_status":
                    "LLM_NOT_CALLED"
            }


        # --------------------------------
        # 5. Fail safely if LLM unavailable
        # --------------------------------

        elif self.llm_service is None:

            reasoning = {
                "schema_version":
                    GLY_SCHEMA_VERSION,

                "reasoning_status":
                    "MODEL_ERROR",

                "patient_findings":
                    [],

                "guideline_interpretation":
                    "",

                "clinical_concerns":
                    [],

                "evidence_used":
                    [],

                "uncertainties": [
                    "LLM service not configured."
                ],

                "urgency":
                    "UNKNOWN",

                "action_tags":
                    [],

                "needs_human_review":
                    True,

                "model_service_status":
                    "LLM_NOT_CONFIGURED"
            }


        # --------------------------------
        # 6. Grounded reasoning
        # --------------------------------

        else:

            system_prompt, user_prompt = (
                build_reasoning_prompt(
                    domain=
                        "Glycemic",

                    schema_version=
                        GLY_SCHEMA_VERSION,

                    patient=
                        patient,

                    agent_result=
                        base_result
                )
            )


            llm_result = (
                self.llm_service.generate(
                    system_prompt=
                        system_prompt,

                    user_prompt=
                        user_prompt,

                    schema_version=
                        GLY_SCHEMA_VERSION,

                    allow_api=
                        allow_api
                )
            )


            reasoning = (
                normalize_llm_result(
                    llm_result=
                        llm_result,

                    schema_version=
                        GLY_SCHEMA_VERSION,

                    retrieved_evidence=
                        evidence
                )
            )


        reasoning_status = (
            reasoning.get(
                "reasoning_status"
            )
        )


        if (
            rag_status
            != "EVIDENCE_RETRIEVED"
        ):

            reasoning_event_state = (
                "SKIPPED"
            )

            reasoning_event_message = (
                "Grounded reasoning was skipped "
                "because guideline evidence was "
                "not available."
            )


        elif self.llm_service is None:

            reasoning_event_state = (
                "SKIPPED"
            )

            reasoning_event_message = (
                "Grounded reasoning was skipped "
                "because the model service was "
                "not configured."
            )


        elif reasoning_status in {
            "MODEL_ERROR",
            "INVALID_MODEL_OUTPUT",
            "INSUFFICIENT_EVIDENCE",
        }:

            reasoning_event_state = (
                "DEGRADED"
            )

            reasoning_event_message = (
                "Reasoning returned a fail-safe "
                "or degraded result."
            )


        else:

            reasoning_event_state = (
                "COMPLETED"
            )

            reasoning_event_message = (
                "Grounded specialist reasoning "
                "completed."
            )


        emit_progress(
            stage="GLYCEMIC_REASONING",
            state=
                reasoning_event_state,

            message=
                reasoning_event_message,

            progress_percent=
                68,

            details={
                "reasoning_status":
                    reasoning_status,

                "model_service_status":
                    reasoning.get(
                        "model_service_status"
                    )
            }
        )


        return {
            **base_result,

            "status":
                "READY_FOR_SAFETY_EVALUATION",

            "reasoning":
                reasoning
        }
