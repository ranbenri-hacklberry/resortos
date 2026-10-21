// Test isolation (2026-10-21): never let unit tests reach the live office bridge.
import { vi } from 'vitest';

process.env.HOTELOS_BRIDGE_URL = 'http://127.0.0.1:9'; // closed port, belt-and-braces
vi.mock('../calls/deskReply.js', () => ({ consultCallDesk: async () => null }));
