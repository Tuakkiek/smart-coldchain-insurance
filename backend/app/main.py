"""FastAPI application factory and shared error responses."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import router
from app.core.config import Settings, load_settings
from app.core.database import make_engine, make_session_factory
from app.services.shipments import DuplicateShipmentCode, ShipmentNotFound


logger = logging.getLogger(__name__)


def error_response(status_code: int, code: str, message: str, details: list | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details or []}},
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    logging.basicConfig(level=getattr(logging, settings.log_level, logging.INFO))
    app = FastAPI(title="Smart Cold Chain Insurance API", version="1.0.0")
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(app.state.engine)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"],
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

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_request: Request, exc: StarletteHTTPException):
        return error_response(exc.status_code, "HTTP_ERROR", str(exc.detail))

    @app.exception_handler(Exception)
    async def internal_error(_request: Request, exc: Exception):
        logger.exception("Unhandled API error", exc_info=exc)
        return error_response(500, "INTERNAL_ERROR", "Lỗi nội bộ")

    app.include_router(router)
    return app


app = create_app()
