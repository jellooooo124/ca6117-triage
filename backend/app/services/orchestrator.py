
import uuid

from app.agents.specialists import (
    HeartFailureAgent,
    GlycemicAgent
)

from app.services.safety import (
    SafetyEngine
)


class Orchestrator:

    def __init__(
        self,
        hf_retriever,
        gly_retriever,
        llm_service
    ):
        self.hf_retriever = hf_retriever
        self.gly_retriever = gly_retriever
        self.llm_service = llm_service

        self.safety_engine = (
            SafetyEngine()
        )


    def _build_action_draft(
        self,
        hf_result,
        gly_result,
        safety_result
    ):

        if (
            safety_result["action"]
            == "SAFE_STOP"
        ):
            return {
                "status":
                    "WITHHELD_DUE_TO_SAFETY_STOP",

                "patient_facing":
                    False,

                "requires_clinician_review":
                    True
            }


        return {
            "status":
                "DRAFT_FOR_CLINICIAN_REVIEW",

            "patient_facing":
                False,

            "requires_clinician_review":
                True,

            "heart_failure_summary":
                hf_result[
                    "reasoning"
                ].get(
                    "guideline_interpretation",
                    ""
                ),

            "glycemic_summary":
                gly_result[
                    "reasoning"
                ].get(
                    "guideline_interpretation",
                    ""
                ),

            "note": (
                "Prototype draft only. "
                "No autonomous patient-facing "
                "clinical recommendation."
            )
        }


    @staticmethod
    def _trace_tool_calls(
        specialist_result
    ):
        """
        Convert specialist tool outputs into a small,
        presentation-safe execution trace.

        No clinical logic is changed here.
        """

        if not specialist_result:
            return []

        raw_tools = (
            specialist_result.get(
                "tool_results",
                []
            )
            or []
        )

        # Support either list- or dict-shaped
        # tool result structures.
        if isinstance(raw_tools, dict):
            raw_tools = list(
                raw_tools.values()
            )

        calls = []

        for item in raw_tools:

            if not isinstance(item, dict):
                continue

            calls.append({
                "tool":
                    item.get("tool")
                    or item.get("name")
                    or "deterministic_tool",

                "status":
                    item.get("status")
                    or "COMPLETED"
            })

        return calls


    @staticmethod
    def _trace_evidence_refs(
        specialist_result
    ):
        """
        Keep only provenance metadata required
        for execution-trace visibility.
        """

        if not specialist_result:
            return []

        rag = (
            specialist_result.get(
                "rag",
                {}
            )
            or {}
        )

        evidence = (
            rag.get(
                "evidence",
                []
            )
            or []
        )

        refs = []

        for item in evidence:

            if not isinstance(item, dict):
                continue

            refs.append({
                "chunk_id":
                    item.get("chunk_id"),

                "page":
                    item.get("page")
            })

        return refs


    def run(
        self,
        patient,
        allow_api=False,
        run_id=None,
        progress_callback=None
    ):

        if run_id is None:
            run_id = (
                "run_"
                + uuid.uuid4().hex[:10]
            )


        def emit_progress(
            stage,
            actor,
            state,
            message,
            progress_percent
        ):

            if progress_callback is None:
                return

            progress_callback({
                "stage":
                    stage,

                "actor":
                    actor,

                "state":
                    state,

                "message":
                    message,

                "progress_percent":
                    progress_percent
            })


        emit_progress(
            stage="INITIALIZING",
            actor="orchestrator",
            state="RUNNING",
            message=(
                "Preparing the multi-agent "
                "triage workflow."
            ),
            progress_percent=5
        )


        # --------------------------------
        # Specialist agents
        # --------------------------------

        hf_agent = HeartFailureAgent(
            retriever=
                self.hf_retriever,

            llm_service=
                self.llm_service
        )


        gly_agent = GlycemicAgent(
            retriever=
                self.gly_retriever,

            llm_service=
                self.llm_service
        )


        emit_progress(
            stage="HEART_FAILURE_AGENT",
            actor="heart_failure_agent",
            state="RUNNING",
            message=(
                "Heart Failure Agent is analysing "
                "weight, symptoms, tools and "
                "guideline evidence."
            ),
            progress_percent=20
        )


        hf_result = hf_agent.analyze(
            patient=patient,
            allow_api=allow_api,
            progress_callback=
                progress_callback
        )


        emit_progress(
            stage="HEART_FAILURE_AGENT",
            actor="heart_failure_agent",
            state="COMPLETED",
            message=(
                "Heart Failure Agent completed "
                "its grounded analysis."
            ),
            progress_percent=40
        )


        emit_progress(
            stage="GLYCEMIC_AGENT",
            actor="glycemic_agent",
            state="RUNNING",
            message=(
                "Glycemic Agent is analysing "
                "glucose context, tools and "
                "guideline evidence."
            ),
            progress_percent=45
        )


        gly_result = gly_agent.analyze(
            patient=patient,
            allow_api=allow_api,
            progress_callback=
                progress_callback
        )


        # --------------------------------
        # Deterministic safety gate
        # --------------------------------

        emit_progress(
            stage="GLYCEMIC_AGENT",
            actor="glycemic_agent",
            state="COMPLETED",
            message=(
                "Glycemic Agent completed "
                "its grounded analysis."
            ),
            progress_percent=70
        )


        emit_progress(
            stage="SAFETY_GATE",
            actor="deterministic_safety_engine",
            state="RUNNING",
            message=(
                "Deterministic safety rules "
                "are evaluating the case."
            ),
            progress_percent=78
        )


        safety_result = (
            self.safety_engine.evaluate(
                patient=patient,
                hf_result=hf_result,
                gly_result=gly_result
            )
        )


        # --------------------------------
        # Draft only after safety gate
        # --------------------------------

        emit_progress(
            stage="SAFETY_GATE",
            actor="deterministic_safety_engine",
            state=(
                "PASSED"
                if safety_result[
                    "safe_to_continue"
                ]
                else "STOPPED"
            ),
            message=(
                "Safety checks passed. "
                "Preparing clinician review."
                if safety_result[
                    "safe_to_continue"
                ]
                else
                "Safety stop activated. "
                "No autonomous recommendation "
                "will be released."
            ),
            progress_percent=88
        )


        emit_progress(
            stage="ACTION_DRAFT",
            actor="orchestrator",
            state="RUNNING",
            message=(
                "Preparing the clinician-facing "
                "workflow result."
            ),
            progress_percent=92
        )


        action_draft = (
            self._build_action_draft(
                hf_result,
                gly_result,
                safety_result
            )
        )


        workflow_status = (
            "READY_FOR_HUMAN_REVIEW"
            if safety_result[
                "safe_to_continue"
            ]
            else "SAFE_STOP"
        )


        emit_progress(
            stage="HUMAN_CHECKPOINT",
            actor="clinician",
            state="PENDING",
            message=(
                "Automated processing is complete. "
                "The case is waiting for a "
                "clinician decision."
            ),
            progress_percent=100
        )


        # --------------------------------
        # Structured execution trace
        # --------------------------------
        #
        # This is derived from actual workflow state.
        # It is not a frontend animation and it does
        # not alter any clinical or safety decision.

        execution_trace = [

            {
                "sequence": 1,
                "stage": "PLAN",
                "actor": "orchestrator",
                "state": "COMPLETED",
                "summary":
                    "Deterministic workflow plan created.",

                "details": {
                    "planned_steps": [
                        "INTAKE",
                        "DETERMINISTIC_TOOLS",
                        "GUIDELINE_RETRIEVAL",
                        "SPECIALIST_REASONING",
                        "SAFETY_GATE",
                        "HUMAN_CHECKPOINT"
                    ]
                }
            },


            {
                "sequence": 2,
                "stage": "INTAKE",
                "actor": "orchestrator",
                "state": "COMPLETED",
                "summary":
                    "Patient monitoring payload accepted.",

                "details": {
                    "patient_id":
                        patient.patient_id
                }
            },


            {
                "sequence": 3,
                "stage": "DETERMINISTIC_TOOLS",
                "actor": "specialist_agents",
                "state": "COMPLETED",
                "summary":
                    "Deterministic preprocessing and "
                    "context tools executed.",

                "details": {
                    "heart_failure":
                        self._trace_tool_calls(
                            hf_result
                        ),

                    "glycemic":
                        self._trace_tool_calls(
                            gly_result
                        )
                }
            },


            {
                "sequence": 4,
                "stage": "GUIDELINE_RETRIEVAL",
                "actor": "hybrid_rag",
                "state": (
                    "COMPLETED"
                    if (
                        hf_result
                        .get("rag", {})
                        .get("status")
                        == "EVIDENCE_RETRIEVED"
                        and
                        gly_result
                        .get("rag", {})
                        .get("status")
                        == "EVIDENCE_RETRIEVED"
                    )
                    else "DEGRADED"
                ),
                "summary":
                    "Hybrid guideline retrieval completed.",

                "details": {
                    "heart_failure": {
                        "status":
                            hf_result
                            .get("rag", {})
                            .get("status"),

                        "evidence_refs":
                            self._trace_evidence_refs(
                                hf_result
                            )
                    },

                    "glycemic": {
                        "status":
                            gly_result
                            .get("rag", {})
                            .get("status"),

                        "evidence_refs":
                            self._trace_evidence_refs(
                                gly_result
                            )
                    }
                }
            },


            {
                "sequence": 5,
                "stage": "SPECIALIST_REASONING",
                "actor": "multi_agent",
                "state": "COMPLETED",
                "summary":
                    "Specialist agents produced grounded "
                    "structured outputs.",

                "details": {
                    "heart_failure": {
                        "status":
                            hf_result.get(
                                "status"
                            ),

                        "reasoning_status":
                            hf_result
                            .get(
                                "reasoning",
                                {}
                            )
                            .get(
                                "reasoning_status"
                            ),

                        "urgency":
                            hf_result
                            .get(
                                "reasoning",
                                {}
                            )
                            .get(
                                "urgency"
                            )
                    },

                    "glycemic": {
                        "status":
                            gly_result.get(
                                "status"
                            ),

                        "reasoning_status":
                            gly_result
                            .get(
                                "reasoning",
                                {}
                            )
                            .get(
                                "reasoning_status"
                            ),

                        "urgency":
                            gly_result
                            .get(
                                "reasoning",
                                {}
                            )
                            .get(
                                "urgency"
                            )
                    }
                }
            },


            {
                "sequence": 6,
                "stage": "SAFETY_GATE",
                "actor": "deterministic_safety_engine",
                "state": (
                    "PASSED"
                    if safety_result[
                        "safe_to_continue"
                    ]
                    else "STOPPED"
                ),
                "summary": (
                    "Workflow may proceed to clinician review."
                    if safety_result[
                        "safe_to_continue"
                    ]
                    else
                    "Workflow stopped by deterministic safety gate."
                ),

                "details": {
                    "action":
                        safety_result.get(
                            "action"
                        ),

                    "reasons":
                        safety_result.get(
                            "reasons",
                            []
                        )
                }
            },


            {
                "sequence": 7,
                "stage": "HUMAN_CHECKPOINT",
                "actor": "clinician",
                "state": "PENDING",
                "summary": (
                    "Clinician review required; "
                    "no autonomous patient-facing action."
                ),

                "details": {
                    "review_state":
                        "PENDING",

                    "allowed_path": (
                        "REVIEW"
                        if safety_result[
                            "safe_to_continue"
                        ]
                        else "REJECT_OR_ESCALATE_ONLY"
                    )
                }
            }

        ]


        return {
            "run_id":
                run_id,

            "patient_id":
                patient.patient_id,

            "workflow_status":
                workflow_status,

            "execution_trace":
                execution_trace,

            "hf_result":
                hf_result,

            "glycemic_result":
                gly_result,

            "safety_result":
                safety_result,

            "action_draft":
                action_draft,

            "review_state":
                "PENDING",

            "requires_human_review":
                True
        }
