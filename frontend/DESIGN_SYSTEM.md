# DESIGN_SYSTEM.md

> **Project:** `smart-coldchain-insurance`  
> **Scope:** Shared visual language and design tokens for `frontend/`  
> **Status:** Baseline for MVP  
> **Product direction:** Calm, precise, minimal — inspired by the clarity and restraint of Apple interfaces, without copying Apple's proprietary UI.

---

## 1. Purpose

This document defines the visual rules that every frontend page and component must follow. The goal is to make the cold-chain insurance dashboard feel like one coherent product, even when multiple people implement different features.

The interface should help an operator answer four questions quickly:

1. Which shipments are healthy, at risk, or missing data?
2. What are the latest temperature and humidity readings?
3. Where is each shipment on its **simulated** route?
4. What is the actual insurance and Blockchain processing state?

The UI is a monitoring and demonstration interface, not the source of business truth. Backend responses are authoritative for shipment, violation, insurance, location, and Blockchain states.

## 2. Design principles

### 2.1 Clarity before decoration

- Use whitespace, hierarchy, and alignment instead of decorative borders or gradients.
- Give each screen one clear primary task.
- Keep labels short and values easy to scan.
- Avoid unnecessary charts, badges, icons, and animation.

### 2.2 Quiet, focused surfaces

- Use a soft neutral application canvas with white content surfaces.
- Reserve saturated colors for primary actions, links, and meaningful status indicators.
- Use subtle borders before shadows. Shadows should never make every element appear to float.
- Avoid glassmorphism, neon colors, heavy gradients, glossy effects, and excessive rounded pills.

### 2.3 Data must remain honest

- Display only values returned by the Backend or explicitly labeled development fixtures.
- Never fabricate dashboard totals or shipment data in API mode.
- Never silently switch to mock data when a real API request fails.
- Label simulated location clearly whenever `location_source === "backend_simulated"`.
- Do not label a simulated route as GPS, live tracking, or a real road route.
- Do not infer a successful insurance payout from a temperature breach alone.
- Keep the insured amount in VND separate from demo-token payout values. Do not imply that demo tokens are VND or real money.
- Show Blockchain state only from Backend response data. The browser must not interact directly with the contract or RPC endpoint.

### 2.4 Consistency over one-off styling

- Use the tokens in this document instead of introducing local colors, spacing, or radii.
- Reuse shared components for repeated patterns.
- If a new visual pattern is required, add it to the shared system before using it on multiple pages.

## 3. Brand and visual language

**Personality:** professional, composed, accurate, modern, and approachable.

**Visual keywords:** clean surfaces, generous whitespace, strong typography, restrained blue accents, precise data presentation, subtle separators.

Apple is an inspiration for simplicity and hierarchy only. Do not reproduce Apple's product screens, logos, proprietary icons, or exact layouts.

## 4. Foundations

### 4.1 Color tokens

Use semantic tokens in components. Do not hard-code hex values in feature components.

#### Light theme — default

| Token | Value | Usage |
|---|---:|---|
| `--color-canvas` | `#F5F5F7` | Overall app background |
| `--color-surface` | `#FFFFFF` | Cards, tables, panels, dialogs |
| `--color-surface-secondary` | `#FBFBFD` | Nested sections, subtle input backgrounds |
| `--color-surface-hover` | `#F2F2F5` | Hover state for rows and controls |
| `--color-text-primary` | `#1D1D1F` | Main headings and values |
| `--color-text-secondary` | `#6E6E73` | Descriptions, metadata, secondary labels |
| `--color-text-tertiary` | `#86868B` | Hints and low-emphasis metadata |
| `--color-border` | `#D2D2D7` | Main borders and dividers |
| `--color-border-subtle` | `#E8E8ED` | Low-emphasis separators |
| `--color-accent` | `#007AFF` | Primary action, links, selected state |
| `--color-accent-hover` | `#0066D6` | Primary action hover |
| `--color-accent-soft` | `#EAF3FF` | Selected/active subtle background |
| `--color-success` | `#248A3D` | Confirmed healthy/success state |
| `--color-success-soft` | `#EAF6EC` | Success container background |
| `--color-warning` | `#B76E00` | Warning/approaching threshold |
| `--color-warning-soft` | `#FFF4DF` | Warning container background |
| `--color-danger` | `#D70015` | Confirmed temperature breach/error |
| `--color-danger-soft` | `#FDECEE` | Critical alert background |
| `--color-info` | `#3B6FB6` | Informational state |
| `--color-info-soft` | `#EDF4FC` | Informational container background |
| `--color-neutral` | `#73737A` | Unknown, inactive, or neutral state |
| `--color-neutral-soft` | `#F0F0F2` | Neutral container background |
| `--color-focus-ring` | `#80B7FF` | Keyboard focus outline |

**Rules**

- Accent blue is for interaction and selected navigation, not for every data series.
- Red is reserved for confirmed critical conditions, errors, and failed states.
- Orange is for warnings and attention-needed states. Do not use it to imply a confirmed insurance payout.
- Green means a state confirmed by the system, not merely a visually positive trend.
- A status must remain understandable without color. Pair color with text and, where useful, an icon.

#### Optional dark theme

Dark mode is optional for the MVP. Do not build a second theme until the light theme and all required states are complete. If dark mode is added, map the same semantic tokens to dark values; do not invert colors mechanically. Verify charts, map labels, focus states, and status contrast independently.

### 4.2 Typography

Use the operating-system system font stack for a native, clean appearance and broad platform support.

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
```

Use a consistent type scale:

| Token | Size / line height | Weight | Usage |
|---|---:|---:|---|
| `--text-xs` | `12px / 16px` | 400–500 | Tiny metadata, chart ticks |
| `--text-sm` | `13px / 20px` | 400–500 | Secondary information, table metadata |
| `--text-md` | `15px / 22px` | 400–500 | Default body and controls |
| `--text-lg` | `17px / 24px` | 500–600 | Card headings, emphasized body |
| `--text-xl` | `20px / 28px` | 600 | Section headings |
| `--text-2xl` | `26px / 32px` | 600 | Page headings |
| `--text-3xl` | `32px / 38px` | 600 | Main dashboard figures |

Typography rules:

- Use `font-weight: 400` for normal body text, `500` for emphasis, and `600` for headings.
- Avoid using bold on every label.
- Use tabular numerals for measurements, percentages, amounts, and timestamps where supported: `font-variant-numeric: tabular-nums`.
- Use the monospace stack for transaction hashes, IDs, and technical identifiers.
- Do not reduce important data below 13px on desktop or mobile.

### 4.3 Spacing scale

Use a 4px base grid. Prefer these values; do not add arbitrary spacing values without a reason.

| Token | Value | Typical use |
|---|---:|---|
| `--space-1` | `4px` | Icon-to-label gap |
| `--space-2` | `8px` | Tight inline spacing |
| `--space-3` | `12px` | Control internal spacing |
| `--space-4` | `16px` | Standard component spacing |
| `--space-5` | `20px` | Card content grouping |
| `--space-6` | `24px` | Section spacing |
| `--space-8` | `32px` | Large section spacing |
| `--space-10` | `40px` | Page-level separation |
| `--space-12` | `48px` | Major page spacing |
| `--space-16` | `64px` | Large empty-space rhythm |

### 4.4 Shape and elevation

| Token | Value | Usage |
|---|---:|---|
| `--radius-sm` | `8px` | Small controls, tags |
| `--radius-md` | `12px` | Inputs, buttons, compact panels |
| `--radius-lg` | `16px` | Cards and standard content panels |
| `--radius-xl` | `20px` | Large feature panels or dialogs |
| `--radius-pill` | `999px` | Small status badges only |
| `--shadow-card` | `0 2px 10px rgba(0,0,0,.035)` | Optional card separation |
| `--shadow-popover` | `0 8px 28px rgba(0,0,0,.12)` | Menus and popovers |

Rules:

- Prefer a 1px border over a visible shadow for standard cards.
- Do not stack multiple shadows.
- Do not make all buttons pill-shaped. Use a 10–12px radius for normal buttons.

### 4.5 Borders

- Standard border: `1px solid var(--color-border-subtle)`.
- Strong border: `1px solid var(--color-border)`.
- Dividers should be subtle and should not create a grid around every text element.
- Use borders to group content, not to decorate it.

### 4.6 Icons

- Use one consistent outline icon family throughout the app.
- Standard size: 16px for inline icons, 18–20px for controls, 20–24px for feature icons.
- Use icons as supporting cues, not replacements for labels.
- Do not mix filled, outlined, emoji, and custom icon styles within the same navigation or status system.
- Decorative icons should be hidden from assistive technology; meaningful icon-only buttons need an accessible name.

## 5. Layout system

### 5.1 Application shell

The product is a desktop-first monitoring dashboard that must remain usable on mobile.

Recommended desktop shell:

- Sidebar: `232–256px` wide.
- Top bar: `60–68px` high.
- Main content maximum width: `1440px`.
- Main content horizontal padding: `32px` on wide desktop, `24px` on standard desktop.
- Main content vertical padding: `24–32px`.
- Page content should align to a consistent left edge.

The shell should include:

1. A compact brand/product area.
2. Primary navigation: Overview, Shipments, Events (and Demo only in development/demo mode).
3. A connection/system-status area that reflects the actual API state.
4. A main content region with page title, optional description, and page actions.

Do not add navigation destinations that are not part of the MVP without product agreement.

### 5.2 Responsive breakpoints

Use a small, consistent breakpoint set:

| Breakpoint | Width | Behavior |
|---|---:|---|
| Mobile | `< 640px` | Single-column layout; sidebar becomes a drawer or compact navigation |
| Tablet | `640–1023px` | Compact navigation; two-column cards only when content fits |
| Desktop | `1024–1439px` | Full dashboard shell; adaptive grids |
| Wide desktop | `>= 1440px` | Center content and cap maximum width |

Responsive rules:

- No horizontal page scrolling at common viewport widths.
- Tables may use a deliberate horizontal scroll container on small screens; do not shrink text until unreadable.
- Convert dense rows into stacked shipment cards on mobile when needed.
- Dashboard metric cards: 4 columns on wide desktop, 2 on tablet, 1–2 on mobile depending on available width.
- On shipment detail, stack map and telemetry sections vertically on narrow screens.
- Keep primary actions reachable and clearly separated from destructive or secondary actions.

### 5.3 Grid

- Use CSS Grid for dashboard metrics and major page regions.
- Use Flexbox for toolbars, card headers, and inline alignment.
- Maintain consistent gutters of 16–24px.
- Avoid deeply nested cards. A card inside another card should be exceptional.

## 6. Interaction principles

### 6.1 Buttons

Use three levels:

- **Primary:** one prominent action per page or local workflow. Accent blue background, white text.
- **Secondary:** neutral surface with border.
- **Tertiary/Ghost:** text or subtle surface, for low-priority actions.

Button rules:

- Height: 40px standard; 36px compact; 44px touch-friendly.
- Horizontal padding: 14–16px.
- Include a visible hover, active, disabled, and keyboard-focus state.
- Show a loading state while an action is in progress.
- Prevent repeated submission while a demo scenario or mutation is running.
- Destructive actions must use explicit labels and a confirmation step when appropriate.

### 6.2 Inputs and filters

- Inputs and selects should be at least 40px high.
- Always show a visible label; placeholders are examples, not labels.
- Put validation feedback next to the relevant field.
- Preserve search/filter state during data refresh unless the user changes it.
- Avoid clearing the entire filter set after a failed request.

### 6.3 Feedback

Every asynchronous view or action must have a deliberate state:

- Loading: restrained skeleton or progress indicator.
- Success: concise confirmation based on the response.
- Error: plain-language explanation and retry path where retry is safe.
- Empty: explain what is absent and what the user can do next.
- Stale/disconnected: show the last update time and make the connection issue visible.

Do not show a success toast before the Backend confirms success.

## 7. Data visualization rules

### 7.1 Temperature and humidity

- Temperature unit: `°C`.
- Humidity unit: `%`.
- Show the latest value, measurement time, and applicable shipment threshold together.
- Show threshold bounds from the selected shipment's policy (`temp_min_c`, `temp_max_c`).
- Use chart axes with units and readable timestamps.
- Do not imply continuity across long telemetry gaps. Gaps should remain visible in the chart.
- Do not fill missing data with interpolated values unless the visualization explicitly labels it as an estimate and the Backend provides/approves that behavior.

### 7.2 Status visualization

- Use semantic color plus a text label.
- Keep labels consistent across cards, tables, detail screens, and timeline.
- Avoid ambiguous labels such as “Good”, “Done”, or “Paid” unless they match an explicit Backend state.
- Unknown enum values must not be silently mapped to success. Display a neutral fallback and log/report the unexpected value for development.

### 7.3 Maps

- Use Leaflet as specified by the frontend roadmap.
- Draw the route from Backend-provided origin/destination and place the marker using Backend-provided coordinates.
- Treat coordinates as absent when the API has not supplied them; do not invent a marker.
- When `location_source === "backend_simulated"`, visibly display **“Vị trí mô phỏng từ Backend”** near the map or location summary.
- Do not call it GPS, live GPS, or actual vehicle tracking.
- If there is no telemetry/route position yet, show a no-location state instead of a fabricated location.

### 7.4 Blockchain and insurance

- Show the insured value in VND as a Backend business value.
- Show demo token payout amount separately, with a clear “Token demo” label.
- Never convert token units to VND without a formally agreed conversion supplied by the system.
- Display `transaction_hash` only when available. Use monospace text, truncate visually, and provide copy/open behavior only when a valid destination is supplied.
- A pending or failed transaction is not a completed payout.
- Frontend does not sign transactions, store private keys, or call Blockchain RPC directly.

## 8. Accessibility baseline

- Maintain readable text contrast against the actual surface color.
- Every interactive control must be keyboard reachable and show focus.
- Use semantic HTML elements and correct heading order.
- Associate form labels and validation text with their inputs.
- Do not communicate status through color alone.
- Provide accessible names for icon-only controls.
- Respect reduced-motion preferences.
- Ensure interactive targets are comfortably tappable on touch devices.
- Charts need a textual summary or accessible data representation; do not make a chart the only way to access important values.

## 9. Motion

Motion should explain a state change, not decorate the page.

- Use short transitions, generally 120–200ms.
- Animate opacity, color, or small positional changes only.
- Avoid looping ambient animations.
- Do not make telemetry updates cause the whole page or map to jump.
- Respect `prefers-reduced-motion: reduce`.

## 10. CSS token starter

Use this as the shared baseline in the global stylesheet. Components should consume these variables rather than defining their own palette.

```css
:root {
  color-scheme: light;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;

  --color-canvas: #F5F5F7;
  --color-surface: #FFFFFF;
  --color-surface-secondary: #FBFBFD;
  --color-surface-hover: #F2F2F5;

  --color-text-primary: #1D1D1F;
  --color-text-secondary: #6E6E73;
  --color-text-tertiary: #86868B;

  --color-border: #D2D2D7;
  --color-border-subtle: #E8E8ED;

  --color-accent: #007AFF;
  --color-accent-hover: #0066D6;
  --color-accent-soft: #EAF3FF;

  --color-success: #248A3D;
  --color-success-soft: #EAF6EC;
  --color-warning: #B76E00;
  --color-warning-soft: #FFF4DF;
  --color-danger: #D70015;
  --color-danger-soft: #FDECEE;
  --color-info: #3B6FB6;
  --color-info-soft: #EDF4FC;
  --color-neutral: #73737A;
  --color-neutral-soft: #F0F0F2;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-pill: 999px;

  --shadow-card: 0 2px 10px rgba(0, 0, 0, 0.035);
  --shadow-popover: 0 8px 28px rgba(0, 0, 0, 0.12);

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

## 11. Non-negotiable design decisions

1. Light theme is the MVP default.
2. Use the shared semantic tokens; do not introduce feature-specific palettes.
3. The UI must be responsive from mobile to wide desktop.
4. Location simulation must be labeled clearly.
5. Sensor data gaps must be visible and must not be presented as confirmed temperature violations.
6. Insurance status must come from the Backend; a breach alone is not proof of payout.
7. VND insured amount and demo-token payout must remain distinct.
8. Blockchain state is read from the Backend only.
9. Explicit mock mode is allowed for development; silent mock fallback is not.
10. Every data-dependent screen must support loading, error, empty, and stale/disconnected states.

## 12. Source alignment

This design system is derived from the three project roadmaps:

- **Member 1 — IoT and Backend:** API is the source of shipment and operational data; Backend creates simulated location, evaluates temperature duration, and manages Blockchain integration.
- **Member 2 — Blockchain and Smart Contract:** contract uses a demo/local-chain or testnet flow; the Backend is the authorized oracle; demo tokens do not represent real money.
- **Member 3 — Frontend, Dashboard and UI QA:** React + Vite + TypeScript, Leaflet, a single API client, dashboard/list/detail/demo screens, responsive behavior, and explicit loading/error/empty states.

If this document conflicts with the final `docs/contracts/api-v1.md`, the API contract determines field names and data meaning. If a design request appears to imply behavior not supported by the API, request a contract clarification rather than inventing a frontend rule.
