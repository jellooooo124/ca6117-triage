import { useEffect, useState } from "react";
import {
  DEMO_PATIENT,
  getHealth,
  getAuditTrail,
  getEvaluationResults,
  startSimulationTriage,
  getRunStatus,
  submitReview,
  type AuditResponse,
  type EvaluationResponse,
  type HealthResponse,
  type LiveRunResponse,
  type PatientInput,
  type ReviewDecision,
  type ReviewResponse,
  type SimulationProfile,
  type TriageResponse,
} from "./api";


import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Database,
  FileSearch,
  HeartPulse,
  History,
  Home,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Utensils,
  Weight,
} from "lucide-react";


type AgentUiStatus =
  | "awaiting"
  | "waiting"
  | "running"
  | "complete"
  | "degraded"
  | "error";


type AgentSubstepState =
  | "pending"
  | "running"
  | "complete"
  | "degraded"
  | "error";


type AgentSubstep = {
  label: string;
  state: AgentSubstepState;
};


type AgenticPhase =
  | "PLAN"
  | "PERCEIVE"
  | "REASON"
  | "ACT"
  | "OVERSIGHT"
  | "WORKFLOW";


function getAgenticPhase(
  stage: string
): AgenticPhase {

  if (
    stage === "PLAN"
  ) {
    return "PLAN";
  }


  if (
    [
      "INTAKE",
      "DETERMINISTIC_TOOLS",
      "GUIDELINE_RETRIEVAL",
    ].includes(
      stage
    )
  ) {
    return "PERCEIVE";
  }


  if (
    stage ===
      "SPECIALIST_REASONING"
  ) {
    return "REASON";
  }


  if (
    [
      "SAFETY_GATE",
      "ACTION_DRAFT",
    ].includes(
      stage
    )
  ) {
    return "ACT";
  }


  if (
    stage ===
      "HUMAN_CHECKPOINT"
  ) {
    return "OVERSIGHT";
  }


  return "WORKFLOW";
}


type WorkflowStep = {
  label: string;
  detail: string;

  state:
    | "complete"
    | "active"
    | "pending"
    | "degraded";
};


const workflowBlueprint = [
  {
    label: "Intake",
    stage: "INTAKE",
    waitingDetail:
      "Waiting for patient monitoring data",
  },
  {
    label: "Validate",
    stage: "DETERMINISTIC_TOOLS",
    waitingDetail:
      "Waiting for deterministic checks",
  },
  {
    label: "Retrieve",
    stage: "GUIDELINE_RETRIEVAL",
    waitingDetail:
      "Waiting for guideline retrieval",
  },
  {
    label: "Specialists",
    stage: "SPECIALIST_REASONING",
    waitingDetail:
      "Waiting for specialist agents",
  },
  {
    label: "Safety",
    stage: "SAFETY_GATE",
    waitingDetail:
      "Waiting for safety evaluation",
  },
  {
    label: "Review",
    stage: "HUMAN_CHECKPOINT",
    waitingDetail:
      "Waiting for clinician checkpoint",
  },
] as const;


function buildWorkflowSteps(
  triage: TriageResponse | null
): WorkflowStep[] {

  if (
    !triage?.execution_trace?.length
  ) {

    return workflowBlueprint.map(
      (step, index) => ({
        label: step.label,

        detail:
          index === 0
            ? "Run analysis to start workflow"
            : step.waitingDetail,

        state:
          index === 0
            ? "active"
            : "pending",
      })
    );
  }


  const events = new Map(
    triage.execution_trace.map(
      (event) => [
        event.stage,
        event,
      ]
    )
  );


  const specialistDegraded =
    [
      triage.hf_result
        ?.reasoning
        ?.reasoning_status,

      triage.glycemic_result
        ?.reasoning
        ?.reasoning_status,
    ].some(
      (status) =>
        status != null
        &&
        status !== "OK"
    );


  return workflowBlueprint.map(
    (step) => {

      const event =
        events.get(
          step.stage
        );


      if (!event) {

        return {
          label:
            step.label,

          detail:
            step.waitingDetail,

          state:
            "pending",
        };
      }


      // -----------------------------------------------------
      // Specialist stage must reflect degraded specialist
      // reasoning rather than appearing fully complete.
      // -----------------------------------------------------

      if (
        step.stage ===
          "SPECIALIST_REASONING"
        &&
        specialistDegraded
      ) {

        return {
          label:
            step.label,

          detail:
            (
              "One or more specialist reasoning "
              + "outputs degraded; safety evaluation required."
            ),

          state:
            "degraded",
        };
      }


      const state:
        WorkflowStep["state"] =
          event.state === "PENDING"
          ||
          event.state === "STOPPED"
            ? "active"
            : "complete";


      return {
        label:
          step.label,

        detail:
          event.summary,

        state,
      };
    }
  );
}



function MetricCard({
  icon,
  label,
  value,
  unit,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div className="rounded-xl bg-slate-50 p-2.5">
          {icon}
        </div>

        <MoreHorizontal className="h-5 w-5 text-slate-300" />
      </div>

      <div className="text-sm font-medium text-slate-500">
        {label}
      </div>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-slate-900">
          {value}
        </span>

        {unit && (
          <span className="text-sm text-slate-500">
            {unit}
          </span>
        )}
      </div>

      <div className="mt-2 text-xs text-slate-400">
        {hint}
      </div>
    </div>
  );
}


function AgentCard({
  title,
  subtitle,
  icon,
  evidence,
  evidenceText,
  evidenceQuery,
  summary,
  source,
  reasoningStatus,
  status,
  substeps,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  evidence: string;
  evidenceText: string;
  evidenceQuery: string;
  summary: string;
  source: string;
  reasoningStatus: string;
  status: AgentUiStatus;
  substeps: AgentSubstep[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">

      <div className="flex items-start justify-between gap-4">

        <div className="flex items-center gap-3">

          <div className="rounded-xl bg-slate-50 p-3">
            {icon}
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">
              {title}
            </h3>

            <p className="mt-0.5 text-sm text-slate-500">
              {subtitle}
            </p>
          </div>

        </div>

        <div
          className={[
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",

            status === "complete"
              ? "bg-emerald-50 text-emerald-700"

              : status === "running"
              ? "bg-indigo-50 text-indigo-700"

              : status === "degraded"
              ? "bg-amber-50 text-amber-700"

              : status === "error"
              ? "bg-rose-50 text-rose-700"

              : "bg-slate-100 text-slate-500",

          ].join(" ")}
        >

          {status === "complete" ? (
            <Check className="h-3.5 w-3.5" />

          ) : status === "running" ? (
            <Activity className="h-3.5 w-3.5" />

          ) : status === "degraded"
          || status === "error" ? (
            <AlertTriangle className="h-3.5 w-3.5" />

          ) : (
            <Clock3 className="h-3.5 w-3.5" />
          )}


          {status === "complete"
            ? "Complete"

            : status === "running"
            ? "Running"

            : status === "degraded"
            ? "Degraded"

            : status === "error"
            ? "Error"

            : status === "waiting"
            ? "Waiting"

            : "Awaiting analysis"}

        </div>

      </div>


      {/* Real backend specialist substages */}
      <div className="mt-5">

        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Agent execution
        </div>


        <div className="grid grid-cols-3 gap-2">

          {substeps.map(
            (step) => (

              <div
                key={step.label}
                className={[
                  "rounded-xl border px-3 py-3",

                  step.state === "complete"
                    ? "border-emerald-100 bg-emerald-50/70"

                    : step.state === "running"
                    ? "border-indigo-200 bg-indigo-50"

                    : step.state === "degraded"
                    ? "border-amber-200 bg-amber-50"

                    : step.state === "error"
                    ? "border-rose-200 bg-rose-50"

                    : "border-slate-100 bg-slate-50",

                ].join(" ")}
              >

                <div className="flex items-center gap-1.5">

                  <div
                    className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",

                      step.state === "complete"
                        ? "bg-emerald-100 text-emerald-700"

                        : step.state === "running"
                        ? "bg-indigo-100 text-indigo-700"

                        : step.state === "degraded"
                        ? "bg-amber-100 text-amber-700"

                        : step.state === "error"
                        ? "bg-rose-100 text-rose-700"

                        : "bg-slate-200 text-slate-400",

                    ].join(" ")}
                  >

                    {step.state === "complete" ? (
                      <Check className="h-3 w-3" />

                    ) : step.state === "running" ? (
                      <Activity className="h-3 w-3" />

                    ) : step.state === "degraded"
                    || step.state === "error" ? (
                      <AlertTriangle className="h-3 w-3" />

                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}

                  </div>


                  <span
                    className={[
                      "truncate text-xs font-semibold",

                      step.state === "complete"
                        ? "text-emerald-800"

                        : step.state === "running"
                        ? "text-indigo-800"

                        : step.state === "degraded"
                        ? "text-amber-800"

                        : step.state === "error"
                        ? "text-rose-800"

                        : "text-slate-500",

                    ].join(" ")}
                  >
                    {step.label}
                  </span>

                </div>


                <div className="mt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">

                  {step.state === "pending"
                    ? "Pending"

                    : step.state === "running"
                    ? "Running"

                    : step.state === "complete"
                    ? "Complete"

                    : step.state === "degraded"
                    ? "Degraded"

                    : "Error"}

                </div>

              </div>

            )
          )}

        </div>

      </div>


      <div className="mt-6 rounded-xl bg-slate-50/80 p-4">

        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Sparkles className="h-3.5 w-3.5" />
          Agent interpretation
        </div>

        <p className="text-sm leading-6 text-slate-700">
          {summary}
        </p>

      </div>


      <details className="group mt-4 rounded-xl border border-slate-100 bg-white">

        <summary className="flex cursor-pointer list-none items-start gap-3 p-4">

          <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />


          <div className="min-w-0 flex-1">

            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Grounding evidence
            </div>

            <div className="mt-1 text-sm font-medium text-slate-800">
              {evidence}
            </div>

            <div className="mt-1 truncate text-xs text-slate-400">
              {source}
            </div>

          </div>


          <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-slate-300 transition-transform group-open:rotate-90" />

        </summary>


        <div className="border-t border-slate-100 px-4 pb-4 pt-4">

          <div className="grid gap-4 md:grid-cols-2">

            <div>

              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Used by
              </div>

              <div className="mt-1 text-xs font-medium text-slate-700">
                {title}
              </div>

            </div>


            <div>

              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Reasoning status
              </div>

              <div className="mt-1 text-xs font-medium text-slate-700">
                {reasoningStatus}
              </div>

            </div>

          </div>


          <div className="mt-4">

            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Retrieval query
            </div>

            <div className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              {evidenceQuery}
            </div>

          </div>


          <div className="mt-4">

            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Retrieved evidence excerpt
            </div>

            <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-700">
              {evidenceText}
            </div>

          </div>


          <div className="mt-3 text-[10px] leading-4 text-slate-400">
            Evidence shown here is retrieved from the backend RAG payload
            and is not generated by the frontend.
          </div>

        </div>

      </details>

    </div>
  );
}


function sleep(
  milliseconds: number
) {

  return new Promise<void>(
    (resolve) =>
      window.setTimeout(
        resolve,
        milliseconds
      )
  );
}


function workflowStageLabel(
  stage?: string
) {

  const labels:
    Record<string, string> = {

    QUEUED:
      "Workflow queued",

    INITIALIZING:
      "Preparing workflow",

    HEART_FAILURE_AGENT:
      "Heart Failure Agent",

    GLYCEMIC_AGENT:
      "Glycemic Agent",

    SAFETY_GATE:
      "Safety Gate",

    ACTION_DRAFT:
      "Preparing clinician review",

    HUMAN_CHECKPOINT:
      "Clinician checkpoint",

    SYSTEM_ERROR:
      "Workflow service",
  };


  if (!stage) {
    return "Preparing analysis";
  }


  return (
    labels[stage]
    ?? stage.replace(
      /_/g,
      " "
    )
  );
}


function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);


  const [activeView, setActiveView] =
    useState<
      | "patient"
      | "evaluation"
    >(
      "patient"
    );


  const [evaluation, setEvaluation] =
    useState<EvaluationResponse | null>(
      null
    );

  const [evaluationLoading, setEvaluationLoading] =
    useState(false);

  const [evaluationError, setEvaluationError] =
    useState<string | null>(null);

  const [triage, setTriage] =
    useState<TriageResponse | null>(null);


  const [liveRun, setLiveRun] =
    useState<LiveRunResponse | null>(null);

  const [triageLoading, setTriageLoading] =
    useState(false);

  const [triageError, setTriageError] =
    useState<string | null>(null);

  const [review, setReview] =
    useState<ReviewResponse | null>(null);

  const [reviewLoading, setReviewLoading] =
    useState(false);

  const [reviewError, setReviewError] =
    useState<string | null>(null);

  const [showEditPanel, setShowEditPanel] =
    useState(false);

  const [editedDraft, setEditedDraft] =
    useState("");

  const [audit, setAudit] =
    useState<AuditResponse | null>(null);

  const [auditLoading, setAuditLoading] =
    useState(false);

  const [auditError, setAuditError] =
    useState<string | null>(null);

  const [scenario, setScenario] =
    useState<
      | "standard"
      | "safe_stop"
      | "provider_failure"
    >(
      "standard"
    );

  const [patientInput, setPatientInput] =
    useState<PatientInput>({
      ...DEMO_PATIENT,
    });

  const [showPatientInput, setShowPatientInput] =
    useState(false);

  useEffect(() => {
    let mounted = true;

    getHealth()
      .then((data) => {
        if (mounted) {
          setHealth(data);
          setHealthError(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setHealth(null);
          setHealthError(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const backendHealthy =
    health?.status === "healthy";


  async function loadEvaluation() {

    setEvaluationLoading(
      true
    );

    setEvaluationError(
      null
    );


    try {

      const result =
        await getEvaluationResults();

      setEvaluation(
        result
      );


    } catch (error) {

      setEvaluationError(
        error instanceof Error
          ? error.message
          : "Unable to load evaluation artefacts."
      );


    } finally {

      setEvaluationLoading(
        false
      );

    }
  }


  function openPatientSection(
    sectionId?: string
  ) {

    setActiveView(
      "patient"
    );


    if (sectionId) {

      window.setTimeout(
        () => {

          document
            .getElementById(
              sectionId
            )
            ?.scrollIntoView({
              behavior:
                "smooth",

              block:
                "start",
            });

        },
        50
      );

    } else {

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

    }
  }


  function openEvaluation() {

    setActiveView(
      "evaluation"
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });


    if (
      evaluation === null
      &&
      !evaluationLoading
    ) {

      void loadEvaluation();

    }
  }


  async function refreshAudit(
    runId: string
  ) {

    setAuditLoading(true);
    setAuditError(null);

    try {

      const result =
        await getAuditTrail(runId);

      setAudit(result);

    } catch (error) {

      setAuditError(
        error instanceof Error
          ? error.message
          : "Unknown audit error"
      );

    } finally {

      setAuditLoading(false);

    }
  }


  async function handleNewAnalysis() {

    setTriageLoading(true);
    setTriageError(null);

    setTriage(null);
    setLiveRun(null);

    setReview(null);
    setReviewError(null);
    setShowEditPanel(false);
    setEditedDraft("");

    setAudit(null);
    setAuditError(null);


    try {

      // ---------------------------------------
      // Start background workflow
      // ---------------------------------------

      const simulationProfile:
        SimulationProfile =
          scenario ===
            "provider_failure"
            ? "glycemic_model_error"
            : "standard";


      const started =
        await startSimulationTriage(
          patient,
          simulationProfile
        );


      let latest:
        LiveRunResponse = {
          ...started,

          workflow_status:
            "RUNNING",

          progress_history:
            [],
        };


      setLiveRun(
        latest
      );


      // ---------------------------------------
      // Poll backend real workflow state
      // ---------------------------------------

      for (
        let attempt = 0;
        attempt < 600;
        attempt += 1
      ) {

        await sleep(
          250
        );


        latest =
          await getRunStatus(
            started.run_id
          );


        setLiveRun(
          latest
        );


        if (
          latest.run_status ===
          "FAILED"
        ) {

          const message =
            latest.error?.message
            ?? (
              "The analysis service could "
              + "not complete the workflow. "
              + "No autonomous clinical "
              + "recommendation was released."
            );


          throw new Error(
            message
          );
        }


        if (
          latest.run_status ===
            "READY_FOR_HUMAN_REVIEW"
          ||
          latest.run_status ===
            "SAFE_STOP"
        ) {

          setTriage(
            latest as TriageResponse
          );


          await refreshAudit(
            started.run_id
          );


          return;
        }
      }


      throw new Error(
        "The analysis is taking longer than expected. "
        + "The workflow status could not be confirmed."
      );


    } catch (error) {

      const rawMessage =
        error instanceof Error
          ? error.message
          : "Unknown workflow error";


      const friendlyMessage =
        rawMessage.includes(
          "Failed to fetch"
        )
          ? (
              "Connection lost. The browser "
              + "cannot currently reach the "
              + "clinical workflow service."
            )

          : rawMessage;


      setTriageError(
        friendlyMessage
      );


    } finally {

      setTriageLoading(
        false
      );
    }
  }


  async function handleReview(
    decision: ReviewDecision
  ) {

    if (!triage) {
      return;
    }


    if (
      decision === "EDIT" &&
      !editedDraft.trim()
    ) {

      setReviewError(
        "Enter an edited clinician draft before submitting."
      );

      return;
    }


    setReviewLoading(true);
    setReviewError(null);


    try {

      const result =
        await submitReview(
          triage.run_id,
          decision,
          "demo_clinician",
          decision === "EDIT"
            ? editedDraft.trim()
            : undefined
        );


      setReview(result);
      setShowEditPanel(false);

      await refreshAudit(
        triage.run_id
      );


    } catch (error) {

      setReviewError(
        error instanceof Error
          ? error.message
          : "Unknown review error"
      );


    } finally {

      setReviewLoading(false);

    }
  }


  function clearWorkflowResults() {

    setTriage(null);
    setLiveRun(null);
    setTriageError(null);

    setReview(null);
    setReviewError(null);

    setAudit(null);
    setAuditError(null);

    setShowEditPanel(false);
    setEditedDraft("");
  }


  function updatePatient(
    patch: Partial<PatientInput>
  ) {

    setPatientInput(
      (current) => ({
        ...current,
        ...patch,
      })
    );

    // Prevent stale AI/safety/review results from
    // remaining visible after patient data changes.
    clearWorkflowResults();
  }


  function selectScenario(
    nextScenario:
      | "standard"
      | "safe_stop"
      | "provider_failure"
  ) {

    setScenario(nextScenario);

    clearWorkflowResults();


    if (
      nextScenario ===
        "safe_stop"
    ) {

      setPatientInput({
        ...DEMO_PATIENT,

        patient_id:
          "SYN_SAFE_STOP_001",

        wearable_missing:
          true,
      });


    } else if (
      nextScenario ===
        "provider_failure"
    ) {

      setPatientInput({
        ...DEMO_PATIENT,

        patient_id:
          "SYN_PROVIDER_FAILURE_001",

        wearable_missing:
          false,
      });


    } else {

      setPatientInput({
        ...DEMO_PATIENT,
      });

    }
  }


  const reviewCompleted =
    review !== null;


  const safeStop =
    triage?.safety_result.action ===
    "SAFE_STOP";


  const patient =
    patientInput;


  const safety =
    triage?.safety_result;


  const hfEvidence =
    triage?.hf_result.rag.evidence?.[0];


  const glyEvidence =
    triage?.glycemic_result.rag.evidence?.[0];


  const weightChangeKg =
    (
      patient.weight_kg_today !== undefined
      &&
      patient.weight_kg_prior !== undefined
    )
      ? (
          patient.weight_kg_today
          - patient.weight_kg_prior
        )
      : null;


  const workflowSteps =
    buildWorkflowSteps(
      triage
    );


  const progressHistory =
    liveRun?.progress_history ?? [];


  function getAgentStatus(
    stage:
      | "HEART_FAILURE_AGENT"
      | "GLYCEMIC_AGENT"
  ): AgentUiStatus {

    // -------------------------------------------------------
    // Final result:
    // infer overall specialist status from the REAL
    // backend substage history.
    //
    // This avoids incorrectly labelling a specialist
    // "Complete" when its reasoning degraded.
    // -------------------------------------------------------

    if (triage) {

      const specialistStages =
        stage === "HEART_FAILURE_AGENT"
          ? [
              "HEART_FAILURE_TOOLS",
              "HEART_FAILURE_RETRIEVAL",
              "HEART_FAILURE_REASONING",
            ]
          : [
              "GLYCEMIC_TOOLS",
              "GLYCEMIC_RETRIEVAL",
              "GLYCEMIC_REASONING",
            ];


      const specialistEvents =
        progressHistory.filter(
          (event) =>
            specialistStages.includes(
              event.stage
            )
        );


      const hasError =
        specialistEvents.some(
          (event) =>
            event.state === "ERROR"
        );


      if (hasError) {
        return "error";
      }


      const hasDegraded =
        specialistEvents.some(
          (event) =>
            event.state === "DEGRADED"
            ||
            event.state === "SKIPPED"
            ||
            event.state === "STOPPED"
        );


      if (hasDegraded) {
        return "degraded";
      }


      return "complete";
    }


    // Workflow has never been started.
    if (!liveRun) {
      return "awaiting";
    }


    const completed =
      progressHistory.some(
        (event) =>
          event.stage === stage
          &&
          event.state === "COMPLETED"
      );


    if (completed) {
      return "complete";
    }


    const running =
      liveRun.current_stage === stage
      &&
      liveRun.current_state === "RUNNING";


    if (running) {
      return "running";
    }


    const started =
      progressHistory.some(
        (event) =>
          event.stage === stage
          &&
          event.state === "RUNNING"
      );


    if (
      liveRun.run_status === "FAILED"
      &&
      started
    ) {
      return "error";
    }


    return "waiting";
  }


  const hfAgentStatus =
    getAgentStatus(
      "HEART_FAILURE_AGENT"
    );


  const glyAgentStatus =
    getAgentStatus(
      "GLYCEMIC_AGENT"
    );


  function getSubstepState(
    stage: string
  ): AgentSubstepState {

    if (!liveRun) {
      return "pending";
    }


    let latestState:
      string | undefined;


    for (
      const event
      of progressHistory
    ) {

      if (
        event.stage === stage
      ) {

        latestState =
          event.state;
      }
    }


    if (
      latestState === "COMPLETED"
      || latestState === "PASSED"
    ) {

      return "complete";
    }


    if (
      latestState === "RUNNING"
    ) {

      return "running";
    }


    if (
      latestState === "DEGRADED"
      || latestState === "SKIPPED"
      || latestState === "STOPPED"
    ) {

      return "degraded";
    }


    if (
      latestState === "ERROR"
    ) {

      return "error";
    }


    return "pending";
  }


  const hfSubsteps:
    AgentSubstep[] = [

    {
      label: "Tools",
      state:
        getSubstepState(
          "HEART_FAILURE_TOOLS"
        ),
    },

    {
      label: "Evidence",
      state:
        getSubstepState(
          "HEART_FAILURE_RETRIEVAL"
        ),
    },

    {
      label: "Reasoning",
      state:
        getSubstepState(
          "HEART_FAILURE_REASONING"
        ),
    },
  ];


  const glySubsteps:
    AgentSubstep[] = [

    {
      label: "Tools",
      state:
        getSubstepState(
          "GLYCEMIC_TOOLS"
        ),
    },

    {
      label: "Evidence",
      state:
        getSubstepState(
          "GLYCEMIC_RETRIEVAL"
        ),
    },

    {
      label: "Reasoning",
      state:
        getSubstepState(
          "GLYCEMIC_REASONING"
        ),
    },
  ];


  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">

      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">

        <div className="flex h-20 items-center border-b border-slate-100 px-6">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>

          <div className="ml-3">
            <div className="font-semibold tracking-tight">
              HomeCare AI
            </div>

            <div className="text-xs text-slate-400">
              Clinical Intelligence
            </div>
          </div>

        </div>


        <nav className="px-4 py-6">

          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Workspace
          </div>


          <button
            type="button"
            onClick={() =>
              openPatientSection()
            }
            className={[
              "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition",

              activeView === "patient"
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-50",

            ].join(" ")}
          >
            <Home className="h-4 w-4" />
            Patient Review
          </button>


          <button
            type="button"
            onClick={() =>
              openPatientSection(
                "audit-history"
              )
            }
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-500 transition hover:bg-slate-50"
          >
            <History className="h-4 w-4" />
            Audit History
          </button>


          <button
            type="button"
            onClick={() =>
              openPatientSection(
                "evidence-grounding"
              )
            }
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-500 transition hover:bg-slate-50"
          >
            <Database className="h-4 w-4" />
            Evidence & Grounding
          </button>


          <button
            type="button"
            onClick={
              openEvaluation
            }
            className={[
              "mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition",

              activeView === "evaluation"
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-50",

            ].join(" ")}
          >
            <Check className="h-4 w-4" />
            Evaluation
          </button>

        </nav>


        <div className="absolute bottom-0 w-full border-t border-slate-100 p-4">

          <div className="rounded-xl bg-amber-50 p-4">

            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Prototype
            </div>

            <p className="mt-2 text-xs leading-5 text-amber-700/80">
              Synthetic demonstration data only.
              Clinician review is mandatory.
            </p>

          </div>

        </div>

      </aside>


      {/* Main */}
      <main className="lg:ml-64">

        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">

          <div className="flex h-20 items-center justify-between px-6 lg:px-10">

            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                Hospital-at-Home
              </div>

              <h1 className="mt-1 text-xl font-semibold tracking-tight">
                Agentic Triage Dashboard
              </h1>
            </div>


            <div className="flex items-center gap-4">

              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 sm:flex">
                <span
                  className={[
                    "h-2 w-2 rounded-full",
                    healthError
                      ? "bg-rose-500"
                      : health === null
                      ? "bg-amber-400 animate-pulse"
                      : backendHealthy
                      ? "bg-emerald-500"
                      : "bg-amber-500",
                  ].join(" ")}
                />

                {healthError
                  ? "Backend unavailable"
                  : health === null
                  ? "Checking backend..."
                  : backendHealthy
                  ? "Backend healthy"
                  : "Backend degraded"}
              </div>

              <div className="h-8 w-px bg-slate-200" />

              <div className="flex items-center gap-2">
                <CircleUserRound className="h-8 w-8 text-slate-400" />

                <div className="hidden sm:block">
                  <div className="text-sm font-medium">
                    Demo Clinician
                  </div>
                  <div className="text-xs text-slate-400">
                    Reviewer
                  </div>
                </div>
              </div>

            </div>

          </div>

        </header>


        {activeView === "evaluation" && (

          <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-10">

            {/* Evaluation heading */}
            <section className="mb-8">

              <div className="mb-2 flex items-center gap-2">

                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                  Prototype evaluation
                </span>

                {evaluation?.evaluation && (

                  <span className="text-xs text-slate-400">
                    Source: {evaluation.source}
                  </span>

                )}

              </div>


              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">

                <div>

                  <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                    Evaluation Artefacts
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    Formal prototype-conformance tests covering
                    end-to-end safety, dependency failures,
                    multi-agent conflict, and human oversight.
                  </p>

                </div>


                <button
                  type="button"
                  onClick={() =>
                    void loadEvaluation()
                  }
                  disabled={
                    evaluationLoading
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {evaluationLoading
                    ? "Refreshing..."
                    : "Refresh artefact"}
                </button>

              </div>

            </section>


            {/* Loading */}
            {evaluationLoading && !evaluation && (

              <section className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
                Loading formal evaluation artefacts...
              </section>

            )}


            {/* Error */}
            {evaluationError && (

              <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
                {evaluationError}
              </section>

            )}


            {/* Unavailable */}
            {evaluation?.status === "UNAVAILABLE" && (

              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
                {evaluation.message
                  ?? "Evaluation artefact is unavailable."}
              </section>

            )}


            {evaluation?.status === "READY"
              && evaluation.evaluation && (

              <>

                {/* Summary cards */}
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">

                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Test cases
                    </div>

                    <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                      {evaluation.evaluation.total_tests}
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                      Formal automated checks
                    </div>

                  </div>


                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">

                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600">
                      Passed
                    </div>

                    <div className="mt-2 text-3xl font-semibold tracking-tight text-emerald-900">
                      {evaluation.evaluation.passed}
                      /
                      {evaluation.evaluation.total_tests}
                    </div>

                    <div className="mt-1 text-xs text-emerald-700/70">
                      {evaluation.evaluation.pass_rate_percent}% prototype-conformance pass rate
                    </div>

                  </div>


                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">

                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Failed
                    </div>

                    <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                      {evaluation.evaluation.failed}
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                      Failed formal checks
                    </div>

                  </div>


                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">

                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Live API calls
                    </div>

                    <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                      {evaluation.evaluation.gemini_api_calls}
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                      Evaluation execution
                    </div>

                  </div>

                </section>


                {/* Disclaimer */}
                <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">

                  <div className="flex items-start gap-3">

                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />

                    <div>

                      <div className="text-sm font-semibold text-amber-900">
                        Evaluation scope
                      </div>

                      <p className="mt-1 text-sm leading-6 text-amber-800/80">
                        {evaluation.interpretation}
                      </p>

                    </div>

                  </div>

                </section>


                {/* Category coverage */}
                <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">

                  <div>

                    <h3 className="text-lg font-semibold tracking-tight text-slate-950">
                      Coverage
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      Safety and governance behaviours represented in the formal suite.
                    </p>

                  </div>


                  <div className="mt-5 flex flex-wrap gap-2">

                    {Array.from(
                      new Set(
                        evaluation.evaluation.results.map(
                          (row) =>
                            row.category
                        )
                      )
                    ).map(
                      (category) => (

                        <span
                          key={category}
                          className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700"
                        >
                          {category}
                        </span>

                      )
                    )}

                  </div>

                </section>


                {/* Test table */}
                <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-sm">

                  <div className="border-b border-slate-100 p-6">

                    <h3 className="text-lg font-semibold tracking-tight text-slate-950">
                      Formal test cases
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      Expected behaviour is compared with the recorded prototype outcome.
                    </p>

                  </div>


                  <div className="overflow-x-auto">

                    <table className="min-w-[1100px] w-full border-collapse">

                      <thead>

                        <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">

                          <th className="px-5 py-3">
                            Test
                          </th>

                          <th className="px-5 py-3">
                            Category
                          </th>

                          <th className="px-5 py-3">
                            Scenario
                          </th>

                          <th className="px-5 py-3">
                            Expected
                          </th>

                          <th className="px-5 py-3">
                            Actual
                          </th>

                          <th className="px-5 py-3">
                            Safety reason
                          </th>

                          <th className="px-5 py-3">
                            Result
                          </th>

                        </tr>

                      </thead>


                      <tbody>

                        {evaluation.evaluation.results.map(
                          (row) => (

                            <tr
                              key={row.test_id}
                              className="border-b border-slate-100 align-top"
                            >

                              <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-700">
                                {row.test_id}
                              </td>

                              <td className="px-5 py-4 text-xs text-slate-500">
                                {row.category}
                              </td>

                              <td className="max-w-[240px] px-5 py-4 text-xs leading-5 text-slate-700">
                                {row.scenario}
                              </td>

                              <td className="max-w-[260px] px-5 py-4 text-xs leading-5 text-slate-500">
                                {row.expected}
                              </td>

                              <td className="px-5 py-4 text-xs font-medium text-slate-700">
                                {row.actual}
                              </td>

                              <td className="max-w-[260px] px-5 py-4 text-xs leading-5 text-slate-500">
                                {row.safety_reasons}
                              </td>

                              <td className="px-5 py-4">

                                <span
                                  className={[
                                    "rounded-full px-2.5 py-1 text-[11px] font-semibold",

                                    row.result === "PASS"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-rose-100 text-rose-700",

                                  ].join(" ")}
                                >
                                  {row.result}
                                </span>

                              </td>

                            </tr>

                          )
                        )}

                      </tbody>

                    </table>

                  </div>

                </section>


                {/* Provenance */}
                <section className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4">

                  <div className="text-xs font-semibold text-indigo-800">
                    Artefact provenance
                  </div>

                  <div className="mt-1 text-xs leading-5 text-indigo-700">
                    Suite: {evaluation.evaluation.suite}
                    {" · "}
                    Mode: {evaluation.evaluation.execution_mode}
                    {" · "}
                    Source: {evaluation.source}
                  </div>

                </section>

              </>

            )}

          </div>

        )}


        <div
          className={[
            "mx-auto max-w-[1500px] px-6 py-8 lg:px-10",

            activeView === "patient"
              ? "block"
              : "hidden",

          ].join(" ")}
        >

          {/* Patient heading */}
          <section className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">

            <div>

              <div className="mb-2 flex items-center gap-2">

                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                  {patient.patient_id}
                </span>

                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  {patient.data_age_hours !== undefined
                    ? `Data age: ${patient.data_age_hours} h`
                    : "Data age unavailable"}
                </span>

              </div>

              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                Patient Review
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Multi-agent review of home-monitoring data,
                guideline evidence, deterministic safety checks,
                and clinician oversight.
              </p>

            </div>


            <div className="flex items-center gap-3">

              <button
                onClick={() =>
                  setShowPatientInput(
                    (current) => !current
                  )
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm"
              >
                {showPatientInput
                  ? "Close patient input"
                  : "Edit patient input"}
              </button>

              <button
                onClick={handleNewAnalysis}
                disabled={triageLoading || !backendHealthy}
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {triageLoading
                  ? "Running agents..."

                  : scenario ===
                    "safe_stop"
                  ? "Run SAFE_STOP analysis"

                  : scenario ===
                    "provider_failure"
                  ? "Run provider failure"

                  : "New analysis"}

                <ArrowRight className="h-4 w-4" />
              </button>

            </div>

          </section>


          {/* Editable patient input */}
          {showPatientInput && (

            <section className="mb-6 rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm">

              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">

                <div>

                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                    Patient input
                  </h2>

                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                    Edit synthetic home-monitoring data below.
                    Changes are not analysed until you explicitly
                    run the workflow.
                  </p>

                </div>

                <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                  Synthetic demo data
                </span>

              </div>


              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">

                <label className="block">

                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Patient ID
                  </span>

                  <input
                    value={patient.patient_id}
                    onChange={(event) =>
                      updatePatient({
                        patient_id:
                          event.target.value,
                      })
                    }
                    disabled={
                      scenario === "safe_stop"
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50 disabled:opacity-60"
                  />

                </label>


                <label className="block">

                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Current weight (kg)
                  </span>

                  <input
                    type="number"
                    step="0.1"
                    value={
                      patient.weight_kg_today
                      ?? ""
                    }
                    onChange={(event) =>
                      updatePatient({
                        weight_kg_today:
                          event.target.value === ""
                            ? undefined
                            : Number(
                                event.target.value
                              ),
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                  />

                </label>


                <label className="block">

                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Prior weight (kg)
                  </span>

                  <input
                    type="number"
                    step="0.1"
                    value={
                      patient.weight_kg_prior
                      ?? ""
                    }
                    onChange={(event) =>
                      updatePatient({
                        weight_kg_prior:
                          event.target.value === ""
                            ? undefined
                            : Number(
                                event.target.value
                              ),
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                  />

                </label>


                <label className="block">

                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Glucose (mmol/L)
                  </span>

                  <input
                    type="number"
                    step="0.1"
                    value={
                      patient.glucose_mmol_l
                      ?? ""
                    }
                    onChange={(event) =>
                      updatePatient({
                        glucose_mmol_l:
                          event.target.value === ""
                            ? undefined
                            : Number(
                                event.target.value
                              ),
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                  />

                </label>


                <label className="block">

                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Systolic BP (mmHg)
                  </span>

                  <input
                    type="number"
                    value={
                      patient.systolic_bp
                      ?? ""
                    }
                    onChange={(event) =>
                      updatePatient({
                        systolic_bp:
                          event.target.value === ""
                            ? undefined
                            : Number(
                                event.target.value
                              ),
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                  />

                </label>


                <label className="block">

                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Heart rate (bpm)
                  </span>

                  <input
                    type="number"
                    value={
                      patient.heart_rate_bpm
                      ?? ""
                    }
                    onChange={(event) =>
                      updatePatient({
                        heart_rate_bpm:
                          event.target.value === ""
                            ? undefined
                            : Number(
                                event.target.value
                              ),
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                  />

                </label>


                <label className="block">

                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Data age (hours)
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={
                      patient.data_age_hours
                      ?? ""
                    }
                    onChange={(event) =>
                      updatePatient({
                        data_age_hours:
                          event.target.value === ""
                            ? undefined
                            : Number(
                                event.target.value
                              ),
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                  />

                </label>


                <label className="block">

                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Wearable status
                  </span>

                  <div className="mt-2 flex h-[42px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3">

                    <input
                      type="checkbox"
                      checked={
                        patient.wearable_missing
                      }
                      onChange={(event) =>
                        updatePatient({
                          wearable_missing:
                            event.target.checked,
                        })
                      }
                      disabled={
                        scenario === "safe_stop"
                      }
                      className="h-4 w-4"
                    />

                    <span className="ml-2 text-sm text-slate-700">
                      Wearable data missing
                    </span>

                  </div>

                </label>

              </div>


              <div className="mt-4 grid gap-4 lg:grid-cols-2">

                <label className="block">

                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Symptoms
                  </span>

                  <textarea
                    rows={4}
                    value={
                      patient.symptoms_text
                    }
                    onChange={(event) =>
                      updatePatient({
                        symptoms_text:
                          event.target.value,
                      })
                    }
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                  />

                </label>


                <label className="block">

                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Meal context
                  </span>

                  <textarea
                    rows={4}
                    value={
                      patient.meal_text
                    }
                    onChange={(event) =>
                      updatePatient({
                        meal_text:
                          event.target.value,
                      })
                    }
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                  />

                </label>

              </div>


              {scenario === "safe_stop" && (

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                  The SAFE_STOP demo locks
                  <strong> wearable_missing = true </strong>
                  so the deterministic safety test remains reproducible.
                  Switch to Standard Review for fully editable inputs.
                </div>

              )}


              <div className="mt-5 flex justify-end">

                <button
                  onClick={() =>
                    setShowPatientInput(false)
                  }
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Done editing
                </button>

              </div>

            </section>

          )}


          {/* Clinical Review Summary */}
                    {/* Goal, guardrails and authority */}
          {/* Demo scenario selector */}
          <section className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">

            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">

              <div>

                <div className="text-sm font-semibold text-slate-900">
                  Demo scenario
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Compare a normal clinician-review path,
                  an input-safety stop, and a controlled AI provider failure.
                </p>

              </div>


              <div className="flex flex-wrap rounded-xl bg-slate-100 p-1">

                <button
                  onClick={() =>
                    selectScenario(
                      "standard"
                    )
                  }
                  className={[
                    "rounded-lg px-4 py-2 text-sm font-semibold transition",
                    scenario === "standard"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500",
                  ].join(" ")}
                >
                  Standard Review
                </button>


                <button
                  onClick={() =>
                    selectScenario(
                      "safe_stop"
                    )
                  }
                  className={[
                    "rounded-lg px-4 py-2 text-sm font-semibold transition",
                    scenario === "safe_stop"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-slate-500",
                  ].join(" ")}
                >
                  SAFE_STOP Demo
                </button>

                <button
                  onClick={() =>
                    selectScenario(
                      "provider_failure"
                    )
                  }
                  className={[
                    "rounded-lg px-4 py-2 text-sm font-semibold transition",

                    scenario ===
                      "provider_failure"
                      ? "bg-amber-500 text-white shadow-sm"
                      : "text-slate-500",

                  ].join(" ")}
                >
                  Provider Failure
                </button>

              </div>

            </div>


            {scenario === "safe_stop" && (

              <div
                className={[
                  "mt-4 flex items-start gap-3 rounded-xl border p-4",
                  triage
                    ? "border-rose-200 bg-rose-50"
                    : "border-amber-200 bg-amber-50",
                ].join(" ")}
              >

                {triage
                  ? (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                  )
                  : (
                    <Activity className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  )
                }

                <div className="flex-1">

                  <div
                    className={[
                      "text-sm font-semibold",
                      triage
                        ? "text-rose-800"
                        : "text-amber-800",
                    ].join(" ")}
                  >
                    {triage
                      ? "SAFE_STOP test executed"
                      : "SAFE_STOP test scenario configured"}
                  </div>

                  <div
                    className={[
                      "mt-1 text-xs leading-5",
                      triage
                        ? "text-rose-700"
                        : "text-amber-700",
                    ].join(" ")}
                  >
                    {triage
                      ? `Backend result: ${
                          triage.safety_result.reasons.join(", ")
                        } → ${triage.safety_result.action}`
                      : "Injected test condition: wearable data missing. Press New analysis to run the workflow and evaluate the deterministic safety gate."}
                  </div>

                </div>

                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    triage
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700",
                  ].join(" ")}
                >
                  {triage
                    ? "Executed"
                    : "Not executed"}
                </span>

              </div>

            )}

          </section>


<section className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">

            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">

              <div>

                <div className="flex items-center gap-2">

                  <ShieldCheck className="h-5 w-5 text-indigo-600" />

                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                    Goal, Guardrails &amp; Authority
                  </h2>

                </div>

                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  Human-defined operating boundaries for this
                  Hospital-at-Home triage workflow.
                </p>

              </div>


              <span className="w-fit rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                Controls enforced outside the model
              </span>

            </div>


            <div className="mt-5 grid gap-4 lg:grid-cols-4">

              {/* Goal */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">

                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Goal &amp; scope
                </div>

                <div className="mt-2 text-sm font-semibold text-slate-800">
                  Clinician-facing triage support
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Structure multimodal home-monitoring data,
                  retrieve relevant evidence, and prepare a
                  traceable case for clinician review.
                </p>

                <div className="mt-3 rounded-lg bg-white px-3 py-2 text-[11px] leading-4 text-slate-500">
                  Synthetic Hospital-at-Home prototype data only.
                </div>

              </div>


              {/* Authority */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">

                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Action authority
                </div>

                <div className="mt-2 flex items-center gap-2">

                  <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-700">
                    T2
                  </span>

                  <span className="text-sm font-semibold text-slate-800">
                    Draft / pend only
                  </span>

                </div>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Agent output is prepared for clinician review.
                  It is not released directly to the patient.
                </p>

                <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-rose-600">
                  <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold">
                    T4
                  </span>
                  Autonomous patient-facing send: blocked
                </div>

              </div>


              {/* Deterministic controls */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">

                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Deterministic controls
                </div>

                <div className="mt-2 space-y-2 text-xs leading-5 text-slate-600">

                  <div>
                    • Required-data validation
                  </div>

                  <div>
                    • Prompt-injection detection
                  </div>

                  <div>
                    • Multimodal contradiction check
                  </div>

                  <div>
                    • RAG / model failure handling
                  </div>

                  <div>
                    • Specialist disagreement detection
                  </div>

                </div>

              </div>


              {/* Stop + oversight */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">

                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700/70">
                  Stop &amp; oversight
                </div>

                <div className="mt-2 text-sm font-semibold text-amber-900">
                  Any safety reason → SAFE_STOP
                </div>

                <p className="mt-2 text-xs leading-5 text-amber-800/80">
                  Missing required data, prototype-stale data,
                  unsafe input, unavailable evidence/model output,
                  or major specialist conflict prevents autonomous
                  continuation.
                </p>

                <div className="mt-3 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-[11px] leading-4 text-amber-800">
                  The &gt;24h freshness rule is a prototype policy,
                  not a guideline-derived clinical threshold.
                </div>

                <div className="mt-2 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-[11px] font-medium leading-4 text-amber-900">
                  SAFE_STOP cannot be APPROVED or EDITED;
                  clinician may reject or escalate.
                </div>

              </div>

            </div>


            <div className="mt-4 flex flex-wrap gap-2">

              {[
                "WEARABLE_MISSING",
                "CURRENT_WEIGHT_MISSING",
                "GLUCOSE_MISSING",
                "PROTOTYPE_STALE_DATA_GT_24H",
                "PROMPT_INJECTION_DETECTED",
                "MULTIMODAL_CONTRADICTION",
                "RAG / MODEL FAILURE",
                "SPECIALIST_URGENCY_DISAGREEMENT",
              ].map(
                (rule) => (

                  <span
                    key={rule}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-500"
                  >
                    {rule}
                  </span>

                )
              )}

            </div>


            <div className="mt-4 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">
              Implementation-backed policy summary. Runtime enforcement
              remains in deterministic validators, the safety engine,
              and the human-review permission layer.
            </div>

          </section>


<section className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">

            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">

              <div>

                <div className="flex items-center gap-2">

                  <Stethoscope className="h-5 w-5 text-slate-700" />

                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                    Clinical Review Summary
                  </h2>

                </div>


                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  Clinician-facing case summary generated from the current
                  home-monitoring inputs, specialist outputs, retrieved evidence,
                  and deterministic safety result.
                </p>

              </div>


              <span
                className={[
                  "w-fit rounded-full px-3 py-1.5 text-xs font-semibold",

                  !triage
                    ? "bg-slate-100 text-slate-600"

                    : safeStop
                    ? "bg-rose-100 text-rose-700"

                    : "bg-indigo-100 text-indigo-700",

                ].join(" ")}
              >

                {!triage
                  ? "Awaiting analysis"

                  : safeStop
                  ? "SAFE_STOP"

                  : "Clinician review required"}

              </span>

            </div>


            <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">

              {/* ------------------------------------------ */}
              {/* 1. Observed inputs                         */}
              {/* ------------------------------------------ */}

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">

                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">

                  <Activity className="h-4 w-4" />

                  Observed inputs

                </div>


                <div className="mt-4 space-y-3 text-sm">

                  <div>

                    <div className="text-xs text-slate-400">
                      Weight change
                    </div>

                    <div className="mt-0.5 font-semibold text-slate-800">

                      {weightChangeKg === null
                        ? "Unavailable"
                        : `${
                            weightChangeKg >= 0
                              ? "+"
                              : ""
                          }${weightChangeKg.toFixed(1)} kg`}

                    </div>

                  </div>


                  <div>

                    <div className="text-xs text-slate-400">
                      Glucose
                    </div>

                    <div className="mt-0.5 font-semibold text-slate-800">

                      {patient.glucose_mmol_l !== undefined
                        ? `${patient.glucose_mmol_l} mmol/L`
                        : "Unavailable"}

                    </div>

                  </div>


                  <div>

                    <div className="text-xs text-slate-400">
                      Reported symptoms
                    </div>

                    <div className="mt-0.5 leading-5 text-slate-700">

                      {patient.symptoms_text.trim()
                        || "No symptom text supplied"}

                    </div>

                  </div>

                </div>

              </div>


              {/* ------------------------------------------ */}
              {/* 2. Specialist synthesis                    */}
              {/* ------------------------------------------ */}

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">

                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">

                  <HeartPulse className="h-4 w-4" />

                  Specialist synthesis

                </div>


                <div className="mt-4 space-y-4">

                  <div>

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-xs font-semibold text-slate-500">
                        Heart Failure
                      </div>

                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",

                          hfAgentStatus === "complete"
                            ? "bg-emerald-100 text-emerald-700"

                            : hfAgentStatus === "degraded"
                            ? "bg-amber-100 text-amber-700"

                            : "bg-slate-200 text-slate-600",

                        ].join(" ")}
                      >

                        {hfAgentStatus === "complete"
                          ? "Complete"

                          : hfAgentStatus === "degraded"
                          ? "Degraded"

                          : !triage
                          ? "Awaiting"

                          : hfAgentStatus}

                      </span>

                    </div>


                    <p className="mt-1 text-xs leading-5 text-slate-700">

                      {!triage
                        ? "Awaiting specialist analysis."

                        : triage.execution.provider === "mock"
                        || triage.execution.provider === "controlled_failure_mock"
                        ? (
                            "Reported symptoms and recorded weight change "
                            + "are presented for clinician review alongside "
                            + "retrieved Heart Failure evidence."
                          )

                        : triage.hf_result.reasoning.guideline_interpretation
                          || "Reasoning output unavailable."}

                    </p>

                  </div>


                  <div className="border-t border-slate-200 pt-3">

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-xs font-semibold text-slate-500">
                        Glycemic
                      </div>

                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",

                          glyAgentStatus === "complete"
                            ? "bg-emerald-100 text-emerald-700"

                            : glyAgentStatus === "degraded"
                            ? "bg-amber-100 text-amber-700"

                            : "bg-slate-200 text-slate-600",

                        ].join(" ")}
                      >

                        {glyAgentStatus === "complete"
                          ? "Complete"

                          : glyAgentStatus === "degraded"
                          ? "Degraded"

                          : !triage
                          ? "Awaiting"

                          : glyAgentStatus}

                      </span>

                    </div>


                    <p className="mt-1 text-xs leading-5 text-slate-700">

                      {!triage
                        ? "Awaiting specialist analysis."

                        : glyAgentStatus === "degraded"
                        ? "Reasoning unavailable; fail-safe handling engaged."

                        : triage.execution.provider === "mock"
                        || triage.execution.provider === "controlled_failure_mock"
                        ? (
                            "The recorded glucose value is presented for "
                            + "clinician review alongside retrieved glycemic evidence."
                          )

                        : triage.glycemic_result.reasoning.guideline_interpretation
                          || "Reasoning output unavailable."}

                    </p>

                  </div>

                </div>

              </div>


              {/* ------------------------------------------ */}
              {/* 3. Grounding evidence                      */}
              {/* ------------------------------------------ */}

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">

                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">

                  <FileSearch className="h-4 w-4" />

                  Grounding evidence

                </div>


                <div className="mt-4 space-y-4 text-sm">

                  <div>

                    <div className="text-xs text-slate-400">
                      Heart Failure source
                    </div>

                    <div className="mt-1 font-medium text-slate-800">

                      {hfEvidence
                        ? `Heart Failure guideline · p.${hfEvidence.page}`
                        : "No evidence retrieved yet"}

                    </div>

                    {hfEvidence && (

                      <div className="mt-1 text-[11px] text-slate-400">
                        {hfEvidence.chunk_id}
                      </div>

                    )}

                  </div>


                  <div>

                    <div className="text-xs text-slate-400">
                      Glycemic source
                    </div>

                    <div className="mt-1 font-medium text-slate-800">

                      {glyEvidence
                        ? `WHO HEARTS-D · p.${glyEvidence.page}`
                        : "No evidence retrieved yet"}

                    </div>

                    {glyEvidence && (

                      <div className="mt-1 text-[11px] text-slate-400">
                        {glyEvidence.chunk_id}
                      </div>

                    )}

                  </div>

                </div>

              </div>


              {/* ------------------------------------------ */}
              {/* 4. Disposition / oversight                 */}
              {/* ------------------------------------------ */}

              <div
                className={[
                  "rounded-xl border p-4",

                  safeStop
                    ? "border-rose-200 bg-rose-50/70"
                    : "border-indigo-100 bg-indigo-50/60",

                ].join(" ")}
              >

                <div
                  className={[
                    "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]",

                    safeStop
                      ? "text-rose-500"
                      : "text-indigo-500",

                  ].join(" ")}
                >

                  <ShieldCheck className="h-4 w-4" />

                  Disposition & oversight

                </div>


                <div
                  className={[
                    "mt-4 text-sm font-semibold",

                    safeStop
                      ? "text-rose-900"
                      : "text-slate-900",

                  ].join(" ")}
                >

                  {!triage
                    ? "Analysis not yet completed"

                    : safeStop
                    ? "Workflow stopped for safety"

                    : "Ready for clinician review"}

                </div>


                <p
                  className={[
                    "mt-2 text-xs leading-5",

                    safeStop
                      ? "text-rose-700"
                      : "text-slate-600",

                  ].join(" ")}
                >

                  {!triage
                    ? (
                        "Run the workflow to generate a grounded "
                        + "clinician-review package."
                      )

                    : safeStop
                    ? (
                        `Safety reasons: ${
                          safety?.reasons.join(", ")
                          || "unspecified"
                        }. No autonomous patient-facing action is released.`
                      )

                    : (
                        "No deterministic stop condition was triggered. "
                        + "A clinician decision is still mandatory before "
                        + "any patient-facing action."
                      )}

                </p>


                {triage && (

                  <div className="mt-4 rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-[11px] leading-5 text-slate-500">

                    Agent planning, tool use, retrieval,
                    specialist reasoning, safety state,
                    and audit evidence remain visible below
                    for verification.

                  </div>

                )}


                {triage && (

                  <button
                    type="button"
                    onClick={() => {

                      document
                        .getElementById(
                          "clinician-checkpoint"
                        )
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });

                    }}
                    className={[
                      "mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition",

                      safeStop
                        ? "bg-rose-700 text-white hover:bg-rose-800"
                        : "bg-slate-900 text-white hover:bg-slate-800",

                    ].join(" ")}
                  >

                    {reviewCompleted
                      ? "View review decision"

                      : safeStop
                      ? "Review safety stop"

                      : "Review case"}

                    <ArrowRight className="h-3.5 w-3.5" />

                  </button>

                )}

              </div>

            </div>

          </section>


          


          {/* Metrics */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

            <MetricCard
              icon={<Weight className="h-5 w-5 text-violet-600" />}
              label="Current weight"
              value={
                patient.weight_kg_today !== undefined
                  ? patient.weight_kg_today.toFixed(1)
                  : "—"
              }
              unit="kg"
              hint={
                patient.weight_kg_today !== undefined &&
                patient.weight_kg_prior !== undefined
                  ? `${(
                      patient.weight_kg_today -
                      patient.weight_kg_prior
                    ).toFixed(1)} kg from prior observation`
                  : "Prior comparison unavailable"
              }
            />

            <MetricCard
              icon={<Activity className="h-5 w-5 text-blue-600" />}
              label="Glucose"
              value={
                patient.glucose_mmol_l !== undefined
                  ? patient.glucose_mmol_l.toFixed(1)
                  : "—"
              }
              unit="mmol/L"
              hint="Home-monitoring measurement"
            />

            <MetricCard
              icon={<HeartPulse className="h-5 w-5 text-rose-600" />}
              label="Systolic BP"
              value={
                patient.systolic_bp !== undefined
                  ? String(patient.systolic_bp)
                  : "—"
              }
              unit="mmHg"
              hint="Most recent submitted value"
            />

            <MetricCard
              icon={<Utensils className="h-5 w-5 text-amber-600" />}
              label="Meal context"
              value="Logged"
              hint={
                patient.meal_text ||
                "No meal context provided"
              }
            />

          </section>


          {/* Live agent execution */}
          {(triageLoading || liveRun) && (

            <section
              className={[
                "mt-6 rounded-2xl border p-6 shadow-sm",

                liveRun?.run_status === "FAILED"
                  ? "border-rose-200 bg-rose-50/50"

                  : liveRun?.current_state === "STOPPED"
                  ? "border-amber-200 bg-amber-50/50"

                  : "border-indigo-200 bg-white",

              ].join(" ")}
            >

              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">

                <div>

                  <div className="flex items-center gap-2">

                    {liveRun?.run_status === "FAILED"
                      ? (
                        <AlertTriangle className="h-5 w-5 text-rose-600" />
                      )

                      : (
                        <Activity className="h-5 w-5 text-indigo-600" />
                      )}


                    <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                      Live agent execution
                    </h2>

                  </div>


                  <p className="mt-1 text-sm text-slate-500">
                    Real-time backend workflow state
                  </p>

                </div>


                <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">

                  {liveRun?.run_status
                    ?? (
                      triageLoading
                        ? "STARTING"
                        : "IDLE"
                    )}

                </span>

              </div>


              {/* Current stage */}
              <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/60 p-5">

                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">

                  <div>

                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-500">
                      Current operation
                    </div>


                    <div className="mt-1 text-lg font-semibold text-indigo-950">
                      {workflowStageLabel(
                        liveRun?.current_stage
                      )}
                    </div>

                  </div>


                  <div className="text-2xl font-semibold text-indigo-700">

                    {liveRun?.progress_percent
                      ?? 0}%

                  </div>

                </div>


                <div className="mt-4 h-2 overflow-hidden rounded-full bg-indigo-100">

                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                    style={{
                      width:
                        `${liveRun?.progress_percent ?? 0}%`,
                    }}
                  />

                </div>


                <p className="mt-3 text-sm leading-6 text-indigo-800/80">

                  {liveRun?.progress_message
                    ?? "Connecting to the workflow service..."}

                </p>

              </div>


              {/* Actual backend event history */}
              {liveRun?.progress_history &&
                liveRun.progress_history.length > 0 && (

                <div className="mt-5 space-y-2">

                  {liveRun.progress_history.map(
                    (event) => (

                      <div
                        key={`${event.sequence}-${event.stage}-${event.state}`}
                        className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                      >

                        <div
                          className={[
                            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",

                            event.state === "ERROR"
                              ? "bg-rose-100 text-rose-700"

                              : event.state === "STOPPED"
                              ? "bg-amber-100 text-amber-700"

                              : event.state === "RUNNING"
                              ? "bg-indigo-100 text-indigo-700"

                              : event.state === "PENDING"
                              ? "bg-slate-200 text-slate-500"

                              : "bg-emerald-100 text-emerald-700",

                          ].join(" ")}
                        >

                          {event.state === "RUNNING"
                            ? (
                              <Activity className="h-3.5 w-3.5" />
                            )

                            : event.state === "ERROR"
                            || event.state === "STOPPED"
                            ? (
                              <AlertTriangle className="h-3.5 w-3.5" />
                            )

                            : (
                              <Check className="h-3.5 w-3.5" />
                            )}

                        </div>


                        <div className="min-w-0 flex-1">

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">

                            <span className="text-sm font-semibold text-slate-800">
                              {workflowStageLabel(
                                event.stage
                              )}
                            </span>


                            <span className="text-[11px] font-semibold text-slate-400">
                              {event.state}
                            </span>

                          </div>


                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {event.message}
                          </p>

                        </div>

                      </div>

                    )
                  )}

                </div>

              )}


              {/* Human-readable system failure */}
              {liveRun?.run_status === "FAILED" &&
                liveRun.error && (

                <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">

                  <div className="font-semibold text-rose-900">
                    {liveRun.error.title}
                  </div>


                  <p className="mt-1 text-sm leading-6 text-rose-700">
                    {liveRun.error.message}
                  </p>


                  <details className="mt-3">

                    <summary className="cursor-pointer text-xs font-semibold text-rose-600">
                      Technical details
                    </summary>


                    <div className="mt-2 text-xs text-rose-600">
                      {liveRun.error.category}

                      {liveRun.error.technical_code
                        ? ` · ${liveRun.error.technical_code}`
                        : ""}
                    </div>

                  </details>

                </div>

              )}

            </section>

          )}


          {/* Workflow + Safety */}
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">

            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">

              <div className="mb-6">

                <div className="text-sm font-semibold text-slate-900">
                  Agent workflow
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Visible orchestration and state transitions
                </p>

              </div>


              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">

                {workflowSteps.map((step, index) => (

                  <div
                    key={step.label}
                    className="relative"
                  >

                    <div
                      className={[
                        "rounded-xl border p-4",
                        step.state === "active"
                          ? "border-indigo-200 bg-indigo-50/70"

                          : step.state === "degraded"
                          ? "border-amber-200 bg-amber-50/70"

                          : "border-slate-100 bg-slate-50/60",
                      ].join(" ")}
                    >

                      <div
                        className={[
                          "mb-3 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                          step.state === "complete"
                            ? "bg-emerald-100 text-emerald-700"

                            : step.state === "active"
                            ? "bg-indigo-600 text-white"

                            : step.state === "degraded"
                            ? "bg-amber-100 text-amber-700"

                            : "bg-slate-200 text-slate-500",
                        ].join(" ")}
                      >
                        {step.state === "complete"
                          ? (
                              <Check className="h-4 w-4" />
                            )

                          : step.state === "degraded"
                          ? (
                              <AlertTriangle className="h-4 w-4" />
                            )

                          : index + 1}
                      </div>

                      <div className="text-sm font-semibold text-slate-800">
                        {step.label}
                      </div>

                      <div className="mt-1 text-xs leading-5 text-slate-400">
                        {step.detail}
                      </div>

                    </div>

                  </div>

                ))}

              </div>

            </div>


            <div
              className={[
                "rounded-2xl border p-6",
                safety?.safe_to_continue === false
                  ? "border-rose-200 bg-rose-50/70"
                  : "border-emerald-200 bg-emerald-50/70",
              ].join(" ")}
            >

              <div className="flex items-center justify-between">

                <div
                  className={[
                    "flex h-11 w-11 items-center justify-center rounded-xl",
                    safety?.safe_to_continue === false
                      ? "bg-rose-100"
                      : "bg-emerald-100",
                  ].join(" ")}
                >

                  {safety?.safe_to_continue === false
                    ? <AlertTriangle className="h-6 w-6 text-rose-700" />
                    : <ShieldCheck className="h-6 w-6 text-emerald-700" />}

                </div>

                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    safety?.safe_to_continue === false
                      ? "bg-rose-100 text-rose-700"
                      : "bg-emerald-100 text-emerald-700",
                  ].join(" ")}
                >
                  {!triage
                    ? "Awaiting analysis"
                    : safety?.safe_to_continue
                    ? "Passed"
                    : "SAFE_STOP"}
                </span>

              </div>

              <div
                className={[
                  "mt-5 text-sm font-semibold",
                  safety?.safe_to_continue === false
                    ? "text-rose-950"
                    : "text-emerald-950",
                ].join(" ")}
              >
                Safety Gate
              </div>

              <div
                className={[
                  "mt-1 text-xl font-semibold tracking-tight",
                  safety?.safe_to_continue === false
                    ? "text-rose-950"
                    : "text-emerald-950",
                ].join(" ")}
              >
                {!triage
                  ? "Run analysis to evaluate safety"
                  : safety?.safe_to_continue
                  ? "Ready for clinician review"
                  : "Workflow stopped for safety"}
              </div>

              <p
                className={[
                  "mt-3 text-sm leading-6",
                  safety?.safe_to_continue === false
                    ? "text-rose-800/80"
                    : "text-emerald-800/80",
                ].join(" ")}
              >
                {!triage
                  ? "The deterministic safety engine has not yet evaluated this case."
                  : safety?.safe_to_continue
                  ? "No deterministic stop condition was triggered. Human approval is still required."
                  : `Safety reasons: ${safety?.reasons.join(", ")}`}
              </p>

            </div>

          </section>


          {/* Backend-derived execution trace */}
          {triage?.execution_trace?.length ? (

            <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">

              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">

                <div>

                  <div className="flex items-center gap-2">

                    <Activity className="h-5 w-5 text-indigo-600" />

                    <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                      Agent execution trace
                    </h2>

                  </div>


                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                    Backend-derived execution steps showing orchestration,
                    deterministic tools, guideline retrieval, specialist
                    reasoning, safety evaluation, and human oversight.
                  </p>

                </div>


                <span className="w-fit rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                  Real workflow state
                </span>

              </div>


              {/* Explicit agentic cycle semantics */}
              <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                  <div>

                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
                      Agentic cycle 1
                    </div>

                    <div className="mt-1 text-sm font-semibold text-slate-800">
                      Perceive → Reason → Act → Human oversight
                    </div>

                  </div>


                  <span className="w-fit rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-indigo-700">
                    Backend-derived stages
                  </span>

                </div>


                <div className="mt-4 grid gap-3 md:grid-cols-4">

                  <div className="rounded-lg border border-slate-200 bg-white p-3">

                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-600">
                      Perceive
                    </div>

                    <div className="mt-1 text-xs leading-5 text-slate-600">
                      Intake · deterministic tools · guideline retrieval
                    </div>

                  </div>


                  <div className="rounded-lg border border-slate-200 bg-white p-3">

                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">
                      Reason
                    </div>

                    <div className="mt-1 text-xs leading-5 text-slate-600">
                      Specialist grounded reasoning
                    </div>

                  </div>


                  <div className="rounded-lg border border-slate-200 bg-white p-3">

                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-600">
                      Act
                    </div>

                    <div className="mt-1 text-xs leading-5 text-slate-600">
                      Safety-controlled workflow action:
                      continue to review or SAFE_STOP
                    </div>

                  </div>


                  <div className="rounded-lg border border-slate-200 bg-white p-3">

                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">
                      Human oversight
                    </div>

                    <div className="mt-1 text-xs leading-5 text-slate-600">
                      Clinician approve · edit · reject · escalate
                    </div>

                  </div>

                </div>


                <div className="mt-3 text-[11px] leading-5 text-indigo-700/80">
                  “Act” denotes a workflow-level action only.
                  The prototype does not autonomously release
                  patient-facing clinical recommendations.
                </div>

              </div>


              <div className="mt-6 space-y-3">

                {triage.execution_trace.map(
                  (event, index) => (

                    <div
                      key={`${event.sequence}-${event.stage}`}
                      className="relative flex gap-4"
                    >

                      <div className="flex flex-col items-center">

                        <div
                          className={[
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold",

                            event.state === "STOPPED"
                              ? "border-rose-200 bg-rose-50 text-rose-700"

                              : event.state === "PASSED"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"

                              : event.state === "PENDING"
                              ? "border-amber-200 bg-amber-50 text-amber-700"

                              : "border-indigo-200 bg-indigo-50 text-indigo-700",

                          ].join(" ")}
                        >
                          {String(
                            event.sequence
                          ).padStart(
                            2,
                            "0"
                          )}
                        </div>


                        {index <
                          triage.execution_trace.length - 1 && (

                          <div className="my-1 h-full min-h-8 w-px bg-slate-200" />

                        )}

                      </div>


                      <div className="min-w-0 flex-1 pb-4">

                        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">

                          <div>

                            <div className="flex flex-wrap items-center gap-2">

                              <div className="text-sm font-semibold text-slate-900">
                                {event.stage.replace(
                                  /_/g,
                                  " "
                                )}
                              </div>


                              <span
                                className={[
                                  "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]",

                                  getAgenticPhase(
                                    event.stage
                                  ) === "PERCEIVE"
                                    ? "bg-sky-100 text-sky-700"

                                    : getAgenticPhase(
                                        event.stage
                                      ) === "REASON"
                                    ? "bg-violet-100 text-violet-700"

                                    : getAgenticPhase(
                                        event.stage
                                      ) === "ACT"
                                    ? "bg-amber-100 text-amber-700"

                                    : getAgenticPhase(
                                        event.stage
                                      ) === "OVERSIGHT"
                                    ? "bg-emerald-100 text-emerald-700"

                                    : getAgenticPhase(
                                        event.stage
                                      ) === "PLAN"
                                    ? "bg-indigo-100 text-indigo-700"

                                    : "bg-slate-100 text-slate-500",

                                ].join(" ")}
                              >
                                {getAgenticPhase(
                                  event.stage
                                )}
                              </span>

                            </div>


                            <div className="mt-0.5 text-xs text-slate-400">
                              Actor: {event.actor}
                            </div>

                          </div>


                          <span
                            className={[
                              "w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold",

                              event.state === "STOPPED"
                                ? "bg-rose-100 text-rose-700"

                                : event.state === "PASSED"
                                ? "bg-emerald-100 text-emerald-700"

                                : event.state === "PENDING"
                                ? "bg-amber-100 text-amber-700"

                                : "bg-slate-100 text-slate-600",

                            ].join(" ")}
                          >
                            {event.state}
                          </span>

                        </div>


                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {event.summary}
                        </p>


                        {event.details &&
                          Object.keys(
                            event.details
                          ).length > 0 && (

                          <details className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70">

                            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-500">
                              View tools, evidence and state
                            </summary>


                            <pre className="overflow-x-auto border-t border-slate-100 px-3 py-3 text-[11px] leading-5 text-slate-600">
                              {JSON.stringify(
                                event.details,
                                null,
                                2
                              )}
                            </pre>

                          </details>

                        )}

                      </div>

                    </div>

                  )
                )}

              </div>


              <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs leading-5 text-indigo-700">
                This trace is generated from the FastAPI workflow response.
                It is not a frontend-only animation.
              </div>

            </section>

          ) : null}


          {/* Agents */}
          <section
            id="evidence-grounding"
            className="scroll-mt-24 mt-6"
          >

            <div className="mb-4">

              <h2 className="text-lg font-semibold tracking-tight">
                Specialist analysis
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Independent grounded reasoning with traceable evidence
              </p>

            </div>


            <div className="grid gap-6 xl:grid-cols-2">

              <AgentCard
                title="Heart Failure Agent"
                status={hfAgentStatus}
                substeps={hfSubsteps}
                subtitle="Congestion and symptom assessment"
                icon={<HeartPulse className="h-6 w-6 text-rose-600" />}
                summary={
                  triage
                    ? triage.hf_result.reasoning.guideline_interpretation
                    : "Run analysis to generate grounded specialist reasoning."
                }
                evidence={
                  hfEvidence
                    ? `Heart Failure guideline · p.${hfEvidence.page}`
                    : "No evidence retrieved yet"
                }
                source={
                  hfEvidence
                    ? `${hfEvidence.chunk_id} · Hybrid FAISS + BM25`
                    : "Awaiting retrieval"
                }
                evidenceText={
                  hfEvidence?.text
                    ?? "No retrieved evidence excerpt available."
                }
                evidenceQuery={
                  triage?.hf_result.rag.query
                    ?? "No retrieval query available yet."
                }
                reasoningStatus={
                  triage?.hf_result.reasoning.reasoning_status
                    ?? "AWAITING"
                }
              />

              <AgentCard
                title="Glycemic Agent"
                status={glyAgentStatus}
                substeps={glySubsteps}
                subtitle="Glucose and diabetes monitoring"
                icon={<Activity className="h-6 w-6 text-blue-600" />}
                summary={
                  triage
                    ? triage.glycemic_result.reasoning.guideline_interpretation
                    : "Run analysis to generate grounded specialist reasoning."
                }
                evidence={
                  glyEvidence
                    ? `WHO HEARTS-D · p.${glyEvidence.page}`
                    : "No evidence retrieved yet"
                }
                source={
                  glyEvidence
                    ? `${glyEvidence.chunk_id} · Hybrid FAISS + BM25`
                    : "Awaiting retrieval"
                }
                evidenceText={
                  glyEvidence?.text
                    ?? "No retrieved evidence excerpt available."
                }
                evidenceQuery={
                  triage?.glycemic_result.rag.query
                    ?? "No retrieval query available yet."
                }
                reasoningStatus={
                  triage?.glycemic_result.reasoning.reasoning_status
                    ?? "AWAITING"
                }
              />

            </div>

          </section>


          {triage && (
            <section className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-indigo-700">

                <span className="font-semibold">
                  Run: {triage.run_id}
                </span>

                <span>
                  Mode: {triage.execution.mode}
                </span>

                <span>
                  Provider: {triage.execution.provider}
                </span>

                <span>
                  Real API calls: {triage.execution.real_api_calls ?? 0}
                </span>

                <span>
                  Workflow: {triage.workflow_status}
                </span>

              </div>
            </section>
          )}

          {triageError && (
            <section className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
              {triageError}
            </section>
          )}


          {/* Audit trail */}
          {triage && (
            <section
              id="audit-history"
              className="scroll-mt-24 mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
            >

              <div className="flex items-start justify-between gap-4">

                <div>

                  <div className="flex items-center gap-2">

                    <History className="h-5 w-5 text-slate-600" />

                    <h2 className="text-lg font-semibold tracking-tight">
                      Audit trail
                    </h2>

                  </div>

                  <p className="mt-1 text-sm text-slate-500">
                    Traceable workflow and clinician actions for this run.
                  </p>

                </div>


                <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">

                  {auditLoading
                    ? "Refreshing..."
                    : `${audit?.event_count ?? 0} events`}

                </div>

              </div>


              {auditError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {auditError}
                </div>
              )}


              <div className="mt-6 space-y-4">

                {audit?.events.map(
                  (event, index) => (

                    <div
                      key={event.event_id}
                      className="relative flex gap-4"
                    >

                      <div className="flex flex-col items-center">

                        <div
                          className={[
                            "flex h-9 w-9 items-center justify-center rounded-full border",
                            event.action === "human_review"
                              ? "border-emerald-200 bg-emerald-50"
                              : event.action === "review_blocked"
                              ? "border-rose-200 bg-rose-50"
                              : "border-indigo-200 bg-indigo-50",
                          ].join(" ")}
                        >

                          {event.action === "human_review"
                            ? <Check className="h-4 w-4 text-emerald-600" />
                            : event.action === "review_blocked"
                            ? <AlertTriangle className="h-4 w-4 text-rose-600" />
                            : <Activity className="h-4 w-4 text-indigo-600" />}

                        </div>


                        {index <
                          (audit?.events.length ?? 0) - 1 && (

                          <div className="my-1 h-full min-h-8 w-px bg-slate-200" />

                        )}

                      </div>


                      <div className="min-w-0 flex-1 pb-3">

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">

                          <div className="text-sm font-semibold text-slate-800">
                            {event.action
                              .replaceAll("_", " ")
                              .replace(/\b\w/g, (letter) =>
                                letter.toUpperCase()
                              )}
                          </div>

                          <span className="text-xs text-slate-400">
                            {event.actor}
                          </span>

                        </div>


                        <div className="mt-1 text-xs text-slate-400">
                          {new Date(
                            event.timestamp
                          ).toLocaleString()}
                        </div>


                        {Object.keys(
                          event.details
                        ).length > 0 && (

                          <details className="mt-3 rounded-xl border border-slate-200 bg-white">

                            <summary className="cursor-pointer list-none px-4 py-3">

                              <div className="flex items-center justify-between gap-3">

                                <div>

                                  <div className="text-xs font-semibold text-slate-700">
                                    View complete audit record
                                  </div>

                                  <div className="mt-0.5 text-[11px] text-slate-400">
                                    Input · Action · Source · Timestamp · Output · Human decision
                                  </div>

                                </div>

                                <ChevronRight className="h-4 w-4 text-slate-400" />

                              </div>

                            </summary>


                            <div className="border-t border-slate-100 p-4">

                              <div className="grid gap-4 lg:grid-cols-2">

                                {/* INPUT */}
                                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">

                                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                    Input
                                  </div>

                                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600">
                                    {event.details.input == null
                                      ? "Not recorded"
                                      : JSON.stringify(
                                          event.details.input,
                                          null,
                                          2
                                        )}
                                  </pre>

                                </div>


                                {/* ACTION + TIMESTAMP */}
                                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">

                                  <div className="grid gap-4 sm:grid-cols-2">

                                    <div>

                                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                        Action
                                      </div>

                                      <div className="mt-2 text-xs font-semibold text-slate-700">
                                        {event.action}
                                      </div>

                                    </div>


                                    <div>

                                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                        Timestamp
                                      </div>

                                      <div className="mt-2 text-xs text-slate-600">
                                        {new Date(
                                          event.timestamp
                                        ).toLocaleString()}
                                      </div>

                                    </div>

                                  </div>


                                  <div className="mt-5">

                                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                      Actor
                                    </div>

                                    <div className="mt-2 text-xs font-medium text-slate-700">
                                      {event.actor}
                                    </div>

                                  </div>

                                </div>


                                {/* SOURCE */}
                                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">

                                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-500">
                                    Source
                                  </div>

                                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-indigo-900/70">
                                    {event.details.source == null
                                      ? "Not recorded"
                                      : JSON.stringify(
                                          event.details.source,
                                          null,
                                          2
                                        )}
                                  </pre>

                                </div>


                                {/* OUTPUT */}
                                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">

                                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                    Output
                                  </div>

                                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600">
                                    {event.details.output == null
                                      ? "Not recorded"
                                      : JSON.stringify(
                                          event.details.output,
                                          null,
                                          2
                                        )}
                                  </pre>

                                </div>

                              </div>


                              {/* HUMAN DECISION */}
                              <div
                                className={[
                                  "mt-4 rounded-xl border p-4",

                                  event.details.human_decision
                                    ? "border-emerald-200 bg-emerald-50"
                                    : "border-slate-100 bg-slate-50/70",

                                ].join(" ")}
                              >

                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  Human decision
                                </div>

                                <div className="mt-2 text-sm font-semibold text-slate-700">
                                  {event.details.human_decision == null
                                    ? "No human decision recorded at this event"
                                    : String(
                                        event.details.human_decision
                                      )}
                                </div>

                              </div>


                              {/* Compatibility metadata */}
                              <details className="mt-4 rounded-lg border border-slate-100">

                                <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-slate-400">
                                  Additional event metadata
                                </summary>

                                <pre className="overflow-x-auto border-t border-slate-100 px-3 py-3 text-[10px] leading-5 text-slate-500">
                                  {JSON.stringify(
                                    Object.fromEntries(
                                      Object.entries(
                                        event.details
                                      ).filter(
                                        ([key]) =>
                                          ![
                                            "input",
                                            "source",
                                            "output",
                                            "human_decision",
                                          ].includes(
                                            key
                                          )
                                      )
                                    ),
                                    null,
                                    2
                                  )}
                                </pre>

                              </details>

                            </div>

                          </details>

                        )}

                      </div>

                    </div>

                  )
                )}


                {!auditLoading &&
                  audit?.events.length === 0 && (

                  <div className="text-sm text-slate-400">
                    No audit events recorded.
                  </div>

                )}

              </div>

            </section>
          )}


          {/* Human review */}
          <section
            id="clinician-checkpoint"
            className="scroll-mt-24 mt-6 mb-10 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
          >

            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">

              <div className="max-w-2xl">

                <div className="mb-2 flex items-center gap-2">

                  <ShieldCheck className="h-5 w-5 text-indigo-600" />

                  <h2 className="text-lg font-semibold">
                    Clinician checkpoint
                  </h2>

                </div>


                <p className="text-sm leading-6 text-slate-500">
                  The automated workflow stops here until a clinician
                  explicitly approves, edits, rejects, or escalates the
                  case. Every decision is recorded in the audit trail.
                </p>


                {safeStop && triage && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">

                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

                    <span>
                      SAFE_STOP is active. Approve and Edit are disabled
                      and cannot override the deterministic safety gate.
                    </span>

                  </div>
                )}


                {review && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">

                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">

                      <Check className="h-4 w-4" />

                      {review.status}

                    </div>

                    <div className="mt-2 text-xs leading-5 text-emerald-700">

                      Decision: {review.decision}
                      {" · "}
                      Reviewer: {review.reviewer_id}

                    </div>

                    <div className="mt-1 text-xs text-emerald-600">
                      Review ID: {review.review_id}
                    </div>

                  </div>
                )}


                {reviewError && (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {reviewError}
                  </div>
                )}

              </div>


              <div className="flex flex-wrap gap-2">

                <button
                  onClick={() =>
                    handleReview("REJECT")
                  }
                  disabled={
                    !triage ||
                    reviewLoading ||
                    reviewCompleted
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reject
                </button>


                <button
                  onClick={() =>
                    handleReview("ESCALATE")
                  }
                  disabled={
                    !triage ||
                    reviewLoading ||
                    reviewCompleted
                  }
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Escalate
                </button>


                <button
                  onClick={() => {
                    setShowEditPanel(true);
                    setReviewError(null);
                  }}
                  disabled={
                    !triage ||
                    safeStop ||
                    reviewLoading ||
                    reviewCompleted
                  }
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Edit
                </button>


                <button
                  onClick={() =>
                    handleReview("APPROVE")
                  }
                  disabled={
                    !triage ||
                    safeStop ||
                    reviewLoading ||
                    reviewCompleted
                  }
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {reviewLoading
                    ? "Submitting..."
                    : "Approve"}
                </button>

              </div>

            </div>


            {showEditPanel &&
              triage &&
              !safeStop &&
              !reviewCompleted && (

              <div className="mt-6 border-t border-slate-100 pt-6">

                <label className="text-sm font-semibold text-slate-800">
                  Edited clinician draft
                </label>

                <p className="mt-1 text-xs text-slate-400">
                  Clinician-authored edits are stored separately from
                  automated agent output.
                </p>

                <textarea
                  value={editedDraft}
                  onChange={(event) =>
                    setEditedDraft(
                      event.target.value
                    )
                  }
                  rows={4}
                  placeholder="Enter clinician-edited draft..."
                  className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                />

                <div className="mt-3 flex justify-end gap-2">

                  <button
                    onClick={() => {
                      setShowEditPanel(false);
                      setReviewError(null);
                    }}
                    disabled={reviewLoading}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={() =>
                      handleReview("EDIT")
                    }
                    disabled={
                      reviewLoading ||
                      !editedDraft.trim()
                    }
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Submit edited review
                  </button>

                </div>

              </div>
            )}

          </section>

        </div>

      </main>

    </div>
  );
}


export default App;
