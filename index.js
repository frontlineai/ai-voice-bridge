import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PORT = process.env.PORT || 3000;

// In-memory call storage (fine for testing). Later we’ll use a DB.
const calls = new Map(); // key: CallSid, value: { to, from, messages: [], transcript: [] }

app.get("/", (req, res) => {
  res.send("ai-voice-bridge is running ✅");
});

function twimlResponse(xml) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

function escapeXml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// 1) Entry point for calls
app.post("/voice", (req, res) => {
  const callSid = req.body.CallSid;
  const to = req.body.To;
  const from = req.body.From;

  calls.set(callSid, {
    to,
    from,
    messages: [
      {
        role: "system",
        content:
          "You are a friendly, professional business receptionist. Your job is to help callers, ask short clarifying questions, and collect: name, reason for calling, best callback number, and any key details. Keep answers concise and natural. If the caller is satisfied or says goodbye, end the call. When you are ready to end the call, include the exact token [END_CALL] at the end of your message."
      }
    ],
    transcript: []
  });

  const xml = twimlResponse(`
<Response>
  <Say voice="alice">Hi! Thanks for calling. How can I help you today?</Say>
  <Gather input="speech" action="/respond" method="POST" speechTimeout="auto" timeout="6">
    <Say voice="alice">Go ahead.</Say>
  </Gather>
  <Say voice="alice">Sorry, I didn’t catch that. Please call again.</Say>
</Response>`);

  res.type("text/xml").send(xml);
});

// 2) Conversation loop handler
app.post("/respond", async (req, res) => {
  const callSid = req.body.CallSid;
  const speech = (req.body.SpeechResult || "").trim();
  const from = req.body.From;
  const state = calls.get(callSid);

  // If we somehow lost state, restart gracefully
  if (!state) {
    const xml = twimlResponse(`
<Response>
  <Say voice="alice">Sorry about that—can you tell me what you need help with?</Say>
  <Gather input="speech" action="/respond" method="POST" speechTimeout="auto" timeout="6" />
</Response>`);
    return res.type("text/xml").send(xml);
  }

  if (speech) {
    state.transcript.push({ who: "caller", text: speech });
    state.messages.push({ role: "user", content: speech });
  }

  // Simple caller-driven end
  const lower = speech.toLowerCase();
  const callerWantsToEnd =
    lower.includes("that's all") ||
    lower.includes("that is all") ||
    lower.includes("no thanks") ||
    lower.includes("goodbye") ||
    lower === "bye" ||
    lower.includes("thank you bye");

  if (callerWantsToEnd) {
    const xml = twimlResponse(`
<Response>
  <Say voice="alice">Perfect. Thanks—someone will follow up with you shortly. Have a great day!</Say>
  <Hangup/>
</Response>`);
    return res.type("text/xml").send(xml);
  }

  // Ask OpenAI what to say next (dynamic, not scripted)
  let assistantText = "Got it. Can I get your name and the best number to call you back?";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: state.messages
    });

    assistantText = completion.choices?.[0]?.message?.content?.trim() || assistantText;
  } catch (e) {
    // If OpenAI hiccups, keep the call smooth
    assistantText = "Got it. Can I get your name and the best number to call you back?";
  }

  const shouldEnd = assistantText.includes("[END_CALL]");
  assistantText = assistantText.replace("[END_CALL]", "").trim();

  state.transcript.push({ who: "assistant", text: assistantText });
  state.messages.push({ role: "assistant", content: assistantText });

  if (shouldEnd) {
    const xml = twimlResponse(`
<Response>
  <Say voice="alice">${escapeXml(assistantText)}</Say>
  <Say voice="alice">Thanks! Someone will follow up with you shortly. Bye!</Say>
  <Hangup/>
</Response>`);
    return res.type("text/xml").send(xml);
  }

  const xml = twimlResponse(`
<Response>
  <Say voice="alice">${escapeXml(assistantText)}</Say>
  <Gather input="speech" action="/respond" method="POST" speechTimeout="auto" timeout="6">
    <Say voice="alice">Anything else?</Say>
  </Gather>
  <Say voice="alice">No worries. Someone will follow up with you shortly. Bye!</Say>
  <Hangup/>
</Response>`);

  res.type("text/xml").send(xml);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
