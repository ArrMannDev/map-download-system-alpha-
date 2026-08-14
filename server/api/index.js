require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const supabase = require("../supabase");
const sendOtpEmail = require("../mailer");

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://map-download-system-alpha.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

app.get("/api", (req, res) => {
  res.json({
    message: "DPS Map Download API is running",
  });
});

app.post("/api/request-map", async (req, res) => {
  const { name, email, mapName } = req.body;

  if (!name || !email || !mapName) {
    return res.status(400).json({
      message: "All fields are required",
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

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
    console.error("Supabase insert error:", error);

    return res.status(500).json({
      message: "Failed to save map request",
    });
  }

  try {
    await sendOtpEmail(email, otp);
  } catch (emailError) {
    console.error("Email error:", emailError);

    return res.status(500).json({
      message: "Request saved, but OTP email failed",
    });
  }

  return res.status(201).json({
    message: "OTP sent to your email",
    requestId: data[0].id,
  });
});

app.post("/api/verify-otp", async (req, res) => {
  const { requestId, otp } = req.body;

  if (!requestId || !otp) {
    return res.status(400).json({
      message: "Request ID and OTP are required",
    });
  }

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

  if (data.verified) {
    return res.status(400).json({
      message: "This request is already verified",
    });
  }

  const currentTime = new Date();
  const expiryTime = new Date(data.otp_expires_at);

  if (currentTime > expiryTime) {
    return res.status(400).json({
      message: "OTP has expired",
    });
  }

  if (data.otp !== otp.toString()) {
    return res.status(400).json({
      message: "Invalid OTP",
    });
  }

  const { error: updateError } = await supabase
    .from("map_requests")
    .update({
      verified: true,
    })
    .eq("id", requestId);

  if (updateError) {
    console.error("Verification update error:", updateError);

    return res.status(500).json({
      message: "Failed to verify request",
    });
  }

  return res.json({
    message: "OTP verified successfully",
  });
});

app.get("/api/download/:requestId", async (req, res) => {
  const { requestId } = req.params;

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

  const filePath = path.join(process.cwd(), "maps", fileName);

  return res.download(filePath, fileName, (downloadError) => {
    if (downloadError) {
      console.error("Download error:", downloadError);

      if (!res.headersSent) {
        res.status(500).json({
          message: "Failed to download map",
        });
      }
    }
  });
});

module.exports = app;
