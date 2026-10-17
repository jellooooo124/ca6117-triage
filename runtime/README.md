# Runtime data directory

Keep this directory when preparing the project for execution. The backend writes audit events here (default file `ca6117_api_audit.jsonl`) and may write an optional LLM cache (`llm_cache.json`).

The directory must be writable by the backend process. Runtime data and credentials are deliberately **not** included.
