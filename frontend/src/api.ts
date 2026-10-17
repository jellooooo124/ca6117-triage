
export type HealthResponse = {
  status: "healthy" | "degraded";
  backend: string;
  hf_rag_assets_ready: boolean;
  glycemic_rag_assets_ready: boolean;
  llm_cache_ready: boolean;
  assets: Record<string, boolean>;
};


export type EvidenceItem = {
  chunk_id: string;
  page: number;
  text: string;
  source?: string;
  rrf_score?: number;
};


export type ReasoningResult = {
  schema_version: string;
  reasoning_status:
    | "OK"
    | "INSUFFICIENT_EVIDENCE"
    | "MODEL_ERROR";

  patient_findings: string[];
  guideline_interpretation: string;

  clinical_concerns: Array<{
    concern: string;
    evidence_refs: Array<{
      chunk_id: string;
      page: number;
    }>;
  }>;

  evidence_used: Array<{
    chunk_id: string;
    page: number;
  }>;

  uncertainties: string[];

  urgency:
    | "ROUTINE_REVIEW"
    | "PROMPT_REVIEW"
    | "URGENT_REVIEW"
    | "UNKNOWN";

  action_tags: string[];
  needs_human_review: boolean;
  model_service_status: string;
};


export type SpecialistResult = {
  agent: string;
  domain: string;
  patient_id: string;

  rag: {
    status: string;
    query: string;
    evidence: EvidenceItem[];
  };

  reasoning: ReasoningResult;
  status: string;
};


export type SafetyResult = {
  safe_to_continue: boolean;

  action:
    | "CLINICIAN_REVIEW"
    | "SAFE_STOP";

  reasons: string[];

  human_review_required: boolean;

  specialist_conflict: {
    detected: boolean;
    reason: string | null;
    hf_urgency: string;
    glycemic_urgency: string;
  } | null;
};


export type ExecutionTraceEvent = {
  sequence: number;
  stage: string;
  actor: string;
  state: string;
  summary: string;

  details: Record<
    string,
    unknown
  >;
};


export type ProgressEvent = {
  sequence: number;
  stage: string;
  actor: string;
  state: string;
  message: string;
  progress_percent:
    | number
    | null;
  timestamp?: string;
};


export type WorkflowError = {
  category: string;
  title: string;
  message: string;
  technical_code?: string;
};


export type LiveRunResponse =
  Omit<
    Partial<TriageResponse>,
    "workflow_status"
  > & {
    run_id: string;
    patient_id: string;

    run_status:
      | "QUEUED"
      | "RUNNING"
      | "READY_FOR_HUMAN_REVIEW"
      | "SAFE_STOP"
      | "FAILED"
      | string;

    workflow_status: string;

    current_stage?: string;
    current_actor?: string;
    current_state?: string;

    progress_percent?: number;

    progress_message?: string;

    progress_history?: ProgressEvent[];

    error?: WorkflowError;
  };


export type SimulationProfile =
  | "standard"
  | "glycemic_model_error";


export type StartTriageResponse = {
  run_id: string;
  patient_id: string;
  run_status: string;
  current_stage: string;
  progress_percent: number;
  message: string;
};


export type TriageResponse = {
  run_id: string;
  patient_id: string;

  workflow_status:
    | "READY_FOR_HUMAN_REVIEW"
    | "SAFE_STOP";

  execution_trace: ExecutionTraceEvent[];

  hf_result: SpecialistResult;
  glycemic_result: SpecialistResult;

  safety_result: SafetyResult;

  review_state: string;
  requires_human_review: boolean;

  execution: {
    mode: string;
    provider: string;
    simulation_profile?: string;
    real_api_calls?: number;
  };
};



export type PatientInput = {
  patient_id: string;

  weight_kg_today?: number;
  weight_kg_prior?: number;

  glucose_mmol_l?: number;
  systolic_bp?: number;
  heart_rate_bpm?: number;

  symptoms_text: string;
  meal_text: string;

  meal_image_description?: string;
  meal_image_path?: string;

  wearable_missing: boolean;

  data_age_hours?: number;

  history: Array<Record<string, unknown>>;
};


export const DEMO_PATIENT: PatientInput = {
  patient_id: "SYN001",

  weight_kg_today: 72.2,
  weight_kg_prior: 70.0,

  glucose_mmol_l: 13.5,

  systolic_bp: 130,
  heart_rate_bpm: 88,

  symptoms_text: "new ankle swelling",

  meal_text:
    "salty soup and noodles",

  meal_image_description: "",

  wearable_missing: false,

  data_age_hours: 1,

  history: [],
};


export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch("/health");

  if (!response.ok) {
    throw new Error(
      `Health request failed: ${response.status}`
    );
  }

  return response.json();
}


export async function startSimulationTriage(
  patient: PatientInput = DEMO_PATIENT,
  simulationProfile:
    SimulationProfile = "standard"
): Promise<StartTriageResponse> {

  const response = await fetch(
    "/api/v1/triage/start",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        mode: "simulation",

        simulation_profile:
          simulationProfile,

        patient,
      }),
    }
  );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Unable to start analysis (${response.status}). ${text}`
    );
  }


  return response.json();
}


export async function getRunStatus(
  runId: string
): Promise<LiveRunResponse> {

  const response = await fetch(
    `/api/v1/runs/${runId}`
  );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Unable to read workflow status (${response.status}). ${text}`
    );
  }


  return response.json();
}


export async function runSimulationTriage(
  patient: PatientInput = DEMO_PATIENT
): Promise<TriageResponse> {

  const response = await fetch(
    "/api/v1/triage",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        mode: "simulation",
        patient,
      }),
    }
  );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Triage failed: ${response.status} ${text}`
    );
  }


  return response.json();
}


export type ReviewDecision =
  | "APPROVE"
  | "EDIT"
  | "REJECT"
  | "ESCALATE";


export type ReviewResponse = {
  review_id: string;
  timestamp: string;
  run_id: string;
  patient_id: string;
  reviewer_id: string;

  decision: ReviewDecision;

  edited_draft:
    | string
    | null;

  status:
    | "HUMAN_APPROVED"
    | "HUMAN_EDITED"
    | "HUMAN_REJECTED"
    | "HUMAN_ESCALATED";
};


export async function submitReview(
  runId: string,
  decision: ReviewDecision,
  reviewerId = "demo_clinician",
  editedDraft?: string
): Promise<ReviewResponse> {

  const response = await fetch(
    `/api/v1/review/${runId}`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        decision,
        reviewer_id:
          reviewerId,

        edited_draft:
          editedDraft ?? null,
      }),
    }
  );


  if (!response.ok) {

    let message =
      `Review failed: ${response.status}`;

    try {

      const payload =
        await response.json();

      if (payload.detail) {
        message =
          payload.detail;
      }

    } catch {
      // Keep default message
    }

    throw new Error(
      message
    );
  }


  return response.json();
}


export type AuditEvent = {
  event_id: string;
  timestamp: string;
  run_id: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
};


export type AuditResponse = {
  run_id: string;
  event_count: number;
  events: AuditEvent[];
};


export async function getAuditTrail(
  runId: string
): Promise<AuditResponse> {

  const response = await fetch(
    `/api/v1/audit/${runId}`
  );


  if (!response.ok) {

    throw new Error(
      `Audit request failed: ${response.status}`
    );

  }


  return response.json();
}


export type EvaluationResultRow = {
  test_id: string;
  category: string;
  scenario: string;
  expected: string;
  actual: string;
  safety_reasons: string;
  result: "PASS" | "FAIL";
  run_id: string;
  latency_ms:
    | number
    | string;
  notes: string;
};


export type EvaluationArtefact = {
  suite: string;
  execution_mode: string;
  gemini_api_calls: number;
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate_percent: number;
  results: EvaluationResultRow[];
};


export type EvaluationResponse = {
  status:
    | "READY"
    | "UNAVAILABLE";

  evaluation?:
    EvaluationArtefact;

  interpretation?:
    string;

  source?:
    string;

  message?:
    string;

  artefact_path?:
    string;
};


export async function getEvaluationResults():
  Promise<EvaluationResponse> {

  const response = await fetch(
    "/api/v1/evaluation"
  );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Evaluation request failed: ${response.status} ${text}`
    );
  }


  return response.json();
}

