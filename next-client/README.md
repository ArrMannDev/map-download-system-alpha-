# DPS Map Download Next.js client

This is the Next.js App Router version of the DPS Map Download frontend. It preserves the existing API flow: request a map, verify the emailed six-digit OTP, then download the authorized PDF.

## Local setup

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Start either the Node or PHP API on `http://localhost:5000`, then open the Next.js URL (normally `http://localhost:3000`).

`NEXT_PUBLIC_API_URL` is exposed to browser code and must contain only the API origin. Never put Supabase or email credentials in a `NEXT_PUBLIC_*` variable.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |
| `npm run lint` | Run ESLint |

The backend HTTP contract remains unchanged; see [`../docs/SYSTEM_FLOW.md`](../docs/SYSTEM_FLOW.md).
