
import os
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone


DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")


class LLMService:
    """
    Cache-first, budget-controlled Gemini service.

    Design:
    1. Cache first
    2. API only when explicitly allowed
    3. No application-level retry
    4. Provider failure is returned as structured status
    """

    def __init__(
        self,
        model=DEFAULT_MODEL,
        cache_path=str(Path(__file__).resolve().parents[3] / "runtime" / "llm_cache.json"),
        max_session_calls=10
    ):
        self.model = model
        self.cache_path = Path(cache_path)
        self.max_session_calls = max_session_calls

        self.api_calls_this_session = 0
        self.cache_hits_this_session = 0

        if self.cache_path.exists():
            try:
                self.cache = json.loads(
                    self.cache_path.read_text(
                        encoding="utf-8"
                    )
                )
            except Exception:
                self.cache = {}
        else:
            self.cache = {}

        self.api_key = self._resolve_api_key()

        self.client = None

        if self.api_key:
            try:
                from google import genai

                self.client = genai.Client(
                    api_key=self.api_key
                )

            except Exception:
                self.client = None


    def _resolve_api_key(self):

        # Preferred for deployment / GitHub environments
        env_key = os.getenv(
            "GEMINI_API_KEY"
        )

        if env_key:
            return env_key

        # Colab fallback
        try:
            from google.colab import userdata

            return userdata.get(
                "GEMINI_API_KEY"
            )

        except Exception:
            return None


    def _make_key(
        self,
        system_prompt,
        user_prompt,
        schema_version
    ):
        payload = {
            "model":
                self.model,

            "system_prompt":
                system_prompt,

            "user_prompt":
                user_prompt,

            "schema_version":
                schema_version
        }

        canonical = json.dumps(
            payload,
            sort_keys=True,
            ensure_ascii=False
        )

        return hashlib.sha256(
            canonical.encode(
                "utf-8"
            )
        ).hexdigest()


    def _save_cache(self):

        self.cache_path.write_text(
            json.dumps(
                self.cache,
                ensure_ascii=False,
                indent=2
            ),
            encoding="utf-8"
        )


    def generate(
        self,
        system_prompt,
        user_prompt,
        schema_version,
        allow_api=False
    ):

        cache_key = self._make_key(
            system_prompt,
            user_prompt,
            schema_version
        )

        # --------------------------------
        # Cache first
        # --------------------------------

        if cache_key in self.cache:

            self.cache_hits_this_session += 1

            return {
                "status":
                    "CACHE_HIT",

                "text":
                    self.cache[
                        cache_key
                    ]["text"]
            }


        # --------------------------------
        # Explicit API permission required
        # --------------------------------

        if not allow_api:

            return {
                "status":
                    "API_DISABLED",

                "text":
                    None
            }


        # --------------------------------
        # Provider availability
        # --------------------------------

        if self.client is None:

            return {
                "status":
                    "API_NOT_CONFIGURED",

                "text":
                    None
            }


        # --------------------------------
        # Session budget
        # --------------------------------

        if (
            self.api_calls_this_session
            >= self.max_session_calls
        ):

            return {
                "status":
                    "SESSION_BUDGET_EXCEEDED",

                "text":
                    None
            }


        # --------------------------------
        # Provider call
        # No application-level retry
        # --------------------------------

        combined_prompt = (
            "SYSTEM SPECIFICATION:\n"
            + system_prompt
            + "\n\n"
            + "UNTRUSTED PATIENT / RETRIEVED DATA:\n"
            + user_prompt
        )

        try:
            response = (
                self.client.models.generate_content(
                    model=self.model,
                    contents=combined_prompt,
                    config={"response_mime_type": "application/json"}
                )
            )

            text = response.text or ""

            self.api_calls_this_session += 1

            self.cache[
                cache_key
            ] = {
                "text":
                    text,

                "created_at":
                    datetime.now(
                        timezone.utc
                    ).isoformat()
            }

            self._save_cache()

            return {
                "status":
                    "API_SUCCESS",

                "text":
                    text
            }


        except Exception as e:

            message = str(e)
            upper = message.upper()

            if (
                "503" in upper
                or "UNAVAILABLE" in upper
            ):
                status = (
                    "MODEL_TEMPORARILY_UNAVAILABLE"
                )

            elif (
                "429" in upper
                or "RATE" in upper
            ):
                status = (
                    "RATE_LIMITED"
                )

            else:
                status = (
                    "MODEL_ERROR"
                )

            return {
                "status":
                    status,

                "text":
                    None,

                "error":
                    message[:500]
            }


    def stats(self):

        return {
            "model":
                self.model,

            "cached_responses":
                len(self.cache),

            "api_calls_this_session":
                self.api_calls_this_session,

            "cache_hits_this_session":
                self.cache_hits_this_session,

            "max_session_calls":
                self.max_session_calls
        }


class MockLLMService:
    """
    Used only for deterministic software tests.
    Never calls Gemini.
    """

    def __init__(self):
        self.calls = 0


    def generate(
        self,
        system_prompt,
        user_prompt,
        schema_version,
        allow_api=False
    ):

        self.calls += 1

        payload = {
            "schema_version":
                schema_version,

            "reasoning_status":
                "OK",

            "patient_findings": [
                "Synthetic backend validation finding."
            ],

            "guideline_interpretation":
                "Mock grounded reasoning for software validation.",

            "clinical_concerns":
                [],

            "evidence_used":
                [],

            "uncertainties": [
                "Simulation output only."
            ],

            "urgency":
                "ROUTINE_REVIEW",

            "action_tags":
                [],

            "needs_human_review":
                True
        }

        return {
            "status":
                "API_SUCCESS",

            "simulation":
                True,

            "text":
                json.dumps(payload)
        }



class ControlledFailureMockLLMService(
    MockLLMService
):
    """
    Deterministic provider-failure simulator.

    Used only for software safety demonstrations
    and automated tests.

    It never calls Gemini.

    By default:
    - first model call succeeds
    - second model call returns MODEL_ERROR

    Because the orchestrator executes Heart Failure
    before Glycemic reasoning, fail_on_call=2
    simulates a Glycemic model/provider failure.
    """

    def __init__(
        self,
        fail_on_call=2
    ):

        super().__init__()

        self.fail_on_call = (
            fail_on_call
        )


    def generate(
        self,
        system_prompt,
        user_prompt,
        schema_version,
        allow_api=False
    ):

        next_call = (
            self.calls + 1
        )


        if (
            next_call
            == self.fail_on_call
        ):

            self.calls += 1

            return {
                "status":
                    "MODEL_ERROR",

                "text":
                    None,

                "error":
                    (
                        "Controlled simulation: "
                        "model provider unavailable."
                    )
            }


        return super().generate(
            system_prompt=
                system_prompt,

            user_prompt=
                user_prompt,

            schema_version=
                schema_version,

            allow_api=
                False
        )
