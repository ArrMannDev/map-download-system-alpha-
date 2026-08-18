require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const supabase = require("./supabase");
const sendOtpEmail = require("./mailer");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;

// TEST ROUTE
app.get("/", (req, res) => {
  res.json({
    message: "DPS Map Download API is running",
  });
});

// REQUEST MAP + SEND OTP
app.post("/api/request-map", async (req, res) => {
  const { name, email, mapName } = req.body;

  if (!name || !email || !mapName) {
    return res.status(400).json({
      message: "All fields are required",
    });
  }

  // Generate 6 digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // OTP expires after 5 minutes
  const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Save request to Supabase
  const { data, error } = await supabase
    .from("map_requests")
    .insert([
      {
        name,
        email,
        map_name: mapName,
        otp,
        otp_expires_at: otpExpiresAt,
        verified: false,
      },
    ])
    .select();

  if (error) {
  console.error("SUPABASE ERROR:", error);

  return res.status(500).json({
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  });
}

  // Send OTP email
  try {
    await sendOtpEmail(email, otp);
  } catch (error) {
    console.error("Email error:", error);

    return res.status(500).json({
      message: "Request saved, but OTP email failed",
    });
  }

  return res.status(201).json({
    message: "OTP sent to your email",
    requestId: data[0].id,
  });
});

// VERIFY OTP
app.post("/api/verify-otp", async (req, res) => {
  const { requestId, otp } = req.body;

  if (!requestId || !otp) {
    return res.status(400).json({
      message: "Request ID and OTP are required",
    });
  }

  // Find request
  const { data, error } = await supabase
    .from("map_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (error || !data) {
    return res.status(404).json({
      message: "Request not found",
    });
  }

  // Already verified
  if (data.verified) {
    return res.status(400).json({
      message: "This request is already verified",
    });
  }

  // Check expiry
  const currentTime = new Date();
  const expiryTime = new Date(data.otp_expires_at);

  if (currentTime > expiryTime) {
    return res.status(400).json({
      message: "OTP has expired",
    });
  }

  // Check OTP
  if (data.otp !== otp.toString()) {
    return res.status(400).json({
      message: "Invalid OTP",
    });
  }

  // Update verified status
  const { error: updateError } = await supabase
    .from("map_requests")
    .update({
      verified: true,
    })
    .eq("id", requestId);

  if (updateError) {
    console.error("Update error:", updateError);

    return res.status(500).json({
      message: "Failed to verify request",
    });
  }

  return res.json({
    message: "OTP verified successfully",
  });
});

// PROTECTED MAP DOWNLOAD
app.get("/api/download/:requestId", async (req, res) => {
  const { requestId } = req.params;

  // Find request
  const { data, error } = await supabase
    .from("map_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (error || !data) {
    return res.status(404).json({
      message: "Request not found",
    });
  }

  // Must verify OTP first
  if (!data.verified) {
    return res.status(403).json({
      message: "OTP verification required",
    });
  }

  let fileName;

  if (data.map_name === "Yangon Map") {
    fileName = "yangon-map.pdf";
  } else if (data.map_name === "Myanmar Map") {
    fileName = "myanmar-map.pdf";
  } else if (data.map_name === "Mandalay Map") {
    fileName = "mandalay-map.pdf";
  } else {
    return res.status(404).json({
      message: "Map file not found",
    });
  }

  const filePath = path.join(__dirname, "maps", fileName);

  res.download(filePath, fileName, (error) => {
    if (error) {
      console.error("Download error:", error);
    }
  });
});

// START SERVER
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
