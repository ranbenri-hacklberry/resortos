# resortos-agent

Local WhatsApp operations agent: Baileys → ffmpeg → mlx-whisper → the local Ollama model (`OLLAMA_MODEL`, default `gemma4:12b`) → ResortOS API. 100% on-device.

What it does for the property is summarized in the root [README](../../README.md#the-whatsapp-agent).

## Install

```bash
brew install ffmpeg node ollama python@3.12
cd services/resortos-agent

# Node deps
npm install

# Python STT env (Apple Silicon / MLX)
python3.12 -m venv .venv
.venv/bin/pip install mlx-whisper

# LLM
brew services start ollama
ollama pull gemma4:12b
```

## Data & ResortOS pairing

```bash
# rooms: already generated from src/lib/units.js + fieldUnitCatalog.js (40 units). Regenerate from the repo root:
npx vite-node services/resortos-agent/scripts/gen-rooms.ts

# one-time: request an agent credential, then approve the 4-char code in ResortOS (manager) → prints RESORTOS_TOKEN
RESORTOS_URL=http://127.0.0.1:4038 npm run connect

# staff: data/cleaners.json is EMPTY on purpose. Import housekeeping/maintenance staff with phones from ResortOS
# (needs a manager session token from POST /api/auth/login), then review each `language` (th|ar|he):
RESORTOS_MANAGER_TOKEN=... npm run sync-cleaners
```

API contract used (see `src/integration/resortos.ts`): `GET /api/ops/units`, `PUT /api/ops/units/:id` with `Authorization: Bearer ros_agent_…`.
"Ready" is written as `READY` + reason `ממתין לביקורת מנהל` (manager inspection step); issues become `MAINTENANCE_ALERT`; missing supplies keep the unit `DIRTY` with a `חוסר:` reason.

For full architectural documentation, state machines (housekeeping fast-paths, manager Q&A context, slang matching, and guest digital stay FAQ), see [SMART_KEY_QR_SYSTEM.md](./SMART_KEY_QR_SYSTEM.md).

## Test

```bash
npm test                 # runs all 61 Vitest unit tests (<1.3s)
npm run typecheck
```

# STT smoke test (first run downloads whisper-large-v3-turbo, ~1.6GB)
.venv/bin/python src/stt/transcriber.py --file sample.wav

# LLM smoke test
curl -s localhost:11434/api/chat -d '{"model":"gemma4:12b","stream":false,"messages":[{"role":"user","content":"ping"}]}' | head -c 200
```

## Run

```bash
export RESORTOS_URL=http://localhost:3000   # where /api/rooms/status and /api/maintenance/tickets live
npm run dev                                 # scan the QR in the terminal (WhatsApp → Linked devices)
curl -s localhost:8787/health | jq

# Outbound dispatch (what ResortOS calls)
curl -s -X POST localhost:8787/api/cleaners/dispatch -H 'content-type: application/json' \
  -d '{"cleaner_phone":"66812345678","message_he":"להחליף מצעים בבקתה 1, אורח הבא ב-15:00"}'
```

End-to-end: send a voice note from a configured number, e.g. "กระท่อม 1 เสร็จแล้วค่ะ" → room goes ready in ResortOS and you get a Thai reply.

## launchd (start on boot, restart on crash)

```bash
npm run build && mkdir -p logs
# edit the paths in com.resortos.agent.plist first (node path: `which node`)
cp com.resortos.agent.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.resortos.agent.plist
launchctl kickstart -k gui/$(id -u)/com.resortos.agent
```
Starting at *boot* without login requires a LaunchDaemon (`/Library/LaunchDaemons`, `sudo`, plus a `UserName` key) or auto-login.

## Env vars
`AGENT_PORT` (8787), `OLLAMA_URL`, `OLLAMA_MODEL`, `WHISPER_MODEL`, `PYTHON_BIN`, `RESORTOS_URL`, `RESORTOS_TOKEN`, `DISPATCH_TOKEN` (header `x-agent-token`), `DATA_DIR`, `LOG_LEVEL`.

## Notes
- The HTTP server binds to 127.0.0.1 only.
- `format` uses a full JSON Schema (Ollama structured outputs), which is stricter than `"json"`; room ids are re-validated against `data/rooms.json`.
- Whisper stays resident in a Python worker; the <500ms target depends on short notes and a warm model.
- Replies are only sent after ResortOS sync succeeds, so workers never get a false confirmation.
- Unknown senders and group chats are ignored.
