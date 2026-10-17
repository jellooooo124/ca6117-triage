# Group 14 - README, Build, Deployment and Evaluation Guide

**Course:** CA6117 Agentic AI in Healthcare  
**Project:** Multimodal Multi-Agent Triage Assistant for Hospital-at-Home Chronic Disease Monitoring  
**Delivery:** One ZIP named `Group 14.zip` with a single `Group 14/` directory. The files below retain their relative paths.

## 1. What is included

- `report/`: `Group 14_Written_Report.pdf` only. The 23-page report includes two appendix pages. No editable Word file is required by the submission instruction.
- `backend/`: FastAPI API, orchestration, HF and Glycemic agents, reasoning, safety, review, RAG loading and structured audit logging.
- `frontend/`: React/TypeScript/Vite user interface and its source assets.
- `frontend/dist/`: already-built frontend static distribution for inspection; functional API access still requires a backend/proxy.
- `assets/`: **six required retrieval assets** for both conditions (chunks, dense embeddings, FAISS indices).
- `evaluation/`: executable prototype-conformance and RAG retrieval tests, frozen gold dataset and dated output tables.
- `evidence/screenshots/`: demonstrative workflow screenshots from the earlier source baseline.
- `evidence/verification/`: independent 8 Oct 2026 install/build, workflow and optional Gemini live verification records.
- `runtime/`: writable directory for generated audit/cache files; includes README only, not generated logs.

## 2. Recorded and declared environment

The 8 Oct 2026 verified build used:

| Component | Version or specification |
|---|---|
| Python | 3.13.16 (verified build environment) |
| Node.js | v20.19.0 (verified build environment) |
| npm | 10.8.2 (verified build environment) |
| Python third-party dependencies | **exactly pinned** in root `requirements.txt` |
| JavaScript dependencies | `frontend/package.json` + exact transitive resolutions in `frontend/package-lock.json` (`lockfileVersion: 3`) |
| React | 19.3.0 (resolved lockfile) |
| React DOM | 19.3.0 (resolved lockfile) |
| Vite | 8.3.2 (resolved lockfile) |
| TypeScript | 6.0.3 (resolved lockfile) |
| Tailwind CSS | 4.3.3 (resolved lockfile) |
| FAISS | faiss-cpu 1.15.1 (requirements) |
| Embedding model | `sentence-transformers/all-MiniLM-L6-v2` (configured model identifier; weights may require download on first run) |
| Optional live provider/model | Gemini API; default model identifier `gemini-3.5-flash-lite` |

**Do not** replace `npm ci` with an unpinned fresh install; preserve the supplied `package-lock.json`. Because the original verified environment is recorded, other OS/Python/Node combinations require fresh validation.

## 3. Build the backend (recommended evaluator path)

Start in the top directory (where `requirements.txt`, `backend`, `frontend`, `assets`, and `runtime` are peers). Python 3.13.x and internet access for package installation and the first embedding-model download are recommended.

On macOS / Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
mkdir -p runtime
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

On Windows PowerShell:

```powershell
py -3.13 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
New-Item -ItemType Directory -Force runtime | Out-Null
Set-Location backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**IMPORTANT on Windows:** Run the `New-Item runtime` command from the project root **before** `Set-Location backend`.

The FastAPI health endpoint is `http://127.0.0.1:8000/health`, with OpenAPI docs at `http://127.0.0.1:8000/docs`. `health.status = healthy` plus all six assets present is the first check. The sentence-transformer model may download once on first RAG initialization.

## 4. Build and run the frontend

Open a **second terminal** in the same top directory.

```bash
cd frontend
npm ci
npm run build
npm run dev
```

Open the local URL printed by Vite (by default `http://localhost:5173`). The supplied `vite.config.ts` forwards `/api` and `/health` to `http://127.0.0.1:8000` in dev mode.

### Already-built version

`frontend/dist/` contains `index.html` plus JS/CSS/assets from the verified 8 Oct production build. This **is** the available built version requested by the assignment, included in this ZIP under `frontend/dist/`. It is static frontend output, not a standalone backend executable. For deployment behind Nginx or another static host, serve `dist/` and **reverse-proxy `/api` and `/health` to port 8000**. The shipped dev-proxy setting is for `npm run dev`; do not assume a generic static host provides it.

## 5. Demo: minimum evaluator walkthrough

1. Start backend and frontend and confirm the **health** view.
2. Use the dashboard's synthetic example patient, and start the **simulation** run.
3. Inspect the **Plan → Perceive → Reason → Act → Human Oversight** execution progress, agent traces, state changes and tool outputs.
4. Inspect HF and Glycemic retrieved guideline evidence (source/page/chunk reference).
5. Open the clinician checkpoint and exercise **Approve** on a safe, non-STOP case; verify the human decision appears in the audit history.
6. Run a negative case such as missing wearable data or input contradiction; confirm deterministic **SAFE_STOP** and refusal of **Approve/Edit** while **Escalate** remains possible.
7. Inspect the six audit fields (input, action, source, timestamp, output, human decision), and review the evaluation evidence in `evaluation/results/` and `evidence/`.

The asynchronous dashboard route `/api/v1/triage/start` is explicitly **simulation-only**. Do not conflate this with the optional synchronous live API mode.

## 6. Repeat the evaluation

Keep the backend running (port 8000) and run these commands from the project root in a separate terminal with the Python environment active:

```bash
python evaluation/run_evaluation.py
python evaluation/retrieval/run_retrieval_evaluation.py
```

- Formal recorded result (8 Oct): **23/23 prototype-conformance cases passed** using synthetic data and simulation, with **zero Gemini calls**. Results are saved under `evaluation/results/`.
- Frozen RAG benchmark: **10 source-verified queries**, Hit Rate@3 **0.90**, Macro Precision@3 **0.3666**, Macro Recall@3 **0.65**, MRR@3 **0.7333**. Results under `evaluation/retrieval/results/`.
- Independent setup/portability validation is in `evidence/verification/gate1_build_validation.json`; workflow audit, HITL and STOP validation in `gate2_workflow_validation.json`.
- These checks are **software/prototype conformance**, **not clinical safety or diagnostic efficacy validation**.

Be aware that rerunning evaluation overwrites some result files; retain the included frozen outputs for comparison.

## 7. External services / API / deployment configuration

**Default demo:** no Gemini API key is required; use simulation. The only external fetch that may occur is downloading the sentence-transformer embedding model if not present in local cache.

**Optional live mode** is enabled only on the synchronous `POST /api/v1/triage` route with `mode: "live"`; it must not be required for coursework marking. Set these environment variables in the backend process environment (do not commit actual values):

```bash
export GEMINI_API_KEY=YOUR_OWN_API_KEY
export GEMINI_MODEL=gemini-3.5-flash-lite
```

On Windows PowerShell use `$env:GEMINI_API_KEY='YOUR_OWN_API_KEY'`. The application uses a cache-first, limited-call Gemini client; requests incur provider usage/cost and depend on external availability. The optional 8 Oct test record reports **2 uncached specialist responses**, and human review was still required. No credentials or live patient records are included.

**Storage:** `workflow_store` is in memory (server restart loses runs); audit events append to `runtime/ca6117_api_audit.jsonl`. This prototype is a coursework decision-support system, not production clinical software. Protect any environment variables, do not expose the API publicly without authentication/network controls, and use synthetic cases for evaluation.

## 8. Limitations, troubleshooting and provenance

- If `/health` reports degraded, confirm all six assets are under the **top-level** `assets/` directory.
- If the first workflow appears slow, check first-run embedding model download/network; no original guideline PDFs are bundled. The provided chunks retain source, page and chunk identifiers for reproducibility.
- If writing an audit fails, confirm the **top-level `runtime/` directory exists and is writable**.
- If frontend requests fail, verify FastAPI is running on 8000 and use Vite dev mode (or install a reverse proxy).
- If `npm ci` fails, use the recorded Node/npm versions, reinstall from `package-lock.json`, and keep the repository tree intact.
- The included UI screenshots originate from the **5 Oct baseline**. The **8 Oct** verification evidence records later build and workflow checks. They are different evidence types; neither proves clinical effectiveness.
- No real patient data should be used. Clinical recommendation text remains a draft requiring professional oversight.

## 9. Final upload requirement

Submit the supplied `Group 14.zip` to NTULearn. Its root folder is `Group 14/`. Verify the PDF and run the documented simulation workflow on your own computer before submission. The software uses synthetic data, and no credentials are bundled.
