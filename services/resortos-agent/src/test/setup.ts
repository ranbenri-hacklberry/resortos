// Test isolation (2026-10-21): never let unit tests reach the live office bridge.
import { vi } from 'vitest';

process.env.HOTELOS_BRIDGE_URL = 'http://127.0.0.1:9'; // closed port, belt-and-braces
vi.mock('../calls/deskReply.js', () => ({ consultCallDesk: async () => null }));

// HYP payment links (2026-10-28): never create a real link from tests; local records go to a temp dir.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.HYP_PAYLINK_ENABLED = 'false';
process.env.HYP_PAYLINK_DRY_RUN = 'true';
process.env.HYP_PAYLINK_STORE = join(mkdtempSync(join(tmpdir(), 'chloe-paylink-')), 'hyp-paylinks.jsonl');
