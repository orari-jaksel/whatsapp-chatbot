import React, { useState, useEffect } from "react";
import { 
  Phone, 
  Send, 
  UserCheck, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Terminal, 
  Database,
  ShieldAlert, 
  Cpu, 
  BookOpen, 
  Play, 
  Settings, 
  AlertCircle,
  HelpCircle,
  RefreshCw,
  LogOut,
  Sparkles,
  Smartphone
} from "lucide-react";

import { AppDatabase, AllowedUser, ChatMessage, SimulationPayload, WebhookLog } from "./types";

export default function App() {
  // State
  const [dbState, setDbState] = useState<AppDatabase>({
    allowed_users: [],
    processed_messages: [],
    chats: {}
  });
  
  const [activeTab, setActiveTab] = useState<"simulator" | "users" | "guide">("simulator");
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Allowed User Form State
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Simulator State
  const [simSenderPhone, setSimSenderPhone] = useState("whatsapp:+628123456789");
  const [customPhoneInput, setCustomPhoneInput] = useState("");
  const [isCustomPhone, setIsCustomPhone] = useState(false);
  const [simMessageText, setSimMessageText] = useState("");
  const [localLogs, setLocalLogs] = useState<WebhookLog[]>([]);

  // Snippet copied states
  const [jsCopied, setJsCopied] = useState(false);
  const [pkgCopied, setPkgCopied] = useState(false);

  // Fetch initial db states
  useEffect(() => {
    fetchDbState();
  }, []);

  const fetchDbState = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/db");
      if (!res.ok) throw new Error("Could not retrieve simulator database");
      const data: AppDatabase = await res.json();
      setDbState(data);
      
      // Auto-set the sender if previous is empty or vanished
      if (data.allowed_users.length > 0 && !simSenderPhone) {
        setSimSenderPhone(data.allowed_users[0].phone);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to load database details");
    } finally {
      setIsLoading(false);
    }
  };

  // Add an allowed user
  const handleAddAllowedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError("");
    setErrorMessage(null);

    let cleanPhone = newUserPhone.trim();
    if (!cleanPhone) {
      setPhoneError("Phone number is required");
      return;
    }

    // Basic format assertion helper
    if (!cleanPhone.startsWith("+") && !cleanPhone.startsWith("whatsapp:+")) {
      setPhoneError("Use international format starting with + (e.g. +628123456789)");
      return;
    }

    let finalPhone = cleanPhone;
    if (!finalPhone.startsWith("whatsapp:")) {
      finalPhone = `whatsapp:${cleanPhone}`;
    }

    setIsActionLoading(true);
    try {
      const res = await fetch("/api/allowed-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: finalPhone, name: newUserName || undefined })
      });
      
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to register allowed user");
      }

      setNewUserPhone("");
      setNewUserName("");
      await fetchDbState();
    } catch (err: any) {
      setErrorMessage(err.message || "Could not complete the request");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Remove an allowed user
  const handleDeleteAllowedUser = async (phone: string) => {
    if (!confirm(`Are you sure you want to remove ${phone} from access?`)) return;
    setIsActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/allowed-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });

      if (!res.ok) throw new Error("Could not delete user");
      await fetchDbState();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to remove user");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Clear specific chat history
  const handleClearHistory = async (phone: string) => {
    if (!confirm(`Clear all simulated memory for ${phone}?`)) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(phone)}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to wipe chats");
      await fetchDbState();
    } catch (err: any) {
      setErrorMessage(err?.message || "Wipe action failed");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Reset deduplication logs
  const handleClearDeduplication = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch("/api/clear-deduplication", { method: "POST" });
      if (!res.ok) throw new Error("Could not flush message IDs");
      await fetchDbState();
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to flush deduplication");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Submit Simulator Conversation
  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simMessageText.trim()) return;

    const sender = isCustomPhone ? customPhoneInput.trim() : simSenderPhone;
    if (!sender) {
      setErrorMessage("Please select or type a sender phone number");
      return;
    }

    // Format sender correctly
    let fSender = sender;
    if (!fSender.startsWith("whatsapp:")) {
      if (!fSender.startsWith("+")) {
        fSender = `whatsapp:+${fSender}`;
      } else {
        fSender = `whatsapp:${fSender}`;
      }
    }

    // Generate unique MessageSid for standard test
    const randomHex = Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join("");
    const messageId = `SM${randomHex}`;
    const userMessageBody = simMessageText;

    // Reset input
    setSimMessageText("");

    setIsActionLoading(true);
    try {
      const simulationPayload = {
        From: fSender,
        Body: userMessageBody,
        MessageSid: messageId
      };

      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(simulationPayload)
      });

      const xmlResponse = await res.text();
      
      // Determine if allowed by analyzing XML
      const isAllowed = !xmlResponse.includes("not authorized");

      // Log it
      const newLog: WebhookLog = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toLocaleTimeString(),
        payload: simulationPayload,
        responseXml: xmlResponse,
        isAllowed,
        messageSid: messageId
      };

      setLocalLogs(prev => [newLog, ...prev].slice(0, 50));
      await fetchDbState();
    } catch (err: any) {
      setErrorMessage("Simulator communication failed: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Get current active conversation logs
  const activeSimPhone = isCustomPhone ? customPhoneInput : simSenderPhone;
  const standardActivePhone = activeSimPhone.startsWith("whatsapp:") ? activeSimPhone : `whatsapp:${activeSimPhone}`;
  const conversationMessages = dbState.chats[standardActivePhone] || [];

  // Copy helpers
  const copyToClipboard = (text: string, type: "js" | "pkg") => {
    navigator.clipboard.writeText(text);
    if (type === "js") {
      setJsCopied(true);
      setTimeout(() => setJsCopied(false), 2000);
    } else {
      setPkgCopied(true);
      setTimeout(() => setPkgCopied(false), 2000);
    }
  };

  // Raw code constants to show on Deploy Tab matching the files we made
  const functionCodeStr = `/**
 * Firebase Cloud Function for WhatsApp Chatbot
 * Powered by Twilio, Firebase Firestore, and the Google Gemini API.
 */

const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { GoogleGenAI } = require("@google/genai");
const twilio = require("twilio");

initializeApp();
const db = getFirestore();

exports.whatsappBot = onRequest(
  { secrets: ["GEMINI_API_KEY", "TWILIO_AUTH_TOKEN"] },
  async (req, res) => {
    // 1. SECURITY: Cryptographic Twilio Signature Verification
    const twilioSignature = req.headers["x-twilio-signature"];
    const webhookUrl = process.env.WEBHOOK_URL || \`https://\${req.get("host")}\${req.originalUrl}\`; 
    
    const isAuthentic = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN || "",
      twilioSignature || "",
      webhookUrl,
      req.body
    );

    if (!isAuthentic && process.env.NODE_ENV === "production") {
      console.error("Access Denied: Webhook signature validation failed.");
      return res.status(403).send("Forbidden: Invalid Signature.");
    }

    const userPhone = req.body.From;       
    const userText = req.body.Body || "";  
    const messageId = req.body.MessageSid; 

    if (!userPhone) return res.status(400).send("Bad Request");

    try {
      // 2. IDEMPOTENCY LAYER
      if (messageId) {
        const msgCheckRef = db.collection("processed_messages").doc(messageId);
        const msgCheck = await msgCheckRef.get();
        if (msgCheck.exists) return res.status(200).send("<Response></Response>");
        await msgCheckRef.set({ processedAt: Timestamp.now() });
      }

      // 3. SECURE ACCESS CONTROL
      const userCheck = await db.collection("allowed_users").doc(userPhone).get();
      if (!userCheck.exists) {
        res.set("Content-Type", "text/xml");
        return res.status(200).send(\`
          <Response>
            <Message>Hello! You are not authorized to use this automated assistant.</Message>
          </Response>
        \`);
      }

      // 4. MEMORY MANAGEMENT
      const messagesRef = db.collection("users").doc(userPhone).collection("messages");
      const snapshot = await messagesRef.orderBy("timestamp", "desc").limit(10).get();
      
      const history = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        history.push({ role: data.role, parts: [{ text: data.text }] });
      });
      history.reverse(); 

      // 5. CORE AI PROCESSING (Gemini 3.5 Flash)
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const chat = ai.chats.create({
        model: "gemini-3.5-flash",
        config: {
          systemInstruction: "You are a professional, polite WhatsApp assistant. Keep answers brief and use emojis.",
        },
        history: history
      });

      const aiResult = await chat.sendMessage({ message: userText });
      const botReply = aiResult.text || "No response generated.";

      // 6. SAVE SESSION BACK TO DATABASE
      const batch = db.batch();
      batch.set(messagesRef.doc(), { role: "user", text: userText, timestamp: Timestamp.now() });
      batch.set(messagesRef.doc(), { role: "model", text: botReply, timestamp: Timestamp.now() });
      await batch.commit();

      // 7. RESPOND TO TWILIO
      res.set("Content-Type", "text/xml");
      return res.status(200).send(\`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>\${botReply}</Message>
</Response>\`);

    } catch (error) {
      console.error("Error:", error);
      res.set("Content-Type", "text/xml");
      return res.status(200).send(\`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>An unexpected error occurred. Please try again later.</Message>
</Response>\`);
    }
  }
);`;

  const packageJsonStr = `{
  "name": "functions",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": "20"
  },
  "main": "index.js",
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0",
    "@google/genai": "^2.4.0",
    "twilio": "^4.22.0"
  },
  "devDependencies": {
    "firebase-functions-test": "^3.1.0"
  }
}`;

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased flex flex-col">
      {/* 🟢 TOP NAV/HEADER */}
      <header className="border-b border-emerald-950/40 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20 text-emerald-400">
            <Cpu className="h-6 w-6 animate-pulse" id="header_icon" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
              WhatsApp Chatbot Hub
              <span className="text-xs bg-emerald-500/20 text-emerald-400 font-medium px-2 py-0.5 rounded-full border border-emerald-500/30">
                PROTOTYPE READY
              </span>
            </h1>
            <p className="text-xs text-slate-400">Twilio Webhook & Google Gemini (3.5) AI Management Console</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Local Core Engine Binded</span>
          </div>
          <button 
            onClick={fetchDbState} 
            title="Refresh database state"
            className="p-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-800 rounded-lg text-slate-300 transition-colors border border-slate-700 flex items-center"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </header>

      {/* 🔴 ERROR POPUP BANNER */}
      {errorMessage && (
        <div className="bg-rose-950/80 border-b border-rose-900 px-6 py-3 flex items-center justify-between gap-3 text-sm text-rose-300">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-xs text-rose-400 hover:text-white underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* 🟡 MAIN DASHBOARD CONTAINER */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* 💻 LEFT UTILITY & SETTINGS PANEL (1 Column) */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          
          {/* Navigation Cards */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-1.5 shadow-xl">
            <h3 className="text-xs font-semibold text-slate-400 tracking-wider uppercase mb-2 px-2">Navigation</h3>
            <button
              onClick={() => setActiveTab("simulator")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "simulator" 
                  ? "bg-gradient-to-r from-emerald-950/60 to-slate-900 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)]" 
                  : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
              }`}
            >
              <Smartphone className="h-4.5 w-4.5" />
              <span>Sandbox Simulator</span>
            </button>

            <button
              onClick={() => setActiveTab("users")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "users" 
                  ? "bg-gradient-to-r from-emerald-950/60 to-slate-900 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)]" 
                  : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
              }`}
            >
              <UserCheck className="h-4.5 w-4.5" />
              <span>Allowed Directory</span>
              <span className="ml-auto bg-slate-850 text-slate-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-slate-800">
                {dbState.allowed_users.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("guide")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "guide" 
                  ? "bg-gradient-to-r from-emerald-950/60 to-slate-900 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)]" 
                  : "text-slate-300 hover:bg-slate-800/50 hover:text-white border border-transparent"
              }`}
            >
              <BookOpen className="h-4.5 w-4.5" />
              <span>Deployment Center</span>
            </button>
          </div>

          {/* Quick Engine Telemetry */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-4 shadow-xl">
            <h3 className="text-xs font-semibold text-slate-400 tracking-wider uppercase px-1 flex items-center justify-between">
              <span>ACTIVE SYSTEM CONTEXT</span>
              <Settings className="h-3.5 w-3.5 text-slate-500" />
            </h3>
            
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/50">
                <span className="text-slate-400">Gemini LLM Target</span>
                <span className="font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/10 px-2 py-0.5 rounded">gemini-3.5-flash</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/50">
                <span className="text-slate-400">Webhook Host</span>
                <span className="font-mono bg-slate-950 text-emerald-400 px-2 py-0.5 rounded">Port 3000 (Express)</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/50">
                <span className="text-slate-400">Deduplication State</span>
                <span className="text-slate-200 flex items-center gap-1.5">
                  <Database className="h-3 w-3 text-slate-400" />
                  {dbState.processed_messages.length} processed
                </span>
              </div>
              {dbState.processed_messages.length > 0 && (
                <button
                  onClick={handleClearDeduplication}
                  className="w-full text-center py-1.5 text-[11px] bg-slate-950 border border-slate-800 hover:bg-slate-850 text-rose-400 hover:text-rose-300 rounded-lg font-medium transition-colors"
                >
                  Clear Deduplication Cache
                </button>
              )}
            </div>
          </div>

          {/* Security Notice */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center gap-2 text-amber-400 font-medium">
              <ShieldAlert className="h-4.5 w-4.5" />
              <span>DEDUPLICATED SECURITY</span>
            </div>
            <p className="leading-relaxed">
              When Twilio retries webhook POST requests, the bot evaluates the <code className="font-mono text-emerald-400 hover:underline">MessageSid</code> document inside your <code className="font-mono text-slate-200">processed_messages</code> collection to avoid processing duplicate triggers and wasting token costs.
            </p>
          </div>

        </div>

        {/* 🚀 TAB CONTENT FRAME (3 Columns) */}
        <div className="lg:col-span-3 flex flex-col gap-6 text-slate-100">
          
          {/* TAB 1: INTERACTIVE WEBHOOK SIMULATOR */}
          {activeTab === "simulator" && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[500px]">
              
              {/* PHONE CHAT WINDOW (7 Cols on medium) */}
              <div className="md:col-span-7 flex flex-col bg-slate-900 rounded-2xl border border-slate-800/80 overflow-hidden shadow-xl">
                
                {/* Simulated WhatsApp Header */}
                <div className="bg-emerald-950/40 p-4 border-b border-emerald-900/40 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold relative shrink-0">
                    WA
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900"></span>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white flex items-center gap-1.5">
                      Gemini WhatsApp Bot
                    </h4>
                    <p className="text-[11px] text-emerald-400 font-normal">Online • Dynamic Memory Active</p>
                  </div>

                  <div className="ml-auto text-xs bg-slate-950/60 text-slate-400 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
                    <SpeakerPhoneIcon className="h-3 w-3 text-emerald-400" />
                    <span>SIMULATOR</span>
                  </div>
                </div>

                {/* Sender Context Banner */}
                <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800/80 text-[11px] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">Sending message as:</span>
                    <span className="font-mono font-bold text-emerald-400">{isCustomPhone ? "Custom / Rogue Number" : simSenderPhone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isCustomPhone} 
                        onChange={(e) => setIsCustomPhone(e.target.checked)}
                        className="rounded border-slate-800 text-emerald-600 focus:ring-emerald-600 bg-slate-900"
                      />
                      <span>Custom Number</span>
                    </label>
                  </div>
                </div>

                {/* Sender Inputs options */}
                {isCustomPhone ? (
                  <div className="bg-slate-950/40 border-b border-slate-850 px-4 py-2 text-xs flex items-center gap-2">
                    <span className="text-slate-400 shrink-0">Mock Phone:</span>
                    <input 
                      type="text" 
                      placeholder="e.g. +19998887766" 
                      value={customPhoneInput}
                      onChange={(e) => setCustomPhoneInput(e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-xs px-2.5 py-1 rounded w-full focus:outline-none focus:border-emerald-500 rounded-lg text-slate-200"
                    />
                    <span className="text-[10px] text-slate-500 italic shrink-0">(Will test security blocks!)</span>
                  </div>
                ) : (
                  <div className="bg-slate-950/40 border-b border-slate-850 px-4 py-2 text-xs flex items-center gap-2">
                    <span className="text-slate-400 shrink-0">Select Approved:</span>
                    <select
                      value={simSenderPhone}
                      onChange={(e) => setSimSenderPhone(e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-xs px-2 py-1 rounded focus:outline-none focus:border-emerald-500 rounded-lg text-slate-200 flex-1 cursor-pointer"
                    >
                      {dbState.allowed_users.map(user => (
                        <option key={user.phone} value={user.phone}>{user.name} ({user.phone})</option>
                      ))}
                      {dbState.allowed_users.length === 0 && (
                        <option value="">(No approved users! Go to Tab 2 to add some)</option>
                      )}
                    </select>
                  </div>
                )}

                {/* WhatsApp Messages Feed */}
                <div 
                  className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-950/80 min-h-[300px] max-h-[360px] flex flex-col justify-end"
                >
                  <div className="text-center my-2 text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-850 pb-2">
                    CHATROOM PERSISTENCE: {standardActivePhone}
                  </div>

                  {conversationMessages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-slate-500 gap-2">
                      <HelpCircle className="h-8 w-8 text-slate-700" />
                      <p>No messages in this thread yet.</p>
                      <p className="max-w-[180px] leading-relaxed">Send a message below. The dashboard handles session memory dynamically.</p>
                    </div>
                  ) : (
                    <div className="space-y-3.5 overflow-y-auto pr-1">
                      {conversationMessages.map((msg, idx) => {
                        const isUser = msg.role === "user";
                        const isBlockedMsg = msg.text.startsWith("[BLOCKED]");
                        return (
                          <div 
                            key={idx} 
                            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                          >
                            <div 
                              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-md leading-relaxed ${
                                isUser 
                                  ? "bg-emerald-600 text-white rounded-tr-none" 
                                  : isBlockedMsg 
                                    ? "bg-rose-950 border border-rose-900 text-rose-200 rounded-tl-none font-mono" 
                                    : "bg-slate-800 text-slate-200 rounded-tl-none"
                              }`}
                            >
                              {!isUser && (
                                <p className="text-[10px] text-emerald-400 font-semibold mb-1 opacity-80 uppercase tracking-wider">
                                  {isBlockedMsg ? "🛡️ Core Security" : "🤖 BOT RESPONSE"}
                                </p>
                              )}
                              <p className="whitespace-pre-line">{msg.text}</p>
                              <span className="block text-[8px] text-slate-400 mt-1.5 text-right opacity-60">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Simulated Input Bar */}
                <form onSubmit={handleSimulateWebhook} className="bg-slate-900 border-t border-slate-800 p-3 flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Type simulated whatsapp message..."
                    value={simMessageText}
                    onChange={(e) => setSimMessageText(e.target.value)}
                    disabled={isActionLoading}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-full px-4.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder-slate-500"
                  />
                  <button 
                    type="submit" 
                    disabled={isActionLoading || !simMessageText.trim()}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white p-2.5 rounded-full transition-all flex items-center justify-center shrink-0 disabled:text-slate-600 hover:scale-105 active:scale-95"
                  >
                    <Send className="h-4.5 w-4.5" />
                  </button>
                </form>

              </div>

              {/* LIVE WEBHOOK PAYLOADS LOGS (5 Cols on medium) */}
              <div className="md:col-span-5 flex flex-col bg-slate-900 rounded-2xl border border-slate-800/80 overflow-hidden shadow-xl">
                <div className="bg-slate-950 p-4 border-b border-slate-850 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-emerald-400" />
                    <span>TwiML Webhook Stream</span>
                  </h4>
                  <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-700">
                    POST Callback Logs
                  </span>
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-4 max-h-[432px]">
                  {localLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-xs text-slate-600 gap-2">
                      <Terminal className="h-8 w-8 text-slate-800 animate-pulse" />
                      <p>Listener waiting for webhooks...</p>
                      <p className="max-w-[160px] text-[10px] italic">Send a chat message inside the simulator on the left to intercept payload outputs!</p>
                    </div>
                  ) : (
                    localLogs.map((log) => (
                      <div key={log.id} className="bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs flex flex-col gap-2.5 font-mono shadow">
                        {/* Log Meta */}
                        <div className="flex justify-between items-center text-[10px] text-slate-500 pb-1.5 border-b border-slate-900">
                          <span>⏱️ {log.timestamp}</span>
                          <span className={log.isAllowed ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                            {log.isAllowed ? "APPROVED (200 OK)" : "REJECTED (403 BLOCKED)"}
                          </span>
                        </div>

                        {/* Incoming JSON payload truncated */}
                        <div className="space-y-1">
                          <span className="text-slate-500 text-[10px] block">Incoming Body (Express req.body):</span>
                          <div className="bg-slate-900 border border-slate-850/60 p-2 rounded text-[10px] overflow-x-auto text-slate-300">
                            <div>From: "{log.payload.From}"</div>
                            <div>Body: "{log.payload.Body}"</div>
                            <div className="text-slate-500">MessageSid: "{log.payload.MessageSid}"</div>
                          </div>
                        </div>

                        {/* XML Outgoing TwiML response */}
                        <div className="space-y-1">
                          <span className="text-slate-500 text-[10px] block">Response Output (XML / TwiML):</span>
                          <pre className="bg-emerald-950/20 border border-emerald-900/30 p-2 rounded text-[10px] text-emerald-400 overflow-x-auto select-all max-h-36">
                            {log.responseXml}
                          </pre>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Option to clear chat thread logic visually */}
                {conversationMessages.length > 0 && (
                  <div className="bg-slate-950/40 p-3 border-t border-slate-800 text-center">
                    <button
                      onClick={() => handleClearHistory(standardActivePhone)}
                      className="text-xs text-rose-400 hover:text-rose-300 underline inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Simulated Chat Session Thread</span>
                    </button>
                  </div>
                )}
                
              </div>

            </div>
          )}

          {/* TAB 2: ALLOWED USERS DIRECTORY MANAGEMENT */}
          {activeTab === "users" && (
            <div className="space-y-6">
              
              {/* Add New Number Form */}
              <div className="bg-slate-900 border border-slate-800/85 rounded-2xl p-5 shadow-xl">
                <h3 className="text-sm font-semibold text-white tracking-wide uppercase mb-3 flex items-center gap-2">
                  <Plus className="h-4.5 w-4.5 text-emerald-400" />
                  <span>Register Approved Access Number</span>
                </h3>
                
                <form onSubmit={handleAddAllowedUser} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-5 space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">Phone Number (International Format)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 text-xs">
                        +
                      </div>
                      <input 
                        type="tel" 
                        placeholder="628123456789 or 14155552671"
                        value={newUserPhone}
                        onChange={(e) => {
                          setNewUserPhone(e.target.value);
                          if (phoneError) setPhoneError("");
                        }}
                        className="w-full bg-slate-950 border border-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl pl-8 pr-3 py-3 text-xs font-mono text-slate-200"
                      />
                    </div>
                    {phoneError && <p className="text-[10px] text-rose-400 font-medium mt-1">{phoneError}</p>}
                  </div>

                  <div className="md:col-span-5 space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">Contact Identifier Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Alice Lim (CEO)"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-3 text-xs text-slate-200"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <button 
                      type="submit"
                      disabled={isActionLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.02] active:scale-[0.98] disabled:bg-slate-800 transition-all text-white rounded-xl py-3 text-xs font-semibold flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>{isActionLoading ? "Adding..." : "Add User"}</span>
                    </button>
                  </div>
                </form>

                <div className="mt-4 bg-emerald-950/10 border border-emerald-950/30 rounded-xl p-3 text-xs leading-relaxed text-slate-400/90 flex gap-2">
                  <AlertCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                  <p>
                    <strong>Database Access Rule:</strong> Only phone numbers registered here will pass the relational security check of our Firebase Cloud Function. Any unregistered number texting your WhatsApp Business/Sandbox line receives an automatic polite denial response protecting your Gemini API tokens from unsolicited leakage.
                  </p>
                </div>
              </div>

              {/* Users Directory Table */}
              <div className="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 bg-slate-950/60 border-b border-slate-850 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Approved Directory Documents</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">Stored as Document ID inFirestore collection `allowed_users`</p>
                  </div>
                  <span className="text-xs bg-slate-800 text-slate-300 px-2 rounded-full border border-slate-700 font-bold py-0.5">
                    {dbState.allowed_users.length} Active Records
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950/30 text-slate-400 border-b border-slate-850">
                        <th className="p-3.5 font-medium">Firestore Document Name (Phone)</th>
                        <th className="p-3.5 font-medium">Identifier Name</th>
                        <th className="p-3.5 font-medium">Registered Date</th>
                        <th className="p-3.5 font-medium text-right">Access Controls</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {dbState.allowed_users.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-10 text-center text-slate-500 bg-slate-900/40">
                            <UserCheck className="h-8 w-8 mx-auto text-slate-800 mb-2" />
                            No authorized users exist. Enter a country code and phone number above to activate communications.
                          </td>
                        </tr>
                      ) : (
                        dbState.allowed_users.map((user) => (
                          <tr key={user.phone} className="hover:bg-slate-850/30 transition-colors">
                            <td className="p-3.5 font-mono text-emerald-400 font-bold">
                              {user.phone}
                            </td>
                            <td className="p-3.5 font-medium text-slate-200">
                              {user.name}
                            </td>
                            <td className="p-3.5 text-slate-400">
                              {new Date(user.addedAt).toLocaleString()}
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() => handleDeleteAllowedUser(user.phone)}
                                disabled={isActionLoading}
                                title="Revoke permissions instantly"
                                className="p-1.5 hover:bg-rose-950/40 border border-slate-850 hover:border-rose-900 text-slate-500 hover:text-rose-400 rounded-lg transition-all cursor-pointer inline-flex"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
              
            </div>
          )}

          {/* TAB 3: STEP-BY-STEP DEPLOY CENTER & EXPORTS */}
          {activeTab === "guide" && (
            <div className="space-y-6">
              
              {/* High-Level Overview Checklist */}
              <div className="bg-gradient-to-r from-emerald-950/30 to-slate-900 border border-emerald-950/50 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/20 p-2 rounded-xl text-emerald-400 border border-emerald-500/30">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Your WhatsApp Bot Code is Ready and Structured!</h3>
                    <p className="text-xs text-slate-400">We have written and saved completely deployable cloud directory files in your workspace under `/functions` folder.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-800 pt-4 text-xs">
                  <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-xl flex flex-col gap-1.5">
                    <span className="text-slate-400">🔥 FIREBASE CODE</span>
                    <span className="font-mono text-emerald-400">functions/index.js</span>
                    <span className="text-[10px] text-slate-500">Includes secure deduplication and Gemini chat creation wrapper.</span>
                  </div>
                  <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-xl flex flex-col gap-1.5">
                    <span className="text-slate-400">📦 FILE DEPS</span>
                    <span className="font-mono text-emerald-400">functions/package.json</span>
                    <span className="text-[10px] text-slate-500">Configures @google/genai, twilio integrations on Node 20 runtime.</span>
                  </div>
                  <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-xl flex flex-col gap-1.5">
                    <span className="text-slate-400">📋 ENV METRICS</span>
                    <span className="font-mono text-emerald-400">.env.example</span>
                    <span className="text-[10px] text-slate-500">Identifies secrets to store. No secrets committed to git.</span>
                  </div>
                </div>
              </div>

              {/* Step-by-Step Interactive Accordion */}
              <div className="space-y-4">
                
                {/* Step 1 */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 flex gap-4 shadow">
                  <div className="w-7 h-7 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-full flex items-center justify-center shrink-0 font-bold text-xs">
                    1
                  </div>
                  <div className="space-y-2 flex-1 text-xs">
                    <h4 className="font-semibold text-white text-sm">Configure Secrets & Cloud Environment</h4>
                    <p className="text-slate-400 leading-relaxed">
                      Initialize Firestore inside your Firebase Project console. Then, secure your keys using Google Cloud Secrets. Before uploading functions, define the keys to prevent code leakage to git:
                    </p>
                    <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg font-mono text-[11px] text-slate-300">
                      <div>firebase functions:secrets:set GEMINI_API_KEY="YOUR_GEMINI_KEY"</div>
                      <div className="mt-1">firebase functions:secrets:set TWILIO_AUTH_TOKEN="YOUR_TWILIO_AUTH"</div>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 flex gap-4 shadow">
                  <div className="w-7 h-7 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-full flex items-center justify-center shrink-0 font-bold text-xs">
                    2
                  </div>
                  <div className="space-y-2 flex-1 text-xs">
                    <h4 className="font-semibold text-white text-sm">Deploy Using Firebase CLI</h4>
                    <p className="text-slate-400 leading-relaxed">
                      Deploy to your workspace. Make sure you have installed standard Firebase Tools, run `firebase login`, and binded to your valid backend project:
                    </p>
                    <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg font-mono text-[11px] text-slate-300">
                      <div># In the root node directory</div>
                      <div>firebase deploy --only functions</div>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 flex gap-4 shadow">
                  <div className="w-7 h-7 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-full flex items-center justify-center shrink-0 font-bold text-xs">
                    3
                  </div>
                  <div className="space-y-2 flex-1 text-xs">
                    <h4 className="font-semibold text-white text-sm">Link Deployed Webhook inside Twilio Panel</h4>
                    <p className="text-slate-400 leading-relaxed">
                      Retrieve the live deployed web trigger URL from your Firebase Functions CLI dashboard. Head over to <strong>Twilio Admin Panel &gt; Messaging &gt; Settings &gt; WhatsApp Sandbox</strong> (or your WhatsApp Live sender line). Paste your HTTPS callback URL under the "A Message Comes In" webhook field set to <code>HTTP POST</code>.
                    </p>
                  </div>
                </div>

              </div>

              {/* Full Firebase function source viewer file cards */}
              <div className="space-y-4">
                {/* functions/index.js Card Viewer */}
                <div className="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl flex flex-col">
                  <div className="bg-slate-950 px-4 py-3 border-b border-slate-850 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-yellow-400 rounded-full"></span>
                      <span className="font-mono text-slate-300 font-semibold text-xs">functions/index.js (Deployment Source)</span>
                    </div>
                    <button 
                      onClick={() => copyToClipboard(functionCodeStr, "js")}
                      className={`text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors border flex items-center gap-1.5 cursor-pointer ${
                        jsCopied 
                          ? "bg-emerald-950/40 text-emerald-400 border-emerald-800" 
                          : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
                      }`}
                    >
                      {jsCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{jsCopied ? "Copied!" : "Copy JavaScript Code"}</span>
                    </button>
                  </div>
                  <pre className="p-4 bg-slate-950/60 font-mono text-[10.5px] text-slate-300 overflow-x-auto leading-relaxed max-h-[300px] select-all">
                    {functionCodeStr}
                  </pre>
                </div>

                {/* functions/package.json Card Viewer */}
                <div className="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl flex flex-col">
                  <div className="bg-slate-950 px-4 py-3 border-b border-slate-850 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-sky-400 rounded-full"></span>
                      <span className="font-mono text-slate-300 font-semibold text-xs">functions/package.json (Deployment Manifest)</span>
                    </div>
                    <button 
                      onClick={() => copyToClipboard(packageJsonStr, "pkg")}
                      className={`text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors border flex items-center gap-1.5 cursor-pointer ${
                        pkgCopied 
                          ? "bg-emerald-950/40 text-emerald-400 border-emerald-800" 
                          : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
                      }`}
                    >
                      {pkgCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{pkgCopied ? "Copied!" : "Copy package.json Code"}</span>
                    </button>
                  </div>
                  <pre className="p-4 bg-slate-950/60 font-mono text-[10.5px] text-slate-300 overflow-x-auto leading-relaxed max-h-[160px] select-all">
                    {packageJsonStr}
                  </pre>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* 🔮 SLATE FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950/90 text-center py-4 px-6 text-xs text-slate-500 mt-auto flex flex-col md:flex-row justify-between items-center gap-3">
        <p>© 2026 WhatsApp Chatbot Manager. Designed for high fidelity offline/online testing workflows.</p>
        <p className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-emerald-500" />
          <span>Local State Seed: Synchronized and persisting state in app_db.json</span>
        </p>
      </footer>
    </div>
  );
}

// Inline Icons to replace any missing lucide-react exports cleanly
function SpeakerPhoneIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M18 8a6 6 0 0 0-12 0" />
      <path d="M22 8a10 10 0 0 0-20 0" />
      <path d="M12 12v10" />
      <path d="m9 19 3 3 3-3" />
    </svg>
  );
}
