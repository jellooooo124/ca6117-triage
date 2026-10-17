import json

from pathlib import Path

import uuid

from fastapi import (
    FastAPI,
    HTTPException,
    BackgroundTasks
)

from app.api.schemas import (
    TriageRequest,
    ReviewRequest
)

from app.services.resources import (
    load_retrievers
)

from app.services.llm import (
    LLMService,
    MockLLMService,
    ControlledFailureMockLLMService
)

from app.services.orchestrator import (
    Orchestrator
)

from app.services.review import (
    HumanReviewer
)

from app.services.store import (
    workflow_store
)

from app.services.audit import (
    write_audit_event,
    get_audit_events
)


app = FastAPI(
    title=(
        "Hospital-at-Home "
        "Agentic Triage API"
    ),

    version="1.0.0",

    description=(
        "Clinician-supervised multi-agent AI "
        "prototype for Heart Failure and "
        "Glycemic monitoring."
    )
)


ASSET_ROOT = Path(__file__).resolve().parents[2] / "assets"


REQUIRED_ASSETS = {
    "hf_chunks":
        ASSET_ROOT
        / "hf_chunks_clean.json",

    "hf_embeddings":
        ASSET_ROOT
        / "hf_embeddings_clean.npy",

    "hf_index":
        ASSET_ROOT
        / "hf_index_clean.faiss",

    "gly_chunks":
        ASSET_ROOT
        / "gly_chunks_clean.json",

    "gly_embeddings":
        ASSET_ROOT
        / "gly_embeddings_clean.npy",

    "gly_index":
        ASSET_ROOT
        / "gly_index_clean.faiss",
}


# ============================================================
# Audit snapshot helpers
# ============================================================

def _audit_patient_snapshot(
    patient
):

    if patient is None:

        return None


    if hasattr(
        patient,
        "model_dump"
    ):

        return patient.model_dump()


    if hasattr(
        patient,
        "dict"
    ):

        return patient.dict()


    if isinstance(
        patient,
        dict
    ):

        return patient


    return {
        "value":
            str(
                patient
            )
    }



def _audit_evidence_refs(
    result,
    specialist_key
):

    specialist = (
        result.get(
            specialist_key
        )
        or {}
    )


    rag = (
        specialist.get(
            "rag"
        )
        or {}
    )


    evidence = (
        rag.get(
            "evidence"
        )
        or []
    )


    return [
        {
            "source":
                item.get(
                    "source"
                ),

            "page":
                item.get(
                    "page"
                ),

            "chunk_id":
                item.get(
                    "chunk_id"
                ),
        }

        for item in evidence
    ]



def _audit_source_snapshot(
    result
):

    execution = (
        result.get(
            "execution"
        )
        or {}
    )


    return {
        "execution_mode":
            execution.get(
                "mode"
            ),

        "provider":
            execution.get(
                "provider"
            ),

        "heart_failure_rag":
            _audit_evidence_refs(
                result,
                "hf_result"
            ),

        "glycemic_rag":
            _audit_evidence_refs(
                result,
                "glycemic_result"
            ),

        "safety_engine":
            "deterministic_safety_engine",
    }



def _audit_output_snapshot(
    result
):

    safety = (
        result.get(
            "safety_result"
        )
        or {}
    )


    return {
        "workflow_status":
            result.get(
                "workflow_status"
            ),

        "safety_action":
            safety.get(
                "action"
            ),

        "safety_reasons":
            safety.get(
                "reasons",
                []
            ),

        "human_review_required":
            safety.get(
                "human_review_required"
            ),
    }



@app.get("/")
def root():

    return {
        "service":
            "Hospital-at-Home "
            "Agentic Triage API",

        "status":
            "running",

        "docs":
            "/docs"
    }



@app.get("/health")
def health():

    asset_status = {
        name:
            path.exists()

        for name, path
        in REQUIRED_ASSETS.items()
    }


    return {
        "status": (
            "healthy"
            if all(
                asset_status.values()
            )
            else "degraded"
        ),

        "backend":
            "FastAPI",

        "hf_rag_assets_ready":
            all([
                asset_status["hf_chunks"],
                asset_status["hf_embeddings"],
                asset_status["hf_index"]
            ]),

        "glycemic_rag_assets_ready":
            all([
                asset_status["gly_chunks"],
                asset_status["gly_embeddings"],
                asset_status["gly_index"]
            ]),

        "assets":
            asset_status
    }



@app.post(
    "/api/v1/triage"
)
def run_triage(
    request: TriageRequest
):

    hf_retriever, gly_retriever = (
        load_retrievers()
    )


    # ---------------------------------
    # Execution mode
    # ---------------------------------

    if (
        request.mode
        == "simulation"
    ):

        llm_service = (
            MockLLMService()
        )

        allow_api = False

        execution = {
            "mode":
                "simulation",

            "provider":
                "mock",

            "real_api_calls":
                0
        }


    else:

        llm_service = (
            LLMService(
                cache_path=str(
                    Path(__file__).resolve().parents[2]
                    / "runtime"
                    / "llm_cache.json"
                )
            )
        )

        allow_api = True

        execution = {
            "mode":
                "live",

            "provider":
                "gemini",

            "cache_first":
                True
        }


    # ---------------------------------
    # Execute workflow
    # ---------------------------------

    orchestrator = (
        Orchestrator(
            hf_retriever=
                hf_retriever,

            gly_retriever=
                gly_retriever,

            llm_service=
                llm_service
        )
    )


    result = orchestrator.run(
        patient=
            request.patient,

        allow_api=
            allow_api
    )


    result[
        "execution"
    ] = execution


    if hasattr(
        llm_service,
        "stats"
    ):
        result[
            "llm_stats"
        ] = (
            llm_service.stats()
        )


    # ---------------------------------
    # Persist runtime state
    # ---------------------------------

    workflow_store.save_run(
        result["run_id"],
        result
    )


    write_audit_event(
        run_id=
            result["run_id"],

        actor=
            "orchestrator",

        action=
            "triage_completed",

        details={
            "input":
                _audit_patient_snapshot(
                    request.patient
                ),

            "source":
                _audit_source_snapshot(
                    result
                ),

            "output":
                _audit_output_snapshot(
                    result
                ),

            "human_decision":
                None,

            # Legacy summary fields retained
            # for existing UI compatibility.
            "patient_id":
                result["patient_id"],

            "workflow_status":
                result[
                    "workflow_status"
                ],

            "safety_action":
                result[
                    "safety_result"
                ]["action"],

            "execution_mode":
                execution["mode"]
        }
    )


    return result



def _run_background_simulation(
    run_id,
    patient,
    simulation_profile="standard"
):
    """
    Execute the existing multi-agent workflow in
    the background while publishing real state
    transitions to WorkflowStore.
    """

    def publish(event):
        workflow_store.append_progress(
            run_id,
            event
        )


    try:

        hf_retriever, gly_retriever = (
            load_retrievers()
        )


        if (
            simulation_profile
            == "glycemic_model_error"
        ):

            llm_service = (
                ControlledFailureMockLLMService(
                    fail_on_call=2
                )
            )

        else:

            llm_service = (
                MockLLMService()
            )


        orchestrator = (
            Orchestrator(
                hf_retriever=
                    hf_retriever,

                gly_retriever=
                    gly_retriever,

                llm_service=
                    llm_service
            )
        )


        result = orchestrator.run(
            patient=patient,
            allow_api=False,
            run_id=run_id,
            progress_callback=publish
        )


        # Preserve live events generated while
        # the workflow was running.
        live_state = (
            workflow_store.get_run(
                run_id
            )
            or {}
        )

        progress_history = (
            live_state.get(
                "progress_history",
                []
            )
        )


        result[
            "progress_history"
        ] = progress_history

        result[
            "run_status"
        ] = result[
            "workflow_status"
        ]

        result[
            "current_stage"
        ] = "HUMAN_CHECKPOINT"

        result[
            "current_actor"
        ] = "clinician"

        result[
            "current_state"
        ] = "PENDING"

        result[
            "progress_percent"
        ] = 100

        result[
            "progress_message"
        ] = (
            "Automated processing is complete. "
            "The case is waiting for a "
            "clinician decision."
        )


        result[
            "execution"
        ] = {
            "mode":
                "simulation",

            "provider": (
                "controlled_failure_mock"
                if simulation_profile
                == "glycemic_model_error"
                else "mock"
            ),

            "simulation_profile":
                simulation_profile,

            "real_api_calls":
                0,

            "cache_first":
                True
        }


        workflow_store.save_run(
            run_id,
            result
        )


        write_audit_event(
            run_id=run_id,
            actor="orchestrator",
            action="triage_completed",
            details={
                "input":
                    _audit_patient_snapshot(
                        patient
                    ),

                "source":
                    _audit_source_snapshot(
                        result
                    ),

                "output":
                    _audit_output_snapshot(
                        result
                    ),

                "human_decision":
                    None,

                # Legacy summary fields retained
                # for existing UI compatibility.
                "patient_id":
                    result[
                        "patient_id"
                    ],

                "workflow_status":
                    result[
                        "workflow_status"
                    ],

                "safety_action":
                    result[
                        "safety_result"
                    ][
                        "action"
                    ],

                "execution_mode":
                    "simulation"
            }
        )


    except Exception as exc:

        workflow_store.append_progress(
            run_id,
            {
                "stage":
                    "SYSTEM_ERROR",

                "actor":
                    "workflow_service",

                "state":
                    "ERROR",

                "message":
                    (
                        "The analysis service could "
                        "not complete this workflow."
                    ),

                "progress_percent":
                    None
            }
        )


        workflow_store.update_run(
            run_id,
            {
                "run_status":
                    "FAILED",

                "workflow_status":
                    "FAILED",

                "error": {
                    "category":
                        "SYSTEM_ERROR",

                    "title":
                        "Analysis could not be completed",

                    "message":
                        (
                            "The workflow encountered "
                            "a system or service error. "
                            "No autonomous clinical "
                            "recommendation was released."
                        ),

                    "technical_code":
                        type(exc).__name__
                }
            }
        )


@app.post(
    "/api/v1/triage/start"
)
def start_triage(
    request: TriageRequest,
    background_tasks: BackgroundTasks
):
    """
    Start a real background workflow and return
    immediately so the frontend can observe its
    execution state.

    The coursework demo uses simulation mode.
    """

    if request.mode != "simulation":

        raise HTTPException(
            status_code=400,
            detail=(
                "Live background execution is "
                "not enabled in this prototype."
            )
        )


    run_id = (
        "run_"
        + uuid.uuid4().hex[:10]
    )


    workflow_store.save_run(
        run_id,
        {
            "run_id":
                run_id,

            "patient_id":
                request.patient.patient_id,

            "simulation_profile":
                request.simulation_profile,

            "run_status":
                "QUEUED",

            "workflow_status":
                "RUNNING",

            "current_stage":
                "QUEUED",

            "current_actor":
                "workflow_service",

            "current_state":
                "PENDING",

            "progress_percent":
                0,

            "progress_message":
                "Workflow queued for execution.",

            "progress_history":
                [],

            "review_state":
                "PENDING",

            "requires_human_review":
                True
        }
    )


    workflow_store.append_progress(
        run_id,
        {
            "stage":
                "QUEUED",

            "actor":
                "workflow_service",

            "state":
                "PENDING",

            "message":
                "Workflow queued for execution.",

            "progress_percent":
                0
        }
    )


    background_tasks.add_task(
        _run_background_simulation,
        run_id,
        request.patient,
        request.simulation_profile
    )


    return {
        "run_id":
            run_id,

        "patient_id":
            request.patient.patient_id,

        "run_status":
            "QUEUED",

        "current_stage":
            "QUEUED",

        "progress_percent":
            0,

        "message":
            "Workflow started."
    }


@app.get(
    "/api/v1/runs/{run_id}"
)
def get_run(
    run_id: str
):

    result = (
        workflow_store.get_run(
            run_id
        )
    )


    if result is None:

        raise HTTPException(
            status_code=404,
            detail="Run not found."
        )


    return result



@app.post(
    "/api/v1/review/{run_id}"
)
def review_run(
    run_id: str,
    request: ReviewRequest
):

    workflow_result = (
        workflow_store.get_run(
            run_id
        )
    )


    if workflow_result is None:

        raise HTTPException(
            status_code=404,
            detail="Run not found."
        )


    reviewer = HumanReviewer()


    try:

        review = reviewer.review(
            workflow_result=
                workflow_result,

            decision=
                request.decision,

            reviewer_id=
                request.reviewer_id,

            edited_draft=
                request.edited_draft
        )


    except PermissionError as e:

        write_audit_event(
            run_id=
                run_id,

            actor=
                request.reviewer_id,

            action=
                "review_blocked",

            details={
                "input": {
                    "run_id":
                        run_id,

                    "reviewer_id":
                        request.reviewer_id,

                    "requested_decision":
                        request.decision,

                    "edited_draft":
                        request.edited_draft,
                },

                "source": {
                    "control":
                        "HumanReviewer deterministic permission layer",

                    "safety_action":
                        (
                            workflow_result
                            .get(
                                "safety_result",
                                {}
                            )
                            .get(
                                "action"
                            )
                        ),
                },

                "output": {
                    "status":
                        "BLOCKED",

                    "reason":
                        str(e),
                },

                "human_decision":
                    request.decision,

                # Legacy fields retained.
                "decision":
                    request.decision,

                "reason":
                    str(e)
            }
        )


        raise HTTPException(
            status_code=409,
            detail=str(e)
        )


    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


    workflow_store.save_review(
        run_id,
        review
    )


    workflow_result[
        "review_state"
    ] = review["status"]


    write_audit_event(
        run_id=
            run_id,

        actor=
            request.reviewer_id,

        action=
            "human_review",

        details={
            "input": {
                "run_id":
                    run_id,

                "reviewer_id":
                    request.reviewer_id,

                "requested_decision":
                    request.decision,

                "edited_draft":
                    request.edited_draft,
            },

            "source": {
                "actor_type":
                    "clinician",

                "control":
                    "HumanReviewer permission layer",
            },

            "output": {
                "review_id":
                    review["review_id"],

                "status":
                    review["status"],

                "edited_draft":
                    review["edited_draft"],
            },

            "human_decision":
                review["decision"],

            # Legacy fields retained.
            "decision":
                review["decision"],

            "status":
                review["status"],

            "edited_draft":
                review["edited_draft"]
        }
    )


    return review



@app.get(
    "/api/v1/review/{run_id}"
)
def get_review(
    run_id: str
):

    review = (
        workflow_store.get_review(
            run_id
        )
    )


    if review is None:

        raise HTTPException(
            status_code=404,
            detail="Review not found."
        )


    return review



# ============================================================
# Evaluation artefacts
# ============================================================

@app.get(
    "/api/v1/evaluation"
)
def get_evaluation_results():

    evaluation_path = (
        Path(__file__)
        .resolve()
        .parents[2]
        / "evaluation"
        / "results"
        / "evaluation_results.json"
    )


    if not evaluation_path.exists():

        return {
            "status":
                "UNAVAILABLE",

            "message":
                "Evaluation artefact not found.",

            "artefact_path":
                str(
                    evaluation_path
                ),
        }


    with evaluation_path.open(
        "r",
        encoding="utf-8"
    ) as file:

        payload = json.load(
            file
        )


    return {
        "status":
            "READY",

        "evaluation":
            payload,

        "interpretation":
            (
                "Prototype-conformance evaluation only. "
                "These results do not establish clinical "
                "accuracy, clinical efficacy, or real-world safety."
            ),

        "source":
            "evaluation/results/evaluation_results.json",
    }



@app.get(
    "/api/v1/audit/{run_id}"
)
def get_run_audit(
    run_id: str
):

    run = (
        workflow_store.get_run(
            run_id
        )
    )


    if run is None:

        raise HTTPException(
            status_code=404,
            detail="Run not found."
        )


    events = (
        get_audit_events(
            run_id
        )
    )


    return {
        "run_id":
            run_id,

        "event_count":
            len(events),

        "events":
            events
    }
