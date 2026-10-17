from datetime import (
    datetime,
    timezone
)

from threading import RLock


class WorkflowStore:
    """
    Prototype runtime store.

    Production deployment could replace this with
    PostgreSQL / Redis without changing API semantics.

    The lock allows the FastAPI request thread and
    background workflow thread to safely share state.
    """

    def __init__(self):
        self.runs = {}
        self.reviews = {}
        self._lock = RLock()


    def save_run(
        self,
        run_id,
        workflow_result
    ):
        with self._lock:
            self.runs[run_id] = workflow_result


    def update_run(
        self,
        run_id,
        patch
    ):
        with self._lock:

            if run_id not in self.runs:
                self.runs[run_id] = {
                    "run_id": run_id
                }

            self.runs[run_id].update(
                patch
            )

            return self.runs[run_id]


    def append_progress(
        self,
        run_id,
        event
    ):
        """
        Append one real backend execution event and
        update the latest visible workflow state.
        """

        with self._lock:

            if run_id not in self.runs:
                self.runs[run_id] = {
                    "run_id": run_id,
                    "progress_history": []
                }

            run = self.runs[run_id]

            history = run.setdefault(
                "progress_history",
                []
            )

            stored_event = {
                **event,

                "sequence":
                    event.get(
                        "sequence",
                        len(history) + 1
                    ),

                "timestamp":
                    event.get(
                        "timestamp",
                        datetime.now(
                            timezone.utc
                        ).isoformat()
                    )
            }

            history.append(
                stored_event
            )

            if stored_event.get("stage"):
                run["current_stage"] = (
                    stored_event["stage"]
                )

            if stored_event.get("actor"):
                run["current_actor"] = (
                    stored_event["actor"]
                )

            if stored_event.get("state"):
                run["current_state"] = (
                    stored_event["state"]
                )

            if stored_event.get("message"):
                run["progress_message"] = (
                    stored_event["message"]
                )

            if (
                stored_event.get(
                    "progress_percent"
                )
                is not None
            ):
                run["progress_percent"] = (
                    stored_event[
                        "progress_percent"
                    ]
                )

            return stored_event


    def get_run(
        self,
        run_id
    ):
        with self._lock:
            return self.runs.get(
                run_id
            )


    def save_review(
        self,
        run_id,
        review
    ):
        with self._lock:
            self.reviews[run_id] = review


    def get_review(
        self,
        run_id
    ):
        with self._lock:
            return self.reviews.get(
                run_id
            )


workflow_store = WorkflowStore()
