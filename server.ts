import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "app_db.json");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Default DB schema structure
interface AllowedUser {
  phone: string;
  name: string;
  addedAt: string;
}

interface ChatMessage {
  role: "user" | "model";
  text: string;
  timestamp: string;
}

interface AppDatabase {
  allowed_users: AllowedUser[];
  processed_messages: { messageId: string; processedAt: string }[];
  chats: { [phone: string]: ChatMessage[] };
}

// Initialize and read the database file
function readDatabase(): AppDatabase {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("Error reading database:", error);
  }

  // Seed default dataset if missing
  const defaultDb: AppDatabase = {
    allowed_users: [
      { phone: "whatsapp:+628123456789", name: "Alice Lim (Manager)", addedAt: new Date().toISOString() },
      { phone: "whatsapp:+14155552671", name: "Bob Sandbox (Twilio Test)", addedAt: new Date().toISOString() },
    ],
    processed_messages: [
      { messageId: "SMd8e3b3a2a6b2450587d559a4bb300e8c", processedAt: new Date().toISOString() }
    ],
    chats: {
      "whatsapp:+628123456789": [
        { role: "user", text: "Hello! What is this system?", timestamp: new Date(Date.now() - 3600000).toISOString() },
        { role: "model", text: "Hello Alice! 👋 This is your brand-new WhatsApp Business digital assistant powered by the Gemini 3.5 API. I am configured to help you monitor sales, summarize product logs, and handle routine client FAQ. Let me know what we build today! 🚀", timestamp: new Date(Date.now() - 3590000).toISOString() }
      ]
    }
  };

  saveDatabase(defaultDb);
  return defaultDb;
}

function saveDatabase(db: AppDatabase) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving database:", error);
  }
}

// API Routes
// 1. Get database configuration
app.get("/api/db", (req, res) => {
  const db = readDatabase();
  res.json(db);
});

// 2. Add number to allowed list
app.post("/api/allowed-users", (req, res) => {
  const { phone, name } = req.body;
  if (!phone) {
    return res.status(400).json({ error: "Missing phone number" });
  }

  const db = readDatabase();
  // Standardize format (ensure whatsapp: prefix)
  let formattedPhone = phone.trim();
  if (!formattedPhone.startsWith("whatsapp:")) {
    formattedPhone = `whatsapp:${formattedPhone}`;
  }

  // Prevent duplicates
  const exists = db.allowed_users.some(u => u.phone === formattedPhone);
  if (exists) {
    return res.status(400).json({ error: `${formattedPhone} is already in the allowed list` });
  }

  const newUser: AllowedUser = {
    phone: formattedPhone,
    name: name?.trim() || "Manual Contact",
    addedAt: new Date().toISOString()
  };

  db.allowed_users.push(newUser);
  saveDatabase(db);
  res.status(201).json(newUser);
});

// 3. Delete number from allowed list
app.delete("/api/allowed-users", (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: "Missing phone number to delete" });
  }

  const db = readDatabase();
  db.allowed_users = db.allowed_users.filter(u => u.phone !== phone);
  saveDatabase(db);
  res.json({ success: true, remaining: db.allowed_users });
});

// 4. Delete specific conversation history
app.delete("/api/chats/:phone", (req, res) => {
  const { phone } = req.params;
  const db = readDatabase();
  if (db.chats[phone]) {
    delete db.chats[phone];
    saveDatabase(db);
  }
  res.json({ success: true });
});

// 5. Clear all message deduplication logs
app.post("/api/clear-deduplication", (req, res) => {
  const db = readDatabase();
  db.processed_messages = [];
  saveDatabase(db);
  res.json({ success: true });
});

// 6. Simulate Twilio Webhook Receiver & Responder
app.post("/api/simulate", async (req, res) => {
  const { From, Body, MessageSid } = req.body;

  if (!From || !Body) {
    return res.status(400).json({ error: "From and Body fields are required." });
  }

  const db = readDatabase();
  const timestampStr = new Date().toISOString();

  // 1. DEDUPLICATION
  if (MessageSid) {
    const isProcessed = db.processed_messages.some(m => m.messageId === MessageSid);
    if (isProcessed) {
      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- Deduplicated Message ID: ${MessageSid} -->\n<Response></Response>`);
    }

    db.processed_messages.push({
      messageId: MessageSid,
      processedAt: timestampStr
    });
  }

  // 2. AUTHENTICATION (ALLOWED USERS CHECK)
  const isAllowed = db.allowed_users.some(u => u.phone === From);
  if (!isAllowed) {
    const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, you are not authorized to access this system.</Message>
</Response>`;
    
    // Save state so user can see blocked attempts in simulator logs
    if (!db.chats[From]) {
      db.chats[From] = [];
    }
    db.chats[From].push({ role: "user", text: Body, timestamp: timestampStr });
    // Record automatic rejection system answer
    db.chats[From].push({ role: "model", text: "[BLOCKED] Hello! You are not authorized to use this automated assistant. Please contact the administrator.", timestamp: new Date().toISOString() });
    saveDatabase(db);

    return res.status(200).set("Content-Type", "text/xml").send(errorXml);
  }

  // 3. FETCH CHAT MEMORY (Last 10 messages)
  if (!db.chats[From]) {
    db.chats[From] = [];
  }
  const userHistory = db.chats[From].slice(-10);
  const geminiHistory = userHistory.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  // 4. CALL DYNAMIC GEMINI API INTUITIVELY
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    // Missing API Key fallback reply
    const missingKeyXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>⚠️ Simulated Assistant: The GEMINI_API_KEY environment variable is not configured. Please add it to Settings > Secrets inside Google AI Studio to initiate active testing.</Message>
</Response>`;
    
    db.chats[From].push({ role: "user", text: Body, timestamp: timestampStr });
    db.chats[From].push({ role: "model", text: "⚠️ System warning: GEMINI_API_KEY missing. Please add your real key in Google AI Studio secrets panel.", timestamp: new Date().toISOString() });
    saveDatabase(db);
    return res.status(200).set("Content-Type", "text/xml").send(missingKeyXml);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });

    const chatInstance = ai.chats.create({
      model: "gemini-3.5-flash",
      config: {
        systemInstruction: "You are a professional, helpful, and polite WhatsApp assistant. " +
                           "Keep answers brief, highly structured, clear, and make tasteful use of emojis. " +
                           "Be concise, and format perfectly for mobile displays. Protect boundaries.",
      },
      history: geminiHistory
    });

    // Send original input message
    const result = await chatInstance.sendMessage({ message: Body });
    const replyText = result.text || "No reply was generated by the model. Try again.";

    // 5. COMMONLY PERSIST STATE TO LOCAL FILE
    db.chats[From].push({ role: "user", text: Body, timestamp: timestampStr });
    db.chats[From].push({ role: "model", text: replyText, timestamp: new Date().toISOString() });
    saveDatabase(db);

    // 6. RESPOND WITH TWIML
    const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${replyText}</Message>
</Response>`;

    res.status(200).set("Content-Type", "text/xml").send(responseXml);

  } catch (error: any) {
    console.error("Gemini invocation failed inside simulation:", error);
    
    const errorText = `Failed to process message with Gemini: ${error?.message || "Unknown API Error"}`;
    db.chats[From].push({ role: "user", text: Body, timestamp: timestampStr });
    db.chats[From].push({ role: "model", text: `🚨 Error: ${errorText}`, timestamp: new Date().toISOString() });
    saveDatabase(db);

    const fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>🚨 [Simulated Error] ${errorText}</Message>
</Response>`;
    res.status(200).set("Content-Type", "text/xml").send(fallbackXml);
  }
});

// 7. Real Live Twilio Webhook Receiver (Integrates with actual WhatsApp mobile devices)
app.post("/api/webhook", async (req, res) => {
  const { From, Body, MessageSid } = req.body;
  const twilioSignature = req.headers["x-twilio-signature"] as string;

  if (!From || !Body) {
    return res.status(400).send("Bad Request: Missing From or Body parameter");
  }

  // Cryptographic Twilio Signature check if key is set
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken && authToken !== "MY_TWILIO_AUTH_TOKEN" && authToken.trim() !== "") {
    // Determine target webhook URL dynamically
    const appUrl = process.env.APP_URL || `https://${req.get("host")}${req.originalUrl}`;
    const isAuthentic = twilio.validateRequest(authToken, twilioSignature || "", appUrl, req.body);
    
    if (!isAuthentic) {
      console.error(`Twilio Signature Verification failed! Target URL: ${appUrl}`);
      return res.status(403).send("Forbidden: Invalid Twilio Webhook Signature.");
    }
  } else {
    console.log("ℹ️ Webhook signature check is unconfigured/bypassed. Configure TWILIO_AUTH_TOKEN to secure.");
  }

  const db = readDatabase();
  const timestampStr = new Date().toISOString();

  // Deduplication layer
  if (MessageSid) {
    const isProcessed = db.processed_messages.some(m => m.messageId === MessageSid);
    if (isProcessed) {
      console.log(`Live Deduplicated duplicate MessageSid: ${MessageSid}`);
      return res.status(200).set("Content-Type", "text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>`);
    }

    db.processed_messages.push({
      messageId: MessageSid,
      processedAt: timestampStr
    });
  }

  // Access check
  const isAllowed = db.allowed_users.some(u => u.phone === From);
  if (!isAllowed) {
    console.warn(`Denied unauthorized incoming number: ${From}`);
    
    if (!db.chats[From]) {
      db.chats[From] = [];
    }
    db.chats[From].push({ role: "user", text: Body, timestamp: timestampStr });
    db.chats[From].push({ role: "model", text: "[BLOCKED] Access Denied. Contact administrator.", timestamp: new Date().toISOString() });
    saveDatabase(db);

    res.set("Content-Type", "text/xml");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Hello! You are not authorized to use this automated assistant. Please ask the administrator to approve your registration in the WhatsApp Directory.</Message>
</Response>`);
  }

  // Memory log snapshot
  if (!db.chats[From]) {
    db.chats[From] = [];
  }
  const userHistory = db.chats[From].slice(-10);
  const geminiHistory = userHistory.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  // Call official Google Gemini API using GoogleGenAI SDK
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    res.set("Content-Type", "text/xml");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>⚠️ Webhook received but Gemini API key is not configured yet. Set the GEMINI_API_KEY secret in Google AI Studio to reply.</Message>
</Response>`);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });

    const chatInstance = ai.chats.create({
      model: "gemini-3.5-flash",
      config: {
        systemInstruction: "You are a professional, helpful, and polite WhatsApp assistant. Keep answers brief, use emojis, and be very concise for mobile screens.",
      },
      history: geminiHistory
    });

    const result = await chatInstance.sendMessage({ message: Body });
    const replyText = result.text || "No reply was generated. Please try again later.";

    // Save history
    db.chats[From].push({ role: "user", text: Body, timestamp: timestampStr });
    db.chats[From].push({ role: "model", text: replyText, timestamp: new Date().toISOString() });
    saveDatabase(db);

    res.status(200).set("Content-Type", "text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${replyText}</Message>
</Response>`);

  } catch (error: any) {
    console.error("Gemini invocation failed inside live webhook handler:", error);
    res.status(200).set("Content-Type", "text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, an unexpected error occurred while processing your message. Please try again shortly.</Message>
</Response>`);
  }
});

// Vite Middleware integrated after API endpoints
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`WhatsApp Chatbot Manager running server on http://localhost:${PORT}`);
  });
}

startServer();
