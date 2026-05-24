// Shared types for the WhatsApp Chatbot Manager app

export interface AllowedUser {
  phone: string;
  name: string;
  addedAt: string;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
  timestamp: string;
}

export interface AppDatabase {
  allowed_users: AllowedUser[];
  processed_messages: { messageId: string; processedAt: string }[];
  chats: { [phone: string]: ChatMessage[] };
}

export interface SimulationPayload {
  From: string;
  Body: string;
  MessageSid: string;
}

export interface WebhookLog {
  id: string;
  timestamp: string;
  payload: SimulationPayload;
  responseXml: string;
  isAllowed: boolean;
  messageSid: string;
}
