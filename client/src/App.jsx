import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mapName: "",
  });

  const [requestId, setRequestId] = useState(null);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData({
      ...formData,
      [name]: value,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      const response = await fetch(`${API_URL}/api/request-map`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message);
        return;
      }

      setRequestId(data.requestId);
      setMessage("OTP sent to your email");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong");
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();

    try {
      const response = await fetch(`${API_URL}/api/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          otp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message);
        return;
      }

      setVerified(true);
      setMessage("OTP verified successfully");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong");
    }
  }

  return (
    <div style={{ padding: "40px", maxWidth: "500px" }}>
      <h1>DPS Map Download</h1>

      {!requestId && (
        <form onSubmit={handleSubmit}>
          <div>
            <label>Name</label>
            <br />
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          <br />

          <div>
            <label>Email</label>
            <br />
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
          </div>

          <br />

          <div>
            <label>Select Map</label>
            <br />
            <select
              name="mapName"
              value={formData.mapName}
              onChange={handleChange}
            >
              <option value="">Choose a map</option>
              <option value="Yangon Map">Yangon Map</option>
              <option value="Myanmar Map">Myanmar Map</option>
              <option value="Mandalay Map">Mandalay Map</option>
            </select>
          </div>

          <br />

          <button type="submit">Request Map</button>
        </form>
      )}

      {requestId && !verified && (
        <form onSubmit={handleVerifyOtp}>
          <h2>Verify OTP</h2>

          <p>Enter the OTP sent to your email.</p>

          <input
            type="text"
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
            maxLength="6"
          />

          <br />
          <br />

          <button type="submit">Verify OTP</button>
        </form>
      )}

      {verified && (
        <div>
          <h2>Verified</h2>

          <p>Your map is ready to download.</p>

          <a href={`${API_URL}/api/download/${requestId}`}>
            <button>Download Map</button>
          </a>
        </div>
      )}

      <p>{message}</p>
    </div>
  );
}
console.log("API URL:", API_URL);
export default App;
