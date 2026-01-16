import express from "express";

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio sends form-encoded
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("ai-voice-bridge is running");
});

// Twilio hits this when a call comes in
app.post("/voice", (req, res) => {
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi! Thanks for calling. What can I help you with today?</Say>
  <Gather input="speech" action="/gather" method="POST" speechTimeout="auto" timeout="6"/>
  <Say voice="alice">Sorry, I didn’t catch that. Please call again.</Say>
  <Hangup/>
</Response>`);
});

// Twilio posts the caller's speech result here
app.post("/gather", (req, res) => {
  const said = (req.body.SpeechResult || "").trim();

  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Got it. You said: ${escapeXml(said || "nothing")}.</Say>
  <Say voice="alice">Thanks! Someone will follow up shortly. Goodbye.</Say>
  <Hangup/>
</Response>`);
});

function escapeXml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
