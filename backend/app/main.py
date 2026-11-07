"""FastAPI application factory and shared error responses."""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import router
from app.core.config import Settings, load_settings
from app.core.database import make_engine, make_session_factory
from app.services.shipments import DuplicateShipmentCode, ShipmentNotFound
from app.services.clock import SYSTEM_CLOCK
from app.services.demo import DemoScenarioError
from app.services.blockchain_outbox import configured_coordinator
from app.services.signed_ingestion import IngestionError


logger = logging.getLogger(__name__)


def error_response(status_code: int, code: str, message: str, details: list | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details or []}},
    )


class BodyLimitMiddleware:
    """Reject oversized writes before FastAPI parses JSON, including chunked bodies."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PATCH", "PUT"}:
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = 0
        if declared > self.max_bytes:
            await error_response(413, "BODY_TOO_LARGE", "Request body is too large")(scope, receive, send)
            return
        messages, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > self.max_bytes:
                await error_response(413, "BODY_TOO_LARGE", "Request body is too large")(scope, receive, send)
                return
            messages.append(message)
            if not message.get("more_body", False):
                break
        index = 0

        async def replay_receive():
            nonlocal index
            if index < len(messages):
                message = messages[index]
                index += 1
                return message
            return await receive()

        await self.app(scope, replay_receive, send)


class RequestIdMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                message = {**message, "headers": [*message.get("headers", []),
                                                   (b"x-request-id", request_id.encode("ascii"))]}
            await send(message)

        await self.app(scope, receive, send_with_id)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    logging.basicConfig(level=getattr(logging, settings.log_level, logging.INFO))
    app = FastAPI(title="Smart Cold Chain Insurance API", version="1.0.0")
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(app.state.engine)
    app.state.clock = SYSTEM_CLOCK
    app.state.blockchain = configured_coordinator(settings)

    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.max_request_body_bytes)
    app.add_middleware(RequestIdMiddleware)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "PATCH"],
            allow_headers=["Content-Type", "X-Admin-Key"],
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        errors = exc.errors()
        invalid_json = any(item["type"] == "json_invalid" for item in errors)
        details = [
            {
                "field": ".".join(str(part) for part in item["loc"][1:]) or "body",
                "message": item["msg"],
            }
            for item in errors
        ]
        if invalid_json:
            return error_response(400, "INVALID_JSON", "JSON không hợp lệ", details)
        return error_response(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", details)

    @app.exception_handler(ShipmentNotFound)
    async def shipment_not_found(_request: Request, _exc: ShipmentNotFound):
        return error_response(404, "SHIPMENT_NOT_FOUND", "Không tìm thấy lô hàng")

    @app.exception_handler(DuplicateShipmentCode)
    async def duplicate_code(_request: Request, _exc: DuplicateShipmentCode):
        return error_response(409, "DUPLICATE_SHIPMENT_CODE", "Mã lô hàng đã tồn tại")

    @app.exception_handler(DemoScenarioError)
    async def demo_scenario_error(_request: Request, exc: DemoScenarioError):
        return error_response(422, "VALIDATION_ERROR", str(exc))

    @app.exception_handler(IngestionError)
    async def ingestion_error(_request: Request, exc: IngestionError):
        return error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_request: Request, exc: StarletteHTTPException):
        return error_response(exc.status_code, "HTTP_ERROR", str(exc.detail))

    @app.exception_handler(Exception)
    async def internal_error(request: Request, exc: Exception):
        logger.exception("Unhandled API error request_id=%s", request.state.request_id, exc_info=exc)
        return error_response(500, "INTERNAL_ERROR", "Lỗi nội bộ")

    app.include_router(router)
    if settings.app_env == "development":
        from app.api.routes import demo_router

        app.include_router(demo_router)
    return app


app = create_app()
