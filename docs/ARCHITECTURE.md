# Technical Architecture

## Overview

The repository contains two browser clients and two interchangeable API implementations:

- `client`: the original single-page React 19 application bundled by Vite 8.
- `next-client`: a Next.js 16 App Router version of the same browser workflow.
- `server`: a CommonJS Express 5 API using Supabase for persistence and Nodemailer for email.
- `php-server`: a PHP 8.1+ API with the same HTTP contract, using Supabase REST and PHPMailer.

Each client keeps workflow state in one client-side component; there is no shared state layer or persistent browser session. All Node API routes and startup logic live in `server.js`. PDFs are committed under `server/maps` and streamed with `res.download`.

Only one API implementation needs to run. The client selects it through `VITE_API_URL`. The PHP implementation reuses `server/maps` by default and can use a separate directory through `MAPS_DIR`.

## Request lifecycle

```text
Browser                 Express API              Supabase             Gmail
   | POST /request-map       |                       |                   |
   |------------------------>| insert request + OTP  |                   |
   |                         |---------------------->|                   |
   |                         | send OTP email        |                   |
   |                         |------------------------------------------>|
   |<------------------------| 201 + requestId                           |
   | POST /verify-otp        |                       |                   |
   |------------------------>| select, then update   |                   |
   |                         |---------------------->|                   |
   |<------------------------| 200                                       |
   | GET /download/:id       |                       |                   |
   |------------------------>| confirm verified      |                   |
   |                         |---------------------->|                   |
   |<------------------------| selected PDF                              |
```

1. The browser submits `name`, `email`, and `mapName`.
2. The API generates a six-digit OTP with `Math.random()` and a five-minute expiry.
3. It inserts the request, including the plaintext OTP, into `map_requests`.
4. It sends the OTP through Nodemailer's Gmail transport. An email failure leaves the row stored and there is no retry endpoint.
5. The browser holds `requestId` in component memory and prompts for the OTP.
6. The API rejects missing, verified, expired, or mismatched requests, then sets `verified=true` on success.
7. The browser links to the download route. The API checks `verified`, maps `map_name` to a fixed file, and downloads it.

Refreshing the browser clears progress because client state is not persisted.

## HTTP contract

Errors use `{ "message": string }`. There is no shared async error middleware.

### `GET /`

Returns `200` with `{ "message": "DPS Map Download API is running" }`.

### `POST /api/request-map`

```json
{
  "name": "Example User",
  "email": "user@example.com",
  "mapName": "Yangon Map"
}
```

The UI exposes `Yangon Map`, `Myanmar Map`, and `Mandalay Map`. The API only checks presence here; unsupported names fail later during download.

- `201`: OTP sent; includes `message` and `requestId`.
- `400`: a field is missing/falsy.
- `500`: insert failed, or the row was stored but email failed.

### `POST /api/verify-otp`

```json
{ "requestId": 123, "otp": "123456" }
```

- `200`: verified.
- `400`: missing input, already verified, expired, or incorrect OTP.
- `404`: no request; database query errors are also presented as not found.
- `500`: update failed.

### `GET /api/download/:requestId`

- `200`: PDF attachment.
- `403`: request is not verified.
- `404`: request or map mapping is missing.

| Stored value | File |
| --- | --- |
| `Yangon Map` | `server/maps/yangon-map.pdf` |
| `Myanmar Map` | `server/maps/myanmar-map.pdf` |
| `Mandalay Map` | `server/maps/mandalay-map.pdf` |

## Data model

The schema is inferred from queries because no migration or generated types exist.

| Column | Role |
| --- | --- |
| `id` | Unique identifier returned to the browser |
| `name` | Requester name |
| `email` | OTP recipient |
| `map_name` | Value used to select a PDF |
| `otp` | Six-digit OTP stored as text |
| `otp_expires_at` | Expiry compared with server time |
| `verified` | Download authorization flag |

## Configuration

| Variable | Consumer | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | Client | API base URL embedded at build time |
| `NEXT_PUBLIC_API_URL` | Next.js client | API base URL exposed to browser code at build time |
| `SUPABASE_URL` | Server | Supabase endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Privileged database access |
| `EMAIL_USER` | Server | Gmail account/sender |
| `EMAIL_PASS` | Server | Gmail credential/app password |

The packages have separate lockfiles and installs. CORS currently accepts all origins. JSON parsing uses Express defaults.

## Deployment status

The client can be deployed as a static Vite build after setting `VITE_API_URL`.

The server currently calls `app.listen(5000)` and does not export the app. `server/vercel.json` rewrites `/api/:path*` to `/api`, but there is no `server/api` function entry point. Consequently, the current tree is not a complete working Vercel serverless deployment. Run it on a Node.js host with `npm start`, or refactor/export the app and add the matching serverless entry point.

The `server/maps` directory must be shipped beside `server.js`.

For PHP deployment and local startup, see [`php-server/README.md`](../php-server/README.md). Its Apache rewrite and PHP development-server router both direct the same route paths to `index.php`.

## Current limitations

- OTPs use `Math.random()` and are stored in plaintext.
- There is no rate limit, resend throttle, attempt limit, CAPTCHA, or abuse protection.
- A verified `requestId` is a reusable bearer credential without download expiry.
- IDs may be enumerable depending on the database type.
- Email and map values receive only presence validation; there is no request schema validation.
- CORS is unrestricted.
- Failed email delivery leaves an unusable database row.
- Route database operations lack a general exception boundary.
- Download callback errors are logged but have no defined client response.
- There are no tests, cleanup job, observability integration, or retention policy.

Before production use, prioritize cryptographic OTP handling, rate/attempt limits, opaque expiring download tokens, strict validation, restricted CORS, and database migrations.
