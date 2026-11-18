"""Google Maps URL parsing, safe short-link resolution, and geocoding service.

Security guarantees:
- Strict Google Maps domain allowlist for outbound redirect resolution.
- DNS IP validation blocking private, loopback, link-local, multicast, and reserved IPs (anti-SSRF).
- Bounded manual redirect loop (no blind follow_redirects) and strict HTTP timeouts.
- Never fabricates coordinates when geocoding fails.
"""

from __future__ import annotations

import ipaddress
import math
import re
import socket
from dataclasses import dataclass
from typing import Callable
from urllib.parse import parse_qs, unquote_plus, urljoin, urlparse

import httpx


MAX_REDIRECTS = 5
HTTP_TIMEOUT_SECONDS = 5.0

# Strict allowlist of Google Maps hosts allowed for redirect resolution
_ALLOWED_EXACT_HOSTS = {
    "maps.app.goo.gl",
    "goo.gl",
    "maps.google.com",
    "maps.google.com.vn",
    "www.google.com",
    "google.com",
    "www.google.com.vn",
    "google.com.vn",
}

_SHORT_LINK_HOSTS = {"maps.app.goo.gl", "goo.gl"}

# Coordinate extraction patterns
_PIN_3D_4D_RE = re.compile(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)")
_AT_COORDS_RE = re.compile(r"@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$|/)")
_COORDS_PAIR_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")
_PLACE_PATH_RE = re.compile(r"/maps/place/([^/@?#]+)")
_SEARCH_PATH_RE = re.compile(r"/maps/search/([^/@?#]+)")
_URL_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")


class LocationResolveError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class ResolvedLocation:
    address: str
    formatted_address: str
    latitude: float
    longitude: float
    place_id: str | None
    source: str


def _validate_coordinates(lat: float, lng: float) -> tuple[float, float]:
    if not (math.isfinite(lat) and math.isfinite(lng)):
        raise LocationResolveError(422, "INVALID_COORDINATES", "Tọa độ không hợp lệ")
    if not (-90.0 <= lat <= 90.0):
        raise LocationResolveError(422, "INVALID_COORDINATES", "Vĩ độ phải nằm trong khoảng -90 đến 90")
    if not (-180.0 <= lng <= 180.0):
        raise LocationResolveError(422, "INVALID_COORDINATES", "Kinh độ phải nằm trong khoảng -180 đến 180")
    return round(lat, 6), round(lng, 6)


def _is_url_like(text: str) -> bool:
    lower = text.lower()
    if _URL_SCHEME_RE.match(text):
        return True
    if lower.startswith(("maps.app.goo.gl/", "goo.gl/maps/", "www.google.com/maps", "maps.google.com")):
        return True
    return False


def _normalize_url(text: str) -> str:
    if _URL_SCHEME_RE.match(text):
        return text
    return f"https://{text}"


def _is_allowed_google_maps_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_EXACT_HOSTS:
        return False
    if parsed.username or parsed.password:
        return False
    if parsed.port not in {None, 80, 443}:
        return False
    if host == "goo.gl":
        return parsed.path.startswith("/maps")
    if host in {"www.google.com", "google.com", "www.google.com.vn", "google.com.vn"}:
        return (
            parsed.path.startswith("/maps")
            or parsed.path.startswith("/search")
            or parsed.path == "/"
            or parsed.path == ""
        )
    return True


def _is_public_ip(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return (
        addr.is_global
        and not addr.is_private
        and not addr.is_loopback
        and not addr.is_link_local
        and not addr.is_multicast
        and not addr.is_reserved
        and not addr.is_unspecified
    )


def _assert_safe_host(hostname: str, resolver: Callable = socket.getaddrinfo) -> None:
    try:
        infos = resolver(hostname, None)
    except OSError as exc:
        raise LocationResolveError(
            502, "URL_RESOLUTION_FAILED", "Không thể phân giải tên miền Google Maps"
        ) from exc
    if not infos:
        raise LocationResolveError(
            502, "URL_RESOLUTION_FAILED", "Không thể phân giải địa chỉ máy chủ Google Maps"
        )
    for info in infos:
        ip_str = info[4][0]
        if not _is_public_ip(ip_str):
            raise LocationResolveError(
                400, "UNSUPPORTED_URL", "Đường dẫn không hợp lệ hoặc bị chặn bởi chính sách bảo mật"
            )


def extract_from_google_maps_url(url: str) -> tuple[float | None, float | None, str | None]:
    """Extract (lat, lng, place_query) from a Google Maps URL without network I/O."""
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)

    lat: float | None = None
    lng: float | None = None
    query_label: str | None = None

    # Extract readable place label from path if available
    place_match = _PLACE_PATH_RE.search(parsed.path)
    if place_match:
        decoded_place = unquote_plus(place_match.group(1)).strip()
        if decoded_place and not _COORDS_PAIR_RE.fullmatch(decoded_place):
            query_label = decoded_place
    else:
        search_match = _SEARCH_PATH_RE.search(parsed.path)
        if search_match:
            decoded_search = unquote_plus(search_match.group(1)).strip()
            if decoded_search:
                pair = _COORDS_PAIR_RE.fullmatch(decoded_search)
                if pair:
                    lat, lng = float(pair.group(1)), float(pair.group(2))
                else:
                    query_label = decoded_search

    # 1. Prefer exact place pin coordinates !3dLAT!4dLNG (more accurate than @viewport)
    pin_matches = _PIN_3D_4D_RE.findall(url)
    if pin_matches:
        lat_str, lng_str = pin_matches[-1]
        lat, lng = float(lat_str), float(lng_str)

    # 2. Fallback to @lat,lng in URL path
    if lat is None or lng is None:
        at_match = _AT_COORDS_RE.search(url)
        if at_match:
            lat, lng = float(at_match.group(1)), float(at_match.group(2))

    # 3. Check query parameters: q=, query=, ll=, center=
    for key in ("q", "query", "ll", "center"):
        values = qs.get(key)
        if not values:
            continue
        raw_val = unquote_plus(values[0]).strip()
        if not raw_val:
            continue
        pair = _COORDS_PAIR_RE.fullmatch(raw_val)
        if pair:
            if lat is None or lng is None:
                lat, lng = float(pair.group(1)), float(pair.group(2))
        elif not query_label:
            query_label = raw_val

    if lat is not None and lng is not None:
        lat, lng = _validate_coordinates(lat, lng)

    return lat, lng, query_label


class GoogleMapsService:
    """Resolves Google Maps URLs, short links, and text addresses into coordinates."""

    def __init__(
        self,
        api_key: str = "",
        *,
        allow_nominatim_fallback: bool = True,
        http_client_factory: Callable[[], httpx.Client] | None = None,
        dns_resolver: Callable = socket.getaddrinfo,
    ):
        self.api_key = api_key.strip()
        self.allow_nominatim_fallback = allow_nominatim_fallback
        self._http_client_factory = http_client_factory
        self._dns_resolver = dns_resolver

    def _client(self) -> httpx.Client:
        if self._http_client_factory is not None:
            return self._http_client_factory()
        return httpx.Client(
            timeout=HTTP_TIMEOUT_SECONDS,
            follow_redirects=False,
            headers={"User-Agent": "SmartColdChainInsurance/1.0 (+coldchain-location-resolver)"},
        )

    def _resolve_short_url(self, start_url: str) -> str:
        current = start_url
        with self._client() as client:
            for _ in range(MAX_REDIRECTS):
                if not _is_allowed_google_maps_url(current):
                    raise LocationResolveError(
                        400,
                        "UNSUPPORTED_URL",
                        "Chỉ hỗ trợ phân giải các đường dẫn Google Maps hợp lệ",
                    )
                parsed = urlparse(current)
                _assert_safe_host(parsed.hostname or "", self._dns_resolver)
                try:
                    response = client.get(current)
                except httpx.TimeoutException as exc:
                    raise LocationResolveError(
                        504,
                        "URL_RESOLUTION_TIMEOUT",
                        "Hết thời gian chờ khi phân giải đường dẫn Google Maps rút gọn",
                    ) from exc
                except httpx.HTTPError as exc:
                    raise LocationResolveError(
                        502,
                        "URL_RESOLUTION_FAILED",
                        "Không thể kết nối tới Google Maps để phân giải đường dẫn rút gọn",
                    ) from exc

                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        break
                    next_url = urljoin(current, location)
                    if not _is_allowed_google_maps_url(next_url):
                        raise LocationResolveError(
                            400,
                            "UNSUPPORTED_REDIRECT",
                            "Đường dẫn chuyển hướng nằm ngoài phạm vi Google Maps được phép",
                        )
                    current = next_url
                    # Stop early if coordinates are already present in the redirected URL
                    lat, lng, _ = extract_from_google_maps_url(current)
                    if lat is not None and lng is not None:
                        return current
                    continue
                break
        return current

    def _geocode_google(self, query: str) -> ResolvedLocation:
        with self._client() as client:
            try:
                response = client.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={"address": query, "key": self.api_key, "language": "vi"},
                )
                response.raise_for_status()
                payload = response.json()
            except httpx.TimeoutException as exc:
                raise LocationResolveError(
                    504, "GEOCODING_TIMEOUT", "Hết thời gian chờ khi gọi Google Maps Geocoding API"
                ) from exc
            except (httpx.HTTPError, ValueError) as exc:
                raise LocationResolveError(
                    502, "GEOCODING_FAILED", "Không thể kết nối Google Maps Geocoding API"
                ) from exc

        status = payload.get("status")
        results = payload.get("results") or []
        if status == "ZERO_RESULTS" or not results:
            raise LocationResolveError(
                404,
                "LOCATION_NOT_FOUND",
                "Không tìm thấy địa điểm phù hợp. Vui lòng kiểm tra lại địa chỉ hoặc dán link Google Maps chứa tọa độ.",
            )
        if status != "OK":
            raise LocationResolveError(
                502,
                "GEOCODING_FAILED",
                f"Google Maps Geocoding API trả về lỗi ({status or 'UNKNOWN'})",
            )

        top = results[0]
        geometry = (top.get("geometry") or {}).get("location") or {}
        if "lat" not in geometry or "lng" not in geometry:
            raise LocationResolveError(
                404, "LOCATION_NOT_FOUND", "Không trích xuất được tọa độ từ kết quả Geocoding"
            )
        lat, lng = _validate_coordinates(float(geometry["lat"]), float(geometry["lng"]))
        formatted = str(top.get("formatted_address") or query).strip()
        place_id = top.get("place_id")
        return ResolvedLocation(
            address=formatted,
            formatted_address=formatted,
            latitude=lat,
            longitude=lng,
            place_id=str(place_id) if place_id else None,
            source="google_maps_geocoding",
        )

    def _geocode_nominatim(self, query: str) -> ResolvedLocation:
        with self._client() as client:
            try:
                response = client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": query, "format": "json", "limit": 1, "accept-language": "vi"},
                )
                response.raise_for_status()
                results = response.json()
            except httpx.TimeoutException as exc:
                raise LocationResolveError(
                    504, "GEOCODING_TIMEOUT", "Hết thời gian chờ khi tìm kiếm tọa độ địa chỉ"
                ) from exc
            except (httpx.HTTPError, ValueError) as exc:
                raise LocationResolveError(
                    502, "GEOCODING_FAILED", "Dịch vụ tìm kiếm địa chỉ tạm thời không khả dụng"
                ) from exc

        if not isinstance(results, list) or not results:
            raise LocationResolveError(
                404,
                "LOCATION_NOT_FOUND",
                "Không tìm thấy địa điểm phù hợp. Vui lòng nhập địa chỉ chi tiết hơn hoặc dán link Google Maps chứa tọa độ.",
            )
        top = results[0]
        try:
            lat, lng = _validate_coordinates(float(top["lat"]), float(top["lon"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise LocationResolveError(
                404, "LOCATION_NOT_FOUND", "Không trích xuất được tọa độ hợp lệ cho địa chỉ này"
            ) from exc
        formatted = str(top.get("display_name") or query).strip()
        return ResolvedLocation(
            address=query,
            formatted_address=formatted,
            latitude=lat,
            longitude=lng,
            place_id=None,
            source="nominatim_geocoding",
        )

    def _geocode_query(self, query: str) -> ResolvedLocation:
        if self.api_key:
            return self._geocode_google(query)
        if self.allow_nominatim_fallback:
            return self._geocode_nominatim(query)
        raise LocationResolveError(
            503,
            "GEOCODING_NOT_CONFIGURED",
            "GOOGLE_MAPS_API_KEY chưa được cấu hình. Vui lòng dán đường dẫn Google Maps chứa tọa độ hoặc cấu hình API Key.",
        )

    def resolve(self, raw_input: str) -> ResolvedLocation:
        text = raw_input.strip()
        if not text:
            raise LocationResolveError(422, "EMPTY_LOCATION_INPUT", "Vui lòng nhập địa chỉ hoặc đường dẫn Google Maps")

        # Direct coordinate pair "21.0285, 105.8542"
        direct_pair = _COORDS_PAIR_RE.fullmatch(text)
        if direct_pair:
            lat, lng = _validate_coordinates(float(direct_pair.group(1)), float(direct_pair.group(2)))
            label = f"{lat}, {lng}"
            return ResolvedLocation(
                address=label,
                formatted_address=label,
                latitude=lat,
                longitude=lng,
                place_id=None,
                source="coordinates",
            )

        if _is_url_like(text):
            url = _normalize_url(text)
            if not _is_allowed_google_maps_url(url):
                raise LocationResolveError(
                    400,
                    "UNSUPPORTED_URL",
                    "Chỉ chấp nhận đường dẫn Google Maps hợp lệ (google.com/maps, maps.google.com, maps.app.goo.gl)",
                )

            parsed = urlparse(url)
            host = (parsed.hostname or "").lower()
            if host in _SHORT_LINK_HOSTS:
                url = self._resolve_short_url(url)

            lat, lng, place_label = extract_from_google_maps_url(url)
            if lat is not None and lng is not None:
                display_name = place_label or f"{lat}, {lng}"
                return ResolvedLocation(
                    address=display_name,
                    formatted_address=display_name,
                    latitude=lat,
                    longitude=lng,
                    place_id=None,
                    source="google_maps_url",
                )

            if place_label:
                return self._geocode_query(place_label)

            raise LocationResolveError(
                422,
                "COORDINATES_NOT_FOUND",
                "Không thể trích xuất tọa độ hoặc tên địa điểm từ đường dẫn Google Maps này",
            )

        # Plain text address
        return self._geocode_query(text)
