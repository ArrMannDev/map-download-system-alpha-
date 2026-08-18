# DPS Map Download client

This directory contains the React/Vite frontend. It collects a name, email address, and map choice; prompts for the emailed OTP; and exposes the protected API download link after verification.

For setup, API contracts, architecture, and deployment constraints, see the [project README](../README.md) and [technical architecture](../docs/ARCHITECTURE.md).

## Commands

```powershell
npm install
npm run dev
npm run lint
npm run build
```

Set `VITE_API_URL` in `.env` to the API origin without a trailing slash (for example, `http://localhost:5000`). Vite embeds this value at build time.
