import type { WAMessage } from '@whiskeysockets/baileys';

export type WaStatus = 'idle' | 'connecting' | 'qr' | 'open' | 'closed' | 'logged_out';

export type ChannelId = 'resortos' | 'mialees' | string;

export interface ChannelConfig {
  id: ChannelId;
  name: string;
  phoneNumber: string;
  authDir: string;
  enabled: boolean;
  browserName?: [string, string, string];
}

export interface InboundEnvelope {
  /** Identifier of the receiving channel (e.g. 'resortos' or 'mialees') */
  channelId: ChannelId;
  /** Unique message identifier for idempotency & deduplication */
  messageId: string;
  /** Remote WhatsApp JID (phone@s.whatsapp.net or lid@lid) */
  remoteJid: string;
  /** Normalized sender phone number digits (e.g. 972501234567) */
  senderPhone: string;
  /** Message arrival epoch timestamp in milliseconds */
  timestamp: number;
  /** True if message was sent from the connected device itself (e.g. human operator) */
  fromMe: boolean;
  /** Extracted text content or caption */
  text: string | null;
  /** Whether the message is an audio note */
  isAudio: boolean;
  /** Underlying raw Baileys WAMessage object */
  rawMessage: WAMessage;
}

export interface SendResult {
  messageId: string;
  channelId: ChannelId;
  sentTo: string;
  timestamp: number;
}

export interface TakeoverRecord {
  channelId: ChannelId;
  chatId: string; // phone digits or remoteJid
  bookingId?: string;
  botDisabled: boolean;
  reason: 'manual_reply' | 'manager_toggle' | 'checkout' | string;
  updatedBy?: string;
  updatedAt: number;
}

/**
 * Universal channel adapter interface.
 * Abstracts Baileys or future WhatsApp Cloud / Business API.
 */
export interface WhatsAppChannelAdapter {
  readonly channelId: ChannelId;
  readonly phoneNumber: string;
  readonly displayName: string;
  readonly status: WaStatus;

  start(): Promise<void>;
  stop(): Promise<void>;

  sendText(rawJid: string, text: string): Promise<SendResult>;
  sendImage(rawJid: string, buffer: Buffer, caption?: string): Promise<SendResult>;

  on(event: 'message', listener: (envelope: InboundEnvelope) => void): this;
  on(event: 'qr', listener: (qr: string) => void): this;
  on(event: 'authenticated', listener: () => void): this;
  on(event: 'status_change', listener: (status: WaStatus) => void): this;
  on(event: 'logged_out', listener: () => void): this;
}
