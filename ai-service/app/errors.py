"""Ошибка внутреннего API до начала SSE-потока и её JSON-ответ."""

from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        request_id: str,
        fields: list[dict[str, str]] | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.request_id = request_id
        self.fields = fields


def error_body(error: ApiError) -> dict:
    """Тело по схеме InternalError: {error:{code,message,request_id,fields?}}."""
    body = {"code": error.code, "message": error.message, "request_id": error.request_id}
    if error.fields:
        body["fields"] = error.fields
    return {"error": body}


def error_response(error: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status,
        content=error_body(error),
        headers={"X-Request-ID": error.request_id},
    )
