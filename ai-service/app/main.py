"""Development liveness only; generate/knowledge are specified but not implemented."""

from fastapi import FastAPI

app = FastAPI(title="AI-buddy internal AI", docs_url=None, redoc_url=None)


@app.get("/healthz")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-service"}
