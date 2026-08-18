"use client";

import { useState } from "react";

const maps = ["Yangon Map", "Myanmar Map", "Mandalay Map"];
const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function readResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return { message: response.ok ? "Request completed" : "The server returned an unexpected response" };
  }

  return response.json();
}

export default function Home() {
  const [formData, setFormData] = useState({ name: "", email: "", mapName: "" });
  const [requestId, setRequestId] = useState(null);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const stage = verified ? 3 : requestId ? 2 : 1;

  function updateField(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function showMessage(text, type) {
    setMessage(text);
    setMessageType(type);
  }

  async function requestMap(event) {
    event.preventDefault();

    if (!apiUrl) {
      showMessage("NEXT_PUBLIC_API_URL is not configured.", "error");
      return;
    }

    setSubmitting(true);
    showMessage("", "");

    try {
      const response = await fetch(`${apiUrl}/api/request-map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await readResponse(response);

      if (!response.ok) {
        showMessage(data.message ?? "Unable to request the map.", "error");
        return;
      }

      setRequestId(data.requestId);
      showMessage(data.message ?? "OTP sent to your email.", "success");
    } catch (error) {
      console.error(error);
      showMessage("Unable to reach the map service. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setSubmitting(true);
    showMessage("", "");

    try {
      const response = await fetch(`${apiUrl}/api/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, otp }),
      });
      const data = await readResponse(response);

      if (!response.ok) {
        showMessage(data.message ?? "Unable to verify the OTP.", "error");
        return;
      }

      setVerified(true);
      showMessage(data.message ?? "OTP verified successfully.", "success");
    } catch (error) {
      console.error(error);
      showMessage("Unable to reach the map service. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setFormData({ name: "", email: "", mapName: "" });
    setRequestId(null);
    setOtp("");
    setVerified(false);
    showMessage("", "");
  }

  return (
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <span className="eyebrow">DPS resources</span>
        <h1 id="page-title">Download the map you need.</h1>
        <p>
          Choose a map, confirm your email with a six-digit code, and your PDF will be ready.
        </p>

        <ol className="progress" aria-label={`Step ${stage} of 3`}>
          {["Request", "Verify", "Download"].map((label, index) => {
            const number = index + 1;
            const state = number < stage ? "complete" : number === stage ? "active" : "";
            return (
              <li className={state} key={label}>
                <span>{number < stage ? "✓" : number}</span>
                {label}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card" aria-live="polite">
        {stage === 1 && (
          <form onSubmit={requestMap}>
            <div className="heading">
              <span>Step 1</span>
              <h2>Request a map</h2>
              <p>We will send the verification code to this email address.</p>
            </div>

            <label htmlFor="name">Full name</label>
            <input id="name" name="name" value={formData.name} onChange={updateField} autoComplete="name" required />

            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" value={formData.email} onChange={updateField} autoComplete="email" required />

            <label htmlFor="mapName">Map</label>
            <select id="mapName" name="mapName" value={formData.mapName} onChange={updateField} required>
              <option value="">Choose a map</option>
              {maps.map((map) => <option value={map} key={map}>{map}</option>)}
            </select>

            <button className="primary" type="submit" disabled={submitting}>
              {submitting ? "Sending code…" : "Request map"}
            </button>
          </form>
        )}

        {stage === 2 && (
          <form onSubmit={verifyOtp}>
            <div className="heading">
              <span>Step 2</span>
              <h2>Check your inbox</h2>
              <p>Enter the six-digit code sent to {formData.email}. It expires in five minutes.</p>
            </div>

            <label htmlFor="otp">Verification code</label>
            <input
              className="otp"
              id="otp"
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              autoFocus
            />

            <button className="primary" type="submit" disabled={submitting || otp.length !== 6}>
              {submitting ? "Verifying…" : "Verify code"}
            </button>
            <button className="text-button" type="button" onClick={startOver}>Use another email</button>
          </form>
        )}

        {stage === 3 && (
          <div className="success-panel">
            <div className="check" aria-hidden="true">✓</div>
            <div className="heading">
              <span>Step 3</span>
              <h2>Your map is ready</h2>
              <p>{formData.mapName} has been unlocked and is ready to download as a PDF.</p>
            </div>
            <a className="primary button-link" href={`${apiUrl}/api/download/${requestId}`}>Download PDF</a>
            <button className="text-button" type="button" onClick={startOver}>Request another map</button>
          </div>
        )}

        {message && <p className={`notice ${messageType}`} role={messageType === "error" ? "alert" : "status"}>{message}</p>}
      </section>
    </main>
  );
}
