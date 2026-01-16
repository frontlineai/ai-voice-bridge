import express from "express";

const app = express();

// Twilio sends form-encoded POST data by default
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("ai-voice-bridge is running ✅");
});

// Twilio will POST here when someone calls your number
app.post("/voice", (req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi! Thanks for calling. Please hold while I connect you.</Say>
</Response>`;

  res.type("text/xml");
  res.send(twiml);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
