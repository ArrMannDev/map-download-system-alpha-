# DPS Map Download: System Flow

## 1. Purpose and scope

DPS Map Download lets a visitor request one of three PDF maps and download it only after proving access to the supplied email address with a six-digit one-time password (OTP).

The repository contains two browser-client implementations and two interchangeable API implementations. `client` is the original Vite client; `next-client` reproduces the flow with the Next.js App Router. Either client talks directly to one selected API:

```text
Vite or Next.js client
       |
       | VITE_API_URL
       v
+-------------------+        +-------------------+
| Node/Express API  |   OR   | PHP API           |
+-------------------+        +-------------------+
       |                              |
       +------------+-----------------+
                    |
             +------+------+
             |             |
             v             v
        Supabase       Gmail SMTP
        request data   OTP delivery
             |
             v
       Local PDF files
```

Only one API should serve the client at a time. The Node API reads PDFs from `server/maps`. The PHP API reads the same directory by default, or another directory configured with `MAPS_DIR`.

## 2. Components and responsibilities

| Component | Main files | Responsibility |
| --- | --- | --- |
| Browser UI | `client/src/App.jsx` | Collect request details, call the API, hold the current request ID, collect the OTP, and expose the download link after verification |
| Client bootstrap | `client/src/main.jsx` | Mount the React application in `StrictMode` |
| Client configuration | `client/.env` | Set the API base URL through `VITE_API_URL`; Vite embeds it at build time |
| Node API | `server/server.js` | Validate basic input, create request records, verify OTPs, authorize downloads, and start port `5000` |
| Supabase adapter | `server/supabase.js` | Create the privileged Supabase client |
| Node email adapter | `server/mailer.js` | Send OTP messages through Gmail with Nodemailer |
| PHP API | `php-server/index.php` | Provide the same public HTTP flow through Supabase REST and PHPMailer |
| PHP development router | `php-server/router.php` | Forward non-file paths to `index.php` when using PHP's built-in server |
| Persistence | Supabase `map_requests` | Store requester data, OTP, expiry, and verification state |
| Protected assets | `server/maps/*.pdf` | Store the three downloadable map files |

## 3. End-to-end happy path

```text
Visitor       React client        Selected API         Supabase          Gmail
  |                |                   |                   |                |
  | fill form      |                   |                   |                |
  |--------------->|                   |                   |                |
  |                | POST request-map  |                   |                |
  |                |------------------>| insert pending    |                |
  |                |                   |------------------>|                |
  |                |                   | send 6-digit OTP  |                |
  |                |                   |----------------------------------->|
  |                | 201 + requestId   |                   |                |
  |                |<------------------|                   |                |
  | enter OTP      |                   |                   |                |
  |--------------->| POST verify-otp   |                   |                |
  |                |------------------>| read request      |                |
  |                |                   |------------------>|                |
  |                |                   | set verified=true |                |
  |                |                   |------------------>|                |
  |                | 200 verified      |                   |                |
  |                |<------------------|                   |                |
  | click download |                   |                   |                |
  |--------------->| GET download/:id  |                   |                |
  |                |------------------>| confirm verified  |                |
  |                |                   |------------------>|                |
  |<--------------- PDF attachment ----|                   |                |
```

### Stage A: request a map

1. `App.jsx` initially renders a form for `name`, `email`, and `mapName`.
2. The map selector produces one of these exact stored values:
   - `Yangon Map`
   - `Myanmar Map`
   - `Mandalay Map`
3. On submit, the client sends `POST {VITE_API_URL}/api/request-map` with JSON.
4. The API rejects falsy/missing fields with HTTP `400`.
5. The API generates a six-digit OTP and an expiry five minutes in the future.
   - Node uses `Math.random()`.
   - PHP uses the cryptographically stronger `random_int()`.
6. A new unverified row is inserted into Supabase.
7. The API sends the plaintext OTP to the submitted address through Gmail.
8. After successful storage and email delivery, the API returns HTTP `201` with the new `requestId`.
9. React stores `requestId` in component memory. This hides the request form and displays the OTP form.

### Stage B: verify the OTP

1. The visitor enters up to six characters in the OTP field.
2. The client sends `POST /api/verify-otp` with `requestId` and `otp`.
3. The API retrieves the matching Supabase row.
4. Verification succeeds only when all conditions are true:
   - the request exists;
   - it is not already verified;
   - the stored expiry has not passed; and
   - the submitted OTP exactly matches the stored OTP after string conversion.
5. The API updates `verified` to `true` and returns HTTP `200`.
6. React sets its local `verified` state to `true`, hides the OTP form, and displays a download button.

### Stage C: download the PDF

1. The download button is a normal link to `GET /api/download/{requestId}`.
2. The API retrieves the request again; it does not trust the browser's local `verified` state.
3. If `verified` is not true, the API returns HTTP `403`.
4. The stored `map_name` is mapped through a fixed allowlist:

| `map_name` | Downloaded file |
| --- | --- |
| `Yangon Map` | `yangon-map.pdf` |
| `Myanmar Map` | `myanmar-map.pdf` |
| `Mandalay Map` | `mandalay-map.pdf` |

5. The API returns the selected file as a PDF attachment. No user-supplied filename is joined into the filesystem path.

## 4. Client state flow

All workflow state is local to the single `App` component:

```text
requestId = null
    |
    | successful map request
    v
requestId = database ID, verified = false
    |
    | successful OTP verification
    v
requestId = database ID, verified = true
```

| State | UI shown |
| --- | --- |
| No `requestId` | Map request form |
| `requestId` exists and `verified` is false | OTP form |
| `verified` is true | Download button |

`message` displays both success and error text. There is no client router, global store, cookie, or browser storage. Refreshing or reopening the page resets the UI to the first form even though the Supabase record remains.

## 5. API contract

### `GET /`

Health/information endpoint.

```json
{ "message": "DPS Map Download API is running" }
```

### `POST /api/request-map`

Request body:

```json
{
  "name": "Example User",
  "email": "user@example.com",
  "mapName": "Yangon Map"
}
```

Success (`201`):

```json
{
  "message": "OTP sent to your email",
  "requestId": 123
}
```

Failure paths:

| Status | Cause | Resulting state |
| --- | --- | --- |
| `400` | Any field is missing/falsy | No row is intentionally created |
| `500` | Supabase insert fails | Request is not available |
| `500` | Email delivery fails after insert | An unverified row remains, but the client receives no `requestId` and there is no resend flow |

The Node implementation exposes Supabase error details in its insert-failure response; the PHP implementation returns a generic save failure.

### `POST /api/verify-otp`

Request body:

```json
{
  "requestId": 123,
  "otp": "123456"
}
```

| Status | Meaning |
| --- | --- |
| `200` | OTP matched and the row was marked verified |
| `400` | Input missing, request already verified, OTP expired, or OTP incorrect |
| `404` | Request not found; some database read failures are also collapsed into this response |
| `500` | Updating `verified` failed |

### `GET /api/download/:requestId`

| Status | Meaning |
| --- | --- |
| `200` | PDF attachment returned |
| `403` | The request exists but is not verified |
| `404` | Request does not exist, map name is unsupported, or—in PHP—the file is absent |

The Node download callback only logs filesystem/send errors after `res.download()` begins; it does not define a separate JSON error response for that case.

## 6. Persistence model

No database migration is included. The code implies this Supabase table:

```sql
create table public.map_requests (
  id bigint generated by default as identity primary key,
  name text not null,
  email text not null,
  map_name text not null,
  otp text not null,
  otp_expires_at timestamptz not null,
  verified boolean not null default false
);
```

| Column | Written when | Read when | Purpose |
| --- | --- | --- | --- |
| `id` | Insert | Verification and download | Workflow identifier returned to the browser |
| `name` | Insert | Not used afterward | Requester information |
| `email` | Insert | Not used afterward | OTP destination/audit data |
| `map_name` | Insert | Download | Select a fixed PDF |
| `otp` | Insert | Verification | Plaintext OTP comparison |
| `otp_expires_at` | Insert | Verification | Five-minute verification deadline |
| `verified` | Insert/update | Verification and download | Persistent authorization flag |

Both backends use the Supabase service-role credential, so database Row Level Security is bypassed from the server. The credential must never be exposed to the client.

## 7. Configuration and runtime flow

| Variable | Used by | Timing | Purpose |
| --- | --- | --- | --- |
| `VITE_API_URL` | React client | Vite build/start | Base URL for every API call and download link |
| `SUPABASE_URL` | Both APIs | API startup/request | Supabase project endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Both APIs | API startup/request | Privileged database access |
| `EMAIL_USER` | Both APIs | Email send | Gmail username and From address |
| `EMAIL_PASS` | Both APIs | Email send | Gmail app password/credential |
| `MAPS_DIR` | PHP only | Download | Optional PDF directory override |

Local Node flow:

```text
client: npm run dev  -> Vite, normally http://localhost:5173
server: npm run dev  -> Express, fixed http://localhost:5000
client VITE_API_URL  -> http://localhost:5000
```

Local PHP alternative:

```text
php -S localhost:5000 router.php
client VITE_API_URL -> http://localhost:5000
```

Both APIs allow cross-origin requests from any origin. The Node API parses JSON with Express defaults; the PHP API handles preflight `OPTIONS` requests and parses JSON in `index.php`.

## 8. Failure and recovery behavior

| Event | User-visible behavior | Recovery currently available |
| --- | --- | --- |
| API unreachable or invalid/non-JSON response | Client displays `Something went wrong` | Submit again |
| Validation failure | API message appears below the active form | Correct input and submit again |
| Email send failure | API reports that the request was saved but email failed | No resend/recovery endpoint; submit a new request |
| Wrong OTP | `Invalid OTP` | Retry without a configured attempt limit |
| Expired OTP | `OTP has expired` | Refresh and create a new request |
| Already verified request submitted again | API rejects it | Use the download URL if the request ID is still known |
| Page refresh during workflow | Client forgets `requestId` and returns to the request form | Create a new request; there is no resume UI |
| Direct download before verification | API returns `403` JSON | Verify first |

## 9. Trust boundaries and current risks

- The browser is untrusted. Download authorization is correctly rechecked against Supabase by the API.
- A verified request ID acts as a permanent, reusable bearer credential; there is no download expiry or single-use transition.
- Node OTP generation uses `Math.random()`, and both implementations store OTPs in plaintext.
- There is no rate limiting, resend throttle, OTP attempt limit, CAPTCHA, or abuse protection.
- Request IDs may be enumerable, depending on the database identity strategy.
- Input validation checks presence only. Email shape, lengths, types, and allowed map values are not validated when the request is created.
- CORS permits all origins.
- Old, expired, failed, and verified rows have no cleanup or retention policy.
- There is no automated test suite, structured observability, or general Node async error boundary.
- The checked-in Node Vercel rewrite points API paths to `/api`, but the repository has no matching serverless function and `server.js` always calls `app.listen(5000)`. The current Node tree should be treated as a traditional long-running service until refactored for serverless deployment.

## 10. Recommended production evolution

1. Add a versioned Supabase migration with constraints and indexes.
2. Validate and normalize request bodies with a strict schema; reject unsupported maps during request creation.
3. Generate OTPs cryptographically, store only an OTP hash, and enforce attempt and resend limits.
4. Add per-IP and per-email rate limiting plus abuse monitoring.
5. Replace reusable numeric download authorization with an opaque, short-lived, optionally single-use token.
6. Restrict CORS to the deployed client origin and stop returning raw database details.
7. Make request creation/email delivery recoverable with resend logic or transactional/outbox-style processing.
8. Add cleanup/retention jobs, tests for every route branch, and production logging/metrics.
9. Choose one production backend and document its deployment topology; refactor the Node entry point if Vercel serverless hosting is required.

## 11. Source-of-truth index

- UI and client transitions: `client/src/App.jsx`
- Node routes and authorization: `server/server.js`
- Node email behavior: `server/mailer.js`
- Node database client: `server/supabase.js`
- PHP route-equivalent implementation: `php-server/index.php`
- PDF assets: `server/maps/`
- Setup overview: `README.md`
- Architecture and limitations: `docs/ARCHITECTURE.md`
