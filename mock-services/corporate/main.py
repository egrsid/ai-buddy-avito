"""Development liveness only; corporate operations are assigned to BE-04."""

from fastapi import FastAPI

app = FastAPI(title="AI-buddy corporate mock", docs_url=None, redoc_url=None)


@app.get("/healthz")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "mock-services"}
