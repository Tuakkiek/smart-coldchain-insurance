"""Version 1 REST endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import UUID4
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import get_session
from app.schemas.api import (
    EventListOut,
    HealthOut,
    LoginIn,
    LoginOut,
    ShipmentCreate,
    ShipmentOut,
    ShipmentDeleteOut,
    ShipmentsOut,
    TelemetryCreate,
    TelemetryListOut,
    TelemetryOut,
    SignedTelemetryCreate,
    SignedTelemetryOut,
    DeviceRegister,
    DeviceOut,
    DevicesOut,
    DeviceDeleteOut,
    DeviceKeyRegister,
    DeviceStateUpdate,
    AssignmentUpdate,
    DeviceHealthListOut,
    SealBatchIn,
    IntegrityBatchOut,
    IntegrityBatchListOut,
    IntegrityVerifyOut,
    IntegritySummaryOut,
)
from app.services import shipments
from app.services import signed_ingestion
from app.services import batch_service
from app.services.auth import (
    AuthError,
    authenticate_admin,
    auth_account,
    create_access_token,
    decode_and_verify_token,
    issue_refresh_token,
    revoke_refresh_token,
    resolve_client_ip,
    rotate_refresh_token,
)
from app.models import SignedTelemetryReceipt
from app.services.device_health_service import shipment_devices
from app.services.health import service_health


router = APIRouter(prefix="/api/v1")
DbSession = Annotated[Session, Depends(get_session)]

bearer_scheme = HTTPBearer(auto_error=False)


def require_admin(
    request: Request,
    session: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials.strip():
        raise AuthError(
            401,
            "UNAUTHORIZED",
            "Xác thực không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials.strip()
    settings = request.app.state.settings
    payload = decode_and_verify_token(
        token,
        settings.jwt_secret_key,
        auth_account(session, settings).username,
    )
    return payload["sub"]


def admin_session(
    session: DbSession,
    _admin: Annotated[str, Depends(require_admin)],
) -> Session:
    return session


AdminSession = Annotated[Session, Depends(admin_session)]


def _validate_auth_origin(request: Request) -> None:
    """Reject browser requests from origins outside the configured allowlist."""
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") not in request.app.state.settings.cors_origins:
        raise AuthError(403, "ORIGIN_NOT_ALLOWED", "Origin không được phép")


def _set_refresh_cookie(
    response: Response,
    token: str,
    expires_at,
    settings,
) -> None:
    remaining_seconds = max(
        0, int((expires_at - datetime.now(timezone.utc)).total_seconds())
    )
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        max_age=remaining_seconds,
        expires=expires_at,
        path=settings.refresh_cookie_path,
        domain=settings.refresh_cookie_domain or None,
        secure=bool(settings.refresh_cookie_secure),
        httponly=True,
        samesite=settings.refresh_cookie_samesite,
    )


def _clear_refresh_cookie(response: Response, settings) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        domain=settings.refresh_cookie_domain or None,
        secure=bool(settings.refresh_cookie_secure),
        httponly=True,
        samesite=settings.refresh_cookie_samesite,
    )


@router.post("/auth/login", response_model=LoginOut)
def login(payload: LoginIn, request: Request, response: Response, session: DbSession):
    settings = request.app.state.settings
    _validate_auth_origin(request)
    limiter = getattr(request.app.state, "login_rate_limiter", None)
    client_ip = resolve_client_ip(request, settings.trusted_proxies)

    if limiter is not None:
        allowed, retry_after = limiter.check_and_record(client_ip)
        if not allowed:
            raise AuthError(
                429,
                "RATE_LIMITED",
                "Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau.",
                headers={"Retry-After": str(retry_after)},
            )

    account = auth_account(session, settings)
    if not authenticate_admin(payload.username, payload.password, account):
        raise AuthError(
            401,
            "UNAUTHORIZED",
            "Tên đăng nhập hoặc mật khẩu không chính xác",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(
        username=account.username,
        secret_key=settings.jwt_secret_key,
        expire_minutes=settings.jwt_access_token_expire_minutes,
    )
    refresh_token, refresh_expires_at = issue_refresh_token(session, account, settings)
    _set_refresh_cookie(response, refresh_token, refresh_expires_at, settings)
    return LoginOut(access_token=token, token_type="bearer")


@router.post("/auth/refresh", response_model=LoginOut)
def refresh(request: Request, response: Response, session: DbSession):
    settings = request.app.state.settings
    _validate_auth_origin(request)
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if not refresh_token:
        raise AuthError(401, "REFRESH_TOKEN_MISSING", "Không tìm thấy refresh token")
    replacement, expires_at, account = rotate_refresh_token(
        session, refresh_token, settings
    )
    access_token = create_access_token(
        username=account.username,
        secret_key=settings.jwt_secret_key,
        expire_minutes=settings.jwt_access_token_expire_minutes,
    )
    _set_refresh_cookie(response, replacement, expires_at, settings)
    return LoginOut(access_token=access_token, token_type="bearer")


@router.post("/auth/logout", status_code=204)
def logout(request: Request, session: DbSession):
    settings = request.app.state.settings
    _validate_auth_origin(request)
    revoke_refresh_token(
        session, request.cookies.get(settings.refresh_cookie_name), settings
    )
    response = Response(status_code=204)
    _clear_refresh_cookie(response, settings)
    return response


@router.get("/health", response_model=HealthOut)
def health(request: Request) -> HealthOut:
    return HealthOut.model_validate(service_health(request.app.state.engine, request.app.state.settings))


@router.get("/ready", response_model=HealthOut)
def ready(request: Request, response: Response) -> HealthOut:
    result = service_health(request.app.state.engine, request.app.state.settings)
    if result["database"] != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthOut.model_validate(result)


@router.post("/shipments", response_model=ShipmentOut, response_model_exclude_unset=True, status_code=201)
def create_shipment(payload: ShipmentCreate, request: Request, session: AdminSession):
    shipment = shipments.create_shipment(session, payload)
    return shipments.shipment_dict(session, shipment, request.app.state.clock, request.app.state.settings.sensor_gap_minutes)


@router.get("/shipments", response_model=ShipmentsOut, response_model_exclude_unset=True)
def list_shipments(request: Request, session: AdminSession):
    items = [
        shipments.shipment_dict(session, item, request.app.state.clock, request.app.state.settings.sensor_gap_minutes)
        for item in shipments.list_shipments(session)
    ]
    return {"items": items, "total": len(items)}


@router.get("/shipments/{shipment_id}", response_model=ShipmentOut, response_model_exclude_unset=True)
def get_shipment(shipment_id: UUID4, request: Request, session: AdminSession):
    shipment = shipments.get_shipment(session, str(shipment_id))
    return shipments.shipment_dict(session, shipment, request.app.state.clock, request.app.state.settings.sensor_gap_minutes)


@router.delete("/shipments/{shipment_id}", response_model=ShipmentDeleteOut)
def delete_shipment(shipment_id: UUID4, session: AdminSession):
    normalized_id = str(shipment_id)
    shipments.delete_shipment(session, normalized_id)
    return {"shipment_id": normalized_id, "deleted": True}


@router.post("/shipments/{shipment_id}/telemetry", response_model=SignedTelemetryOut | TelemetryOut,
             response_model_exclude_unset=True, status_code=201)
def add_telemetry(shipment_id: UUID4, payload: SignedTelemetryCreate | TelemetryCreate,
                  request: Request, response: Response, session: DbSession):
    if isinstance(payload, SignedTelemetryCreate):
        result = signed_ingestion.ingest(
            session,
            str(shipment_id),
            payload,
            request.app.state.clock,
            request.app.state.settings.sensor_gap_minutes,
            request.app.state.settings.max_sample_gap_seconds,
            request.app.state.settings.signed_rate_limit_per_minute,
            request.app.state.settings.integrity_batch_max_records,
            request.app.state.settings.integrity_batch_max_age_minutes,
            request.app.state.integrity_blockchain,
            request.app.state.blockchain,
            request.app.state.insurance_evidence,
        )
        if result["duplicate"]:
            response.status_code = 200
        return result
    if request.app.state.settings.app_env != "development":
        raise signed_ingestion.IngestionError(403, "SIGNED_TELEMETRY_REQUIRED", "Signed telemetry is required")
    sample = shipments.add_telemetry(
        session, str(shipment_id), payload, request.app.state.clock, request.app.state.settings.sensor_gap_minutes,
        request.app.state.blockchain if request.app.state.insurance_evidence is None else None,
        max_sample_gap_seconds=request.app.state.settings.max_sample_gap_seconds,
        evidence_gate=request.app.state.insurance_evidence is not None,
    )
    if request.app.state.insurance_evidence is not None:
        request.app.state.insurance_evidence.reconcile(session, str(shipment_id))
    return shipments.telemetry_dict(sample)


@router.post("/devices", response_model=DeviceOut, status_code=201)
def register_device(payload: DeviceRegister, session: AdminSession):
    device = signed_ingestion.register_device(
        session, payload.device_id, payload.device_name,
    )
    return signed_ingestion.device_view(session, device)


@router.get("/devices", response_model=DevicesOut)
def list_devices(session: AdminSession):
    return signed_ingestion.list_devices(session)


@router.get("/devices/{device_id}", response_model=DeviceOut)
def get_device(device_id: str, session: AdminSession):
    return signed_ingestion.device_view(session, signed_ingestion.get_device(session, device_id))


@router.delete("/devices/{device_id}", response_model=DeviceDeleteOut)
def delete_device(device_id: str, session: AdminSession):
    signed_ingestion.delete_device(session, device_id)
    return {"device_id": device_id, "deleted": True}


@router.post("/devices/{device_id}/keys", response_model=DeviceOut, status_code=201)
def add_device_key(device_id: str, payload: DeviceKeyRegister, session: AdminSession):
    signed_ingestion.add_key(session, device_id, payload.key_id, payload.public_key_pem)
    return signed_ingestion.device_view(session, signed_ingestion.get_device(session, device_id))


@router.patch("/devices/{device_id}", response_model=DeviceOut)
def set_device_status(device_id: str, payload: DeviceStateUpdate, session: AdminSession):
    device = signed_ingestion.get_device(session, device_id, lock=True)
    device.status = payload.status
    session.commit()
    return signed_ingestion.device_view(session, device)


@router.patch("/devices/{device_id}/keys/{key_id}", response_model=DeviceOut)
def set_device_key_status(device_id: str, key_id: str, payload: DeviceStateUpdate, session: AdminSession):
    signed_ingestion.set_key_status(session, device_id, key_id, payload.status)
    return signed_ingestion.device_view(session, signed_ingestion.get_device(session, device_id))


@router.post("/devices/{device_id}/assignments", response_model=DeviceOut)
def set_device_assignment(device_id: str, payload: AssignmentUpdate, session: AdminSession):
    signed_ingestion.set_assignment(session, device_id, payload.shipment_id, payload.active)
    return signed_ingestion.device_view(session, signed_ingestion.get_device(session, device_id))


@router.get("/shipments/{shipment_id}/telemetry", response_model=TelemetryListOut,
            response_model_exclude_unset=True)
def list_telemetry(shipment_id: UUID4, session: AdminSession):
    samples = shipments.list_telemetry(session, str(shipment_id))
    receipts = {item.telemetry_id: item for item in session.scalars(
        select(SignedTelemetryReceipt).where(
            SignedTelemetryReceipt.telemetry_id.in_([sample.id for sample in samples])
        )
    )} if samples else {}
    return {
        "items": [
            shipments.telemetry_dict(sample, receipts.get(sample.id))
            for sample in samples
        ]
    }


@router.get("/shipments/{shipment_id}/events", response_model=EventListOut)
def list_events(shipment_id: UUID4, session: AdminSession):
    return {
        "items": [
            shipments.event_dict(event)
            for event in shipments.list_events(session, str(shipment_id))
        ]
    }


@router.get("/shipments/{shipment_id}/devices", response_model=DeviceHealthListOut)
def list_shipment_devices(shipment_id: UUID4, request: Request, session: AdminSession):
    return {"items": shipment_devices(
        session, str(shipment_id), request.app.state.clock,
        request.app.state.settings.sensor_gap_minutes,
    )}


@router.get("/shipments/{shipment_id}/integrity", response_model=IntegritySummaryOut)
def get_integrity_summary(shipment_id: UUID4, session: AdminSession):
    return batch_service.integrity_summary(session, str(shipment_id))


@router.get("/integrity/summary", response_model=IntegritySummaryOut)
def get_global_integrity_summary(session: AdminSession):
    return batch_service.global_integrity_summary(session)


@router.get("/shipments/{shipment_id}/batches", response_model=IntegrityBatchListOut)
def list_integrity_batches(shipment_id: UUID4, session: AdminSession):
    items = [batch_service.batch_view(session, item) for item in batch_service.list_batches(session, str(shipment_id))]
    return {"items": items, "total": len(items)}


@router.get("/batches", response_model=IntegrityBatchListOut)
def list_all_batches(session: AdminSession):
    items = [batch_service.batch_view(session, item) for item in batch_service.list_all_batches(session)]
    return {"items": items, "total": len(items)}


@router.post(
    "/shipments/{shipment_id}/batches/seal", response_model=IntegrityBatchOut, status_code=201,
)
def seal_integrity_batch(
    shipment_id: UUID4, payload: SealBatchIn, request: Request, session: AdminSession,
):
    settings = request.app.state.settings
    batch = batch_service.seal_ready_batch(
        session,
        str(shipment_id),
        payload.device_id,
        request.app.state.clock.now(),
        max_records=settings.integrity_batch_max_records,
        max_age_minutes=settings.integrity_batch_max_age_minutes,
        force=payload.force,
        anchor_coordinator=request.app.state.integrity_blockchain,
    )
    if batch is None:
        raise batch_service.BatchServiceError(409, "BATCH_NOT_READY", "Batch is not ready to seal")
    batch_service.verify_batch(
        session, batch.id, request.app.state.clock.now(), request.app.state.integrity_blockchain,
    )
    if request.app.state.insurance_evidence is not None:
        request.app.state.insurance_evidence.reconcile(session, str(shipment_id))
    return batch_service.batch_view(session, batch)


@router.get("/batches/{batch_id}", response_model=IntegrityBatchOut)
def get_integrity_batch(batch_id: UUID4, session: AdminSession):
    return batch_service.batch_view(session, batch_service.get_batch(session, str(batch_id)))


@router.post("/batches/{batch_id}/anchor", response_model=IntegrityBatchOut)
def anchor_integrity_batch(batch_id: UUID4, request: Request, session: AdminSession):
    coordinator = request.app.state.integrity_blockchain
    if coordinator is None:
        raise batch_service.BatchServiceError(
            503, "BLOCKCHAIN_NOT_CONFIGURED", "Data Integrity blockchain adapter is not configured",
        )
    batch = batch_service.get_batch(session, str(batch_id))
    coordinator.dispatch(session, batch.id)
    batch = batch_service.get_batch(session, batch.id)
    if batch.anchor_status == "DATA_ANCHORED":
        batch_service.verify_batch(session, batch.id, request.app.state.clock.now(), coordinator)
    if request.app.state.insurance_evidence is not None:
        request.app.state.insurance_evidence.reconcile(session, batch.shipment_id)
    return batch_service.batch_view(session, batch_service.get_batch(session, batch.id))


@router.post("/batches/{batch_id}/verify", response_model=IntegrityVerifyOut)
def verify_integrity_batch(batch_id: UUID4, request: Request, session: AdminSession):
    return batch_service.verify_batch(
        session,
        str(batch_id),
        request.app.state.clock.now(),
        request.app.state.integrity_blockchain,
    )


@router.post("/shipments/{shipment_id}/insurance/reconcile", response_model=ShipmentOut)
def reconcile_insurance_evidence(shipment_id: UUID4, request: Request, session: AdminSession):
    coordinator = request.app.state.insurance_evidence
    if coordinator is None:
        raise batch_service.BatchServiceError(
            503, "EVIDENCE_GATE_NOT_CONFIGURED", "Anchored insurance evidence gate is not configured",
        )
    coordinator.reconcile(session, str(shipment_id))
    shipment = shipments.get_shipment(session, str(shipment_id))
    return shipments.shipment_dict(
        session,
        shipment,
        request.app.state.clock,
        request.app.state.settings.sensor_gap_minutes,
    )

