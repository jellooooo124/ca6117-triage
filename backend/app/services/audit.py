
import json
import os
import uuid

from pathlib import Path
from datetime import datetime, timezone


AUDIT_PATH = Path(
    os.getenv(
        "AUDIT_LOG_PATH",
        str(Path(__file__).resolve().parents[3] / "runtime" / "ca6117_api_audit.jsonl")
    )
)


AUDIT_EVENTS = []


def write_audit_event(
    run_id,
    actor,
    action,
    details=None
):

    event = {
        "event_id":
            "evt_"
            + uuid.uuid4().hex[:12],

        "timestamp":
            datetime.now(
                timezone.utc
            ).isoformat(),

        "run_id":
            run_id,

        "actor":
            actor,

        "action":
            action,

        "details": {
            "input":
                None,

            "source":
                None,

            "output":
                None,

            "human_decision":
                None,

            **(
                details
                or {}
            )
        }
    }


    AUDIT_EVENTS.append(
        event
    )


    with open(
        AUDIT_PATH,
        "a",
        encoding="utf-8"
    ) as f:

        f.write(
            json.dumps(
                event,
                ensure_ascii=False,
                default=str
            )
            + "\n"
        )


    return event


def get_audit_events(
    run_id=None
):

    if run_id is None:
        return list(
            AUDIT_EVENTS
        )


    return [
        event
        for event
        in AUDIT_EVENTS
        if event["run_id"]
        == run_id
    ]
