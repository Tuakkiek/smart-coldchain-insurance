# DESIGN_SYSTEM_IMPLEMENTATION.md

> **Project:** `smart-coldchain-insurance`  
> **Scope:** Component patterns, screen specifications, data states, and frontend implementation rules  
> **Companion document:** [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)

This file turns the shared visual language into practical rules for building the MVP screens. Follow `DESIGN_SYSTEM.md` for colors, typography, spacing, shape, and responsive foundations.

---

## 1. Frontend boundaries

### 1.1 Approved frontend responsibilities

The frontend owns:

- Responsive web interface.
- Dashboard, shipment list, shipment detail, events, and demo UI.
- REST API consumption through a shared API layer.
- Visualizations of Backend-provided telemetry, location, event, insurance, and Blockchain status.
- Loading, error, empty, disconnected, and retry experiences.
- UI tests and demo readiness.

### 1.2 Responsibilities that must stay outside the browser

The frontend must not:

- Call ESP32 devices directly.
- Generate or override shipment coordinates.
- Evaluate whether a temperature breach qualifies for insurance.
- Trigger or sign Blockchain transactions.
- Connect directly to contract RPC endpoints.
- Store private keys, seed phrases, or signer credentials.
- Mark insurance as paid based only on a temperature reading.
- Fabricate production data when the API is unavailable.

**Architecture rule:** React components call the frontend API layer; the API layer calls the Backend REST API. The Backend is the bridge to the Blockchain.

```text
React pages / feature components
              |
              v
       src/api/ client
              |
              v
       Backend REST API
          /        \
         v          v
   Business rules  Blockchain adapter
         |          |
         v          v
    Database    Smart Contract
```

The browser must not bypass this flow.

## 2. Recommended frontend structure

Keep the roadmap's proposed structure. Names may be adapted only by team agreement.

```text
frontend/
  src/
    api/
      client.ts
      shipments.ts
      events.ts
      demo.ts
    components/
      layout/
      ui/
      feedback/
      data-display/
    features/
      dashboard/
      shipments/
      telemetry/
      events/
      demo/
    pages/
    types/
    mocks/
    styles/
      tokens.css
      globals.css
  public/
  tests/
  .env.example
  README.md
  DESIGN_SYSTEM.md
  DESIGN_SYSTEM_IMPLEMENTATION.md
```

Guidelines:

- `components/ui/` contains generic controls such as Button, Input, Select, Card, Badge, and Dialog.
- `components/feedback/` contains LoadingState, EmptyState, ErrorState, and ConnectionStatus.
- `components/data-display/` contains MetricCard, StatusBadge, DataTable, TelemetryChart, EventTimeline, and TransactionHash.
- Feature folders compose shared components into shipment/dashboard workflows.
- `src/api/` is the only place that knows the Backend base URL and performs HTTP requests.
- Keep API types aligned with `docs/contracts/api-v1.md`; do not rename response fields merely to suit a component.

## 3. Application navigation and shell

### 3.1 MVP navigation

Use a compact, stable navigation structure:

| Navigation item | Purpose | Visibility |
|---|---|---|
| Overview | Dashboard summary and recent alerts | Always |
| Shipments | Shipment list and filtering | Always |
| Events | Violation, sensor-gap, and insurance event history | Always when supported by API |
| Demo | Run normal and temperature-breach scenarios | Development/demo only |

Do not show the Demo entry in a production build.

### 3.2 Shell layout

Desktop:

- Persistent left sidebar.
- Compact top bar for page context and API connection state.
- Main region with page title, description, page actions, and content.
- Content starts at a consistent alignment and uses the shared maximum width.

Mobile:

- Collapse the sidebar into a drawer or compact navigation.
- Keep page title and primary action visible without forcing horizontal scrolling.
- Put secondary filters in a collapsible area if necessary.
- Avoid placing critical status only in a hover tooltip.

### 3.3 Page header pattern

Every main page should follow the same rhythm:

```text
Breadcrumb (optional)
Page title                         Primary action (optional)
One-line page description
------------------------------------------------------------
Page content
```

Use one H1 per page. Do not repeat the page title inside the first card.

## 4. Shared component specifications

### 4.1 Button

Variants:

- `primary`: main action.
- `secondary`: supporting action.
- `tertiary`: low-emphasis action.
- `danger`: destructive action, only where such behavior exists.

States:

- default
- hover
- active
- focus-visible
- disabled
- loading

Rules:

- Buttons that trigger an API action must enter loading/disabled state while the request is in flight.
- Prevent duplicate clicks for a running demo scenario.
- Button label must describe the action, not merely say “OK”.
- Do not display a success state until the Backend response confirms it.

### 4.2 Text input, search, and select

- Every field has a persistent visible label.
- Search fields may include a leading search icon, but keep placeholder text concise.
- Filters should have a clear reset action when multiple filters are present.
- Validation text appears adjacent to the affected field.
- Preserve the selected filters while polling or refreshing.

### 4.3 Card

Use cards to group related information, not to wrap every small element.

Card anatomy:

```text
Card
├── Header: title + optional description + optional action
├── Main content
└── Optional footer / metadata
```

- Standard padding: 20–24px desktop; 16px mobile.
- Standard radius: 16px.
- Use a subtle border; shadow is optional.
- Keep card headers aligned across a row of cards.

### 4.4 Metric card

Used for dashboard summaries.

Anatomy:

- Small descriptive label.
- Large value.
- Optional supporting metadata or comparison only when the API provides it.
- Optional small semantic icon.

Do not invent percentage changes, trends, or historical comparisons. If a count is unavailable, show an unavailable/empty value rather than `0` unless the API explicitly returned zero.

### 4.5 Status badge

A status badge is a compact text label with a semantic color treatment.

Rules:

- Use one or two words where practical.
- Keep the same wording and color mapping everywhere.
- Do not rely on badge color alone.
- Do not use success styling for unknown or unrecognized API values.
- Use badges for compact status, not for long explanations.

### 4.6 Data table

Desktop columns should prioritize operational scanning. Recommended shipment columns:

| Column | Content |
|---|---|
| Shipment | Shipment code and cargo type |
| Status | Backend shipment status |
| Latest temperature | Latest value with `°C` and update time |
| Humidity | Latest value with `%` |
| Route progress | `progress_pct` when present |
| Insurance | Backend insurance/payout state |

Rules:

- Use the actual API field names and semantics.
- Sort and filter only on supported data.
- Use a clear row hover state and keyboard-accessible row navigation.
- Keep identifiers and measurements aligned consistently.
- Show an explicit empty state when no shipment matches the filter.
- On small screens, use stacked shipment cards or a deliberate horizontal scroll region.

### 4.7 Telemetry value

For a prominent current reading, show:

- Metric name.
- Value and unit.
- Last received timestamp (`received_at`).
- Applicable threshold or context when relevant.
- Data freshness state.

Do not use `recorded_at` as the primary system timestamp. The roadmap defines Backend-created `received_at` as the primary time for actual violation-duration evaluation; device `recorded_at` is for reference/comparison.

### 4.8 Telemetry chart

- Temperature and humidity must be labeled distinctly with their units.
- The chart must use Backend telemetry points and timestamps.
- Display the policy temperature range (`temp_min_c`, `temp_max_c`) when it helps explain a breach.
- Keep missing-data intervals visible; do not connect distant points in a way that implies continuous observation.
- Provide a readable empty state when there are no measurements.
- Include a textual latest-value summary so essential information is not chart-only.

### 4.9 Map panel

The map panel should contain:

- A title such as “Shipment route”.
- Route line based on Backend origin and destination.
- Current marker only when Backend supplies a location.
- Progress when `progress_pct` is available.
- Last update time.
- A persistent simulation label.

Required label when the Backend response has `location_source === "backend_simulated"`:

> **Vị trí mô phỏng từ Backend**

Do not use “GPS trực tiếp”, “Live GPS”, or wording that suggests physical GPS tracking. If the shipment has not started or coordinates are absent, render a no-location state instead of generating a marker.

### 4.10 Event timeline

The timeline displays Backend events in chronological order, using the event type and timestamp supplied by the API.

The roadmap identifies these event types as examples:

- `TEMPERATURE_BREACH_STARTED`
- `INSURANCE_TRIGGERED`
- `SENSOR_DATA_GAP`

A detail view may also show Blockchain submission and result information when returned by the Backend.

Each event item should contain:

- Human-readable event title.
- Timestamp.
- Short explanation based only on available event data.
- Status or outcome, when supplied.
- Related transaction hash, only when present.

Do not invent missing timeline steps or imply that an event was confirmed when it is only pending.

### 4.11 Transaction hash

- Use monospace typography.
- Show a shortened visual representation while preserving the complete value for copy.
- Provide a copy action with accessible text.
- Provide an external explorer link only when the Backend supplies a valid network/explorer destination or the team explicitly configures one for the demo network.
- Never fabricate an explorer URL.
- If no transaction hash exists, show the relevant state instead of an empty link.

### 4.12 Connection status

The shell should communicate whether the frontend can reach the Backend.

Recommended states:

- Connected: successful recent health/API check.
- Reconnecting: transient failure while retrying.
- Offline: Backend is unreachable.
- Unknown: connection state has not yet been established.

Connection status must be based on actual requests, not a static green dot.

### 4.13 Feedback components

Build and reuse four standard states:

**LoadingState**
- Use skeletons matching the target content shape.
- Avoid a full-page spinner for every local refresh.
- Keep the previous data visible during background refresh when it is safe and clearly mark that it is updating.

**EmptyState**
- State what is missing (for example, no shipments or no telemetry yet).
- Provide a relevant next step only when supported by the current screen.
- Distinguish “no records” from “failed to load”.

**ErrorState**
- State that the request failed in plain language.
- Provide Retry when retry is safe.
- Do not replace the error with mock content.
- Avoid exposing stack traces or internal technical details.

**StaleDataState**
- Show the timestamp of the last successful update when available.
- Explain that the displayed data may be old.
- Do not present old readings as live/current without a freshness indication.

## 5. Screen specifications

## 5.1 Overview dashboard

Purpose: give the operator a quick view of shipment health and recent attention items.

Recommended content order:

1. Page header: “Overview” / “Tổng quan”.
2. Summary metrics:
   - Total shipments.
   - Shipments in transit.
   - Shipments currently in temperature violation.
   - Shipments with insurance process triggered.
3. Recent alerts/events.
4. Shipment overview table/list.

Rules:

- Metric values must come from API response data.
- Do not use fixed demo values in API mode.
- If API returns no summary endpoint, do not derive unsupported totals from a partial page of shipments. Ask for an agreed API response or calculate only from a complete, explicitly provided collection.
- Recent alerts must use actual event records.
- Clearly distinguish a temperature warning from an insurance process that has actually been triggered.

Suggested layout:

```text
Overview
A concise description of current cold-chain operations.

[ Total shipments ] [ In transit ] [ Temperature breach ] [ Insurance triggered ]

[ Recent alerts / events                           ] [ Connection / data status ]

[ Shipment overview table                                                   ]
```

## 5.2 Shipment list

Purpose: find and compare shipments.

Required information from the roadmap:

- Shipment code.
- Cargo type.
- Shipment status.
- Latest temperature.
- Route progress.
- Insurance status.

Recommended controls:

- Search by shipment code.
- Filter by shipment status.
- Optional sort when supported.

Required states:

- Initial loading.
- Loaded list.
- No shipments.
- No search/filter match.
- API error with retry.
- Missing latest telemetry.
- Stale telemetry.

Do not replace missing readings with `0°C` or `0%`.

## 5.3 Shipment detail

Purpose: explain the condition and history of one shipment.

Recommended content hierarchy:

**A. Shipment identity**
- Code, cargo type, shipment status.
- Origin and destination.
- Temperature policy: `temp_min_c` to `temp_max_c`.
- Configured `violation_duration_minutes`.

**B. Current condition**
- Latest temperature and humidity.
- `received_at`.
- Sensor data freshness / gap state.

**C. Route**
- Map and progress.
- Simulation label when the location source is `backend_simulated`.
- No-location state when coordinates are absent.

**D. Telemetry history**
- Temperature and humidity chart.
- Visible gaps in observation history.
- Clear units and timestamps.

**E. Insurance and Blockchain**
- Insured amount in VND.
- Insurance status and payout status.
- Blockchain network, transaction hash, and confirmation status when returned.
- Clearly separated demo-token amount if provided.

**F. Event timeline**
- Violation start.
- Insurance trigger.
- Blockchain transaction submission/result when the Backend provides it.
- Sensor data gap where applicable.

Do not label the shipment “compensated” or “paid” unless the Backend reports a successful payout state.

## 5.4 Events view

Purpose: review system events without confusing different event categories.

Use a unified list or timeline with filters only if the API supports the required fields.

Distinguish:

- Temperature breach started.
- Insurance triggered after policy evaluation.
- Sensor data gap.
- Blockchain pending/success/failed state.

A sensor data gap is an absence of evidence, not proof that the cargo temperature was out of range.

## 5.5 Demo area

The demo area is available only when the Backend is running in development/demo mode.

Required controls from the roadmap:

- Select a sample shipment.
- “Kịch bản bình thường”.
- “Mô phỏng nhiệt độ vượt ngưỡng”.
- Scenario execution state and returned result.

Rules:

- Call the published Backend demo endpoint: `POST /api/v1/demo/shipments/{id}/scenario`.
- Use the documented scenario values: `normal` and `temperature_breach`.
- Do not write fake telemetry directly to the database.
- Do not locally simulate a successful insurance payout or Blockchain transaction.
- Disable scenario buttons while a scenario is running.
- Display an explicit “Mô phỏng” label throughout the demo flow.
- If the endpoint is disabled or unavailable, show that the scenario did not run. Do not display a fake success.
- Keep demo controls out of production UI.

## 6. Business state presentation

The exact API enum values and display labels must be finalized in `docs/contracts/api-v1.md`. The table below defines presentation intent, not a replacement API schema.

| Backend / domain condition | Suggested visual treatment | Important meaning |
|---|---|---|
| Normal readings within configured range | Success/neutral | Current observation is within the shipment's configured range |
| Temperature outside configured range, duration not yet qualified | Warning | Attention needed; do not claim insurance has triggered |
| `TEMPERATURE_BREACH_STARTED` | Warning or danger based on severity policy | Breach has started; duration still matters |
| `INSURANCE_TRIGGERED` | Accent/info or warning | Backend has determined the event meets its configured rule |
| `SENSOR_DATA_GAP` | Neutral/warning | Missing data; do not infer continued breach |
| `BLOCKCHAIN_PENDING` | Info | Transaction has not yet been confirmed successful |
| `SUCCESS` | Success | Use only for the exact successful state represented by the Backend field |
| `FAILED` | Danger | Transaction/process failed; do not show payout as complete |
| Unknown/unrecognized value | Neutral | Preserve truth; do not silently map to success |

Notes:

- The roadmap explicitly names `BLOCKCHAIN_PENDING`, `SUCCESS`, and `FAILED` for Blockchain synchronization.
- Do not assume that the same `SUCCESS` enum applies to every domain field without checking the API contract.
- A temperature breach, insurance trigger, transaction submission, transaction confirmation, and payout are separate concepts. Keep them visually and verbally distinct.

## 7. Data formatting

Use consistent formatting across cards, tables, charts, and detail pages.

| Data | Display rule |
|---|---|
| Temperature | Number with one decimal place where useful, followed by `°C` |
| Humidity | Number with one decimal place where useful, followed by `%` |
| Route progress | Percentage only when `progress_pct` is supplied |
| Time | Format an ISO 8601 timestamp as a localized date/time; show timezone context consistently |
| Shipment code / ID | Preserve exact Backend value |
| Insured amount | Format as VND using the Backend-provided amount |
| Demo token payout | Show separately with “Token demo”; do not convert to VND |
| Transaction hash | Monospace, shortened visually, full value available to copy |
| Missing numeric value | Show “Chưa có dữ liệu” / “—”, never a fabricated zero |

For times, distinguish the Backend's `received_at` from device `recorded_at`. The Backend's `received_at` is the primary system timestamp for violation-duration logic.

## 8. API integration rules

### 8.1 Single API client

All REST calls must go through `src/api/`.

Responsibilities of the API layer:

- Read `VITE_API_BASE_URL`.
- Set common request headers.
- Parse successful responses.
- Normalize request errors into a predictable frontend error type.
- Handle request timeouts if configured.
- Keep endpoint paths and query parameters out of presentational components.

Do not scatter direct `fetch()` calls across pages or components.

### 8.2 API contract is authoritative

Before defining TypeScript interfaces, read `docs/contracts/api-v1.md` and verify the published OpenAPI schema.

The roadmap lists these response concepts for shipment detail:

- `id`, `code`, `cargo_type`, `status`
- `temp_min_c`, `temp_max_c`, `violation_duration_minutes`
- `latest_telemetry`
- `location` with `latitude`, `longitude`, `location_source`, `progress_pct`
- `insurance` with `insured_amount_vnd`, `status`, `payout_status`
- `blockchain` with `network`, `transaction_hash`, `confirmation_status` when a transaction exists

The final property names, nullability, and enum values must match the actual contract. Do not infer additional fields from this summary.

### 8.3 Mock mode

- Mock data is permitted only when an explicit development/mock flag is enabled.
- Use fixtures for at least three cases: normal, currently violating, and insurance triggered.
- Make mock mode visible in the UI with a `MOCK DATA` indicator.
- Never fall back to mock automatically after a real API error.
- Never ship mock mode enabled by default in production.
- Keep fixtures aligned with the agreed API schema.

### 8.4 Polling and refresh

- Use a reasonable polling interval agreed by the team.
- Clean up timers/subscriptions when components unmount.
- Avoid starting multiple polling loops for the same resource.
- Avoid resetting the selected filter or scroll position during a refresh.
- Show a subtle updating indicator instead of flashing the entire page.
- If a refresh fails, preserve last known data only with a visible stale/disconnected state.

## 9. UI copy and terminology

Prefer precise, plain Vietnamese labels. The team may use English page titles if the overall product chooses one language, but do not mix languages randomly.

Recommended labels:

| Concept | Recommended label |
|---|---|
| Overview | Tổng quan |
| Shipments | Lô hàng |
| Events | Sự kiện |
| Demo | Khu vực mô phỏng |
| Temperature | Nhiệt độ |
| Humidity | Độ ẩm |
| Latest update | Cập nhật lần cuối |
| Simulated location | Vị trí mô phỏng từ Backend |
| Temperature range | Ngưỡng nhiệt độ |
| Insurance amount | Số tiền bảo hiểm |
| Demo token payout | Khoản chi trả bằng token demo |
| Blockchain pending | Đang chờ xác nhận Blockchain |
| Transaction successful | Giao dịch thành công |
| Transaction failed | Giao dịch thất bại |
| Sensor data gap | Mất tín hiệu / thiếu dữ liệu cảm biến |
| No data | Chưa có dữ liệu |
| API unavailable | Không thể kết nối Backend |

Avoid these misleading phrases:

- “GPS trực tiếp” for Backend-simulated coordinates.
- “Đã bồi thường” when the transaction is pending or failed.
- “Tiền Blockchain” for demo tokens.
- “Hàng đã hỏng” based only on missing telemetry.
- “Đang an toàn” when sensor data is stale or unavailable.

## 10. QA acceptance checklist

Use this checklist during implementation and before the project demonstration.

### Visual consistency

- [ ] All pages use shared color, typography, spacing, radius, and border tokens.
- [ ] Heading hierarchy is consistent.
- [ ] Buttons, inputs, cards, badges, and tables use shared components.
- [ ] No one-off saturated colors, gradients, or heavy shadows have been added.
- [ ] Desktop, tablet, and mobile layouts are usable.

### Data correctness

- [ ] TypeScript types match `docs/contracts/api-v1.md` and OpenAPI.
- [ ] The frontend uses the shared API client.
- [ ] No production metric or shipment value is hard-coded.
- [ ] Mock mode is explicit and visibly labeled.
- [ ] API failure does not silently switch to mock data.
- [ ] Missing telemetry is not displayed as zero.
- [ ] `received_at` is distinguished from `recorded_at`.
- [ ] Sensor data gaps are not represented as confirmed temperature breaches.

### Location correctness

- [ ] Map origin, destination, route, and marker come from Backend response data.
- [ ] Marker is absent when coordinates are absent.
- [ ] `backend_simulated` is labeled “Vị trí mô phỏng từ Backend”.
- [ ] No UI text claims GPS tracking or a real road route.

### Insurance and Blockchain correctness

- [ ] Temperature breach and insurance trigger are shown as separate states.
- [ ] Pending/failed Blockchain state is not shown as payout success.
- [ ] VND insured amount is separate from demo-token payout.
- [ ] Transaction hash is shown only when supplied by the Backend.
- [ ] Frontend contains no private key, signer, direct RPC, or contract transaction code.

### Interaction and resilience

- [ ] Loading, empty, error, stale, and retry states are implemented.
- [ ] Repeated demo submissions are prevented while a request is running.
- [ ] Polling is cleaned up on unmount and does not duplicate.
- [ ] Filters remain stable during refresh.
- [ ] Keyboard focus and labels are usable.
- [ ] Browser console and network panel have no avoidable errors or duplicate requests.

## 11. Definition of done for a frontend screen

A screen is ready for review only when:

1. It follows both design-system documents.
2. It uses shared components for repeated UI patterns.
3. It is connected to the agreed API contract or an explicitly enabled mock adapter.
4. It handles loading, empty, error, and missing/stale data.
5. It does not invent business state or operational data.
6. It is responsive at desktop and mobile widths.
7. Its key interactions are keyboard accessible.
8. Its displayed terminology does not overstate simulated location, insurance, or Blockchain completion.

---

## 12. Ownership and change control

- Member 3 owns `frontend/` and these frontend design documents.
- Member 1 owns `backend/`, `device/`, and `docs/contracts/api-v1.md`.
- Member 2 owns `blockchain/` and its ABI/integration documents.
- Frontend must not change Backend field names to fit the UI.
- When a required field is missing, submit an issue with the use case and expected request/response; Member 1 updates the API contract.
- When Blockchain semantics or event fields change, Member 2 and Member 1 coordinate the integration contract; frontend consumes the resulting Backend response.
- If a UI requirement conflicts with actual API behavior, preserve data correctness and raise the mismatch rather than simulating a result.
