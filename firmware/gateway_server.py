#!/usr/bin/env python3
"""
ResortOS IoT Edge Gateway
Serves a responsive 3-Tab Web UI and REST API over the local network / USB Serial.
Tabs:
  1. מנעול חכם (Smart Lock & Physical IC Cards / RFID Fobs)
  2. שלט מכשירים (TCL AC Climate Control, Samsung TV, IR Blaster)
  3. יומן לוגים (Real-time Live ESP32 & System Logs)
"""
import sys
import os
import asyncio
import json
import time
from datetime import datetime
import threading
import glob
import serial
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Ensure immediate unbuffered console logging
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

LOCK_CONFIG_PATH = "/Users/user/Documents/Max/hotelos/firmware/lock_config.json"
CARDS_DB_PATH = "/Users/user/Documents/Max/hotelos/firmware/cards_db.json"
LOCK_ACTIVITY_PATH = "/Users/user/Documents/Max/hotelos/firmware/lock_activity.json"

# ============================================================================
# In-Memory Real-Time Log Store
# ============================================================================
SYSTEM_LOGS = []
MAX_LOGS = 300
logs_lock = threading.Lock()
lock_activity_lock = threading.Lock()

def log_event(level, msg):
    with logs_lock:
        entry = {
            "time": time.strftime("%H:%M:%S"),
            "level": level,  # "info", "success", "warn", "error"
            "message": str(msg)
        }
        SYSTEM_LOGS.append(entry)
        if len(SYSTEM_LOGS) > MAX_LOGS:
            SYSTEM_LOGS.pop(0)

log_event("info", "ResortOS IoT Gateway הופעל בהצלחה.")

# ============================================================================
# Dedicated Lock Access Activity Store (Who Opened / Locked, Date & Time)
# ============================================================================
def load_lock_activity():
    with lock_activity_lock:
        if not os.path.exists(LOCK_ACTIVITY_PATH):
            return []
        try:
            with open(LOCK_ACTIVITY_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[!] Error loading lock activity: {e}", flush=True)
            return []

def save_lock_activity(records):
    with lock_activity_lock:
        try:
            with open(LOCK_ACTIVITY_PATH, "w", encoding="utf-8") as f:
                json.dump(records, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[!] Error saving lock activity: {e}", flush=True)

def load_cards_map():
    cards = {}
    if os.path.exists(CARDS_DB_PATH):
        try:
            with open(CARDS_DB_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                for c in data:
                    cid = str(c.get("cardId", "")).strip()
                    if cid:
                        cards[cid] = c.get("name", f"כרטיס {cid}")
        except Exception as e:
            print(f"[!] Error loading cards db: {e}", flush=True)
    return cards

def record_lock_action(action: str, operator: str, status: str = "success", method: str = "Bluetooth LE", details: str = ""):
    now = datetime.now()
    action_labels = {
        "unlock": "פתיחת דלת",
        "lock": "נעילת דלת",
        "passcode": "יצירת קוד גישה",
        "card_add": "הוספת מפתח פיזי",
        "card_delete": "מחיקת מפתח פיזי"
    }
    action_label = action_labels.get(action, action)
    entry = {
        "id": f"act-{int(time.time()*1000)}",
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
        "date": now.strftime("%d/%m/%Y"),
        "time": now.strftime("%H:%M:%S"),
        "action": action,
        "action_label": action_label,
        "operator": operator,
        "method": method,
        "status": status,
        "status_label": "הצלחה" if status == "success" else "נכשל",
        "details": details
    }
    records = load_lock_activity()
    records.insert(0, entry)  # Newest first
    if len(records) > 300:
        records = records[:300]
    save_lock_activity(records)
    log_event("success" if status == "success" else "warn", f"[פעולת מנעול] {action_label} על ידי {operator} ({entry['status_label']})")
    return entry

HTML_DASHBOARD = """<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ResortOS - בקר חדר חכם, מנעול ושלט</title>
    <style>
        :root {
            --primary: #2563eb;
            --primary-hover: #1d4ed8;
            --bg: #0b1120;
            --card: #1e293b;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --accent-green: #10b981;
            --accent-red: #ef4444;
            --accent-blue: #38bdf8;
            --accent-purple: #8b5cf6;
            --border: rgba(255, 255, 255, 0.08);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: var(--bg); color: var(--text); padding: 20px 14px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
        .container { width: 100%; max-width: 540px; }
        header { text-align: center; margin-bottom: 18px; }
        h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 4px; }
        .subtitle { color: var(--text-muted); font-size: 13px; }
        .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-top: 8px; border: 1px solid rgba(16, 185, 129, 0.3); }
        .pulse-dot { width: 8px; height: 8px; background: #34d399; border-radius: 50%; box-shadow: 0 0 8px #34d399; }

        /* 3-Tab Navigation Bar */
        .tabs-nav {
            display: flex;
            background: rgba(15, 23, 42, 0.8);
            padding: 5px;
            border-radius: 16px;
            gap: 6px;
            margin-bottom: 18px;
            border: 1px solid var(--border);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        }
        .tab-btn {
            flex: 1;
            background: transparent;
            color: var(--text-muted);
            border: none;
            border-radius: 12px;
            padding: 12px 6px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: 6px;
            box-shadow: none;
            transition: all 0.2s ease;
        }
        .tab-btn:hover:not(.active) {
            background: rgba(255, 255, 255, 0.05);
            color: white;
            transform: none;
        }
        .tab-btn.active {
            background: var(--primary);
            color: white;
            box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
            transform: none;
        }
        .log-badge {
            background: rgba(255, 255, 255, 0.2);
            font-size: 11px;
            padding: 1px 6px;
            border-radius: 999px;
            font-weight: 700;
        }

        /* Tab Content Transitions */
        .tab-content {
            display: none;
            animation: fadeIn 0.2s ease;
        }
        .tab-content.active {
            display: block;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Common Card Styles */
        .card { background: var(--card); border-radius: 18px; padding: 18px; margin-bottom: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); border: 1px solid var(--border); }
        .card-title { font-size: 16px; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
        .btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        button { background: var(--primary); color: white; border: none; border-radius: 14px; padding: 16px 12px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.3); }
        button:active:not(:disabled) { transform: translateY(0); }
        button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        button.btn-unlock { background: linear-gradient(135deg, #059669, #10b981); }
        button.btn-lock { background: linear-gradient(135deg, #dc2626, #ef4444); }
        button.btn-full { grid-column: span 2; }
        .icon { font-size: 24px; }
        .input-group { display: flex; gap: 8px; margin-top: 8px; }
        input { flex: 1; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 12px 14px; color: white; font-size: 15px; }
        input:focus { outline: none; border-color: var(--primary); }
        #status-box { background: rgba(15, 23, 42, 0.85); border-radius: 14px; padding: 14px 16px; margin-top: 10px; font-size: 14px; color: var(--text-muted); min-height: 58px; border: 1px solid var(--border); line-height: 1.5; }
        .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 0.8s linear infinite; vertical-align: middle; margin-left: 6px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .countdown { font-size: 12px; color: #f59e0b; margin-top: 4px; font-weight: normal; }

        /* Lock Operation Records Styling */
        .lock-op-row {
            background: rgba(15, 23, 42, 0.65);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            transition: all 0.2s ease;
        }
        .lock-op-row:hover {
            border-color: rgba(255, 255, 255, 0.18);
            background: rgba(15, 23, 42, 0.85);
        }
        .lock-op-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .lock-op-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 10px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 700;
        }
        .lock-op-badge.unlock {
            background: rgba(16, 185, 129, 0.2);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .lock-op-badge.lock {
            background: rgba(239, 68, 68, 0.2);
            color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .lock-op-badge.card {
            background: rgba(245, 158, 11, 0.2);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .lock-op-badge.passcode {
            background: rgba(139, 92, 246, 0.2);
            color: #a78bfa;
            border: 1px solid rgba(139, 92, 246, 0.3);
        }
        .lock-op-time {
            font-size: 12px;
            color: var(--text-muted);
            direction: ltr;
            font-family: ui-monospace, Menlo, monospace;
        }
        .lock-op-body {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
        }
        .lock-op-who {
            font-weight: 600;
            color: white;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .lock-op-details {
            font-size: 12px;
            color: var(--text-muted);
            margin-top: 2px;
        }
        .filter-lock-btn {
            cursor: pointer;
            border: none;
            transition: all 0.2s ease;
        }

        /* Card Row Styles */
        .card-row { background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .card-meta { display: flex; flex-direction: column; gap: 3px; }
        .card-name { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 6px; }
        .card-details { font-size: 12px; color: var(--text-muted); }
        .card-actions { display: flex; gap: 6px; align-items: center; }
        .tag-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
        .btn-sm { padding: 8px 12px; font-size: 13px; border-radius: 8px; flex-direction: row; }

        /* Logs Console Styling */
        .logs-header-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; flex-wrap: wrap; }
        .logs-console {
            background: #050811;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 14px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 12px;
            line-height: 1.6;
            height: 380px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 4px;
            color: #cbd5e1;
            box-shadow: inset 0 2px 8px rgba(0,0,0,0.6);
        }
        .log-entry { display: flex; gap: 8px; align-items: flex-start; word-break: break-all; border-bottom: 1px solid rgba(255, 255, 255, 0.03); padding-bottom: 3px; }
        .log-time { color: #64748b; font-size: 11px; flex-shrink: 0; }
        .log-tag { font-weight: 700; font-size: 10px; padding: 1px 6px; border-radius: 4px; flex-shrink: 0; }
        .log-tag.info { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
        .log-tag.success { background: rgba(16, 185, 129, 0.15); color: #34d399; }
        .log-tag.warn { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
        .log-tag.error { background: rgba(239, 68, 68, 0.15); color: #f87171; }
        .log-msg { flex: 1; }
        .logs-auto-scroll { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .logs-auto-scroll input { flex: none; width: 16px; height: 16px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>ResortOS Gateway</h1>
            <div class="subtitle">בקר ESP32-S3 | משרד ראשי | ממשק שליטה אחוד</div>
            <div class="badge" id="net-badge">
                <span class="pulse-dot"></span>
                <span>USB Serial & BLE Coexistence</span>
            </div>
        </header>

        <!-- Top Navigation Bar -->
        <div class="tabs-nav">
            <button class="tab-btn active" data-tab="tab-lock" onclick="switchTab('tab-lock')">
                <span>🔐</span>
                <span>מנעול</span>
            </button>
            <button class="tab-btn" data-tab="tab-remote" onclick="switchTab('tab-remote')">
                <span>📡</span>
                <span>שלט</span>
            </button>
            <button class="tab-btn" data-tab="tab-lock-logs" onclick="switchTab('tab-lock-logs')">
                <span>🚪</span>
                <span>פעולות מנעול</span>
                <span class="log-badge" id="lock-actions-count" style="background: rgba(16, 185, 129, 0.25); color: #34d399;">0</span>
            </button>
            <button class="tab-btn" data-tab="tab-logs" onclick="switchTab('tab-logs')">
                <span>📜</span>
                <span>יומן כללי</span>
                <span class="log-badge" id="log-count">0</span>
            </button>
        </div>

        <!-- ============================================================ -->
        <!-- TAB 1: SMART LOCK & PHYSICAL IC CARDS                        -->
        <!-- ============================================================ -->
        <div id="tab-lock" class="tab-content active">
            <!-- Lock Control Section -->
            <div class="card">
                <div class="card-title">🔐 מנעול חכם (Mate - TTLock BLE)</div>
                <div class="btn-grid">
                    <button class="btn-unlock ctrl-btn" onclick="callApi('/api/unlock', 'POST')">
                        <span class="icon">🔓</span>
                        <span>פתח מנעול</span>
                    </button>
                    <button class="btn-lock ctrl-btn" onclick="callApi('/api/lock', 'POST')">
                        <span class="icon">🔒</span>
                        <span>נעל דלת</span>
                    </button>
                    <button class="btn-full ctrl-btn" style="background: #334155;" onclick="callApi('/api/status', 'GET')">
                        <span class="icon">📊</span>
                        <span>בדוק מצב מנעול וסוללה</span>
                    </button>
                </div>
            </div>

            <!-- Guest Passcode Section -->
            <div class="card">
                <div class="card-title">🔢 הוספת קוד כניסה לאורח (Passcode)</div>
                <div class="input-group">
                    <input type="number" id="passcode-input" placeholder="למשל 1234" maxlength="9">
                    <button class="ctrl-btn" style="padding: 12px 20px;" onclick="addPasscode()">
                        <span>שמור קוד</span>
                    </button>
                </div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
                    💡 הקוד נצרב ישירות לזיכרון ה-Offline של המנעול ויעבוד תמיד.
                </div>
            </div>

            <!-- Physical Key (IC Card / RFID) Management Section -->
            <div class="card">
                <div class="card-title">💳 ניהול מפתחות פיזיים (IC Cards / צ'יפים)</div>
                <div class="input-group">
                    <input type="text" id="card-name-input" placeholder="שם המפתח (למשל: מפתח חדרנית)">
                    <button class="ctrl-btn" style="padding: 12px 18px; background: #2563eb;" onclick="addNewCard()">
                        <span>➕ הוסף מפתח פיזי</span>
                    </button>
                </div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
                    💡 לחיצה תעביר את המנעול למצב קריאה בצפצוף — יש להצמיד את הצ'יפ למנעול.
                </div>

                <!-- Dynamic List of Configured Keys -->
                <div id="cards-container" style="margin-top: 16px;">
                    <div style="text-align:center; color: var(--text-muted); font-size: 13px; padding: 12px;">טוען מפתחות פיזיים...</div>
                </div>

                <!-- Quick Recent Lock Activity Widget in Tab 1 -->
                <div style="margin-top: 14px; background: rgba(15, 23, 42, 0.45); border: 1px dashed var(--border); border-radius: 14px; padding: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                            <span>🚪</span>
                            <span>פעולות מנעול אחרונות</span>
                        </div>
                        <button class="btn-sm" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 4px 10px; font-size: 11px;" onclick="switchTab('tab-lock-logs')">
                            <span>ליומן פעולות מנעול מלא ⬅️</span>
                        </button>
                    </div>
                    <div id="lock-quick-activity-list" style="font-size: 12px; color: var(--text-muted);">
                        טוען פעולות אחרונות...
                    </div>
                </div>
            </div>
        </div>

        <!-- ============================================================ -->
        <!-- TAB 2: REMOTE CONTROL (IR APPLIANCES)                        -->
        <!-- ============================================================ -->
        <div id="tab-remote" class="tab-content">
            <!-- TCL AC Climate Control Section -->
            <div class="card">
                <div class="card-title">❄️ מזגן TCL - משרד</div>
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.6); padding: 16px 20px; border-radius: 14px; border: 1px solid var(--border); margin-bottom: 12px;">
                    <div>
                        <div style="font-size: 13px; color: var(--text-muted);">טמפרטורת יעד (מצב קירור):</div>
                        <div style="font-size: 32px; font-weight: 800; color: #38bdf8; display: flex; align-items: baseline; gap: 4px;">
                            <span id="ac-temp-display">24</span><span>°C</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="ctrl-btn btn-sm" style="background: #0284c7; padding: 12px 18px; font-size: 18px;" onclick="adjustAc(-1)">➖</button>
                        <button class="ctrl-btn btn-sm" style="background: #0284c7; padding: 12px 18px; font-size: 18px;" onclick="adjustAc(1)">➕</button>
                    </div>
                </div>
                
                <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">בחירה מהירה:</div>
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 12px;">
                    <button class="ctrl-btn btn-sm" style="background: #1e293b; border: 1px solid rgba(255,255,255,0.1);" onclick="setAcTemp(18)">18°C</button>
                    <button class="ctrl-btn btn-sm" style="background: #1e293b; border: 1px solid rgba(255,255,255,0.1);" onclick="setAcTemp(20)">20°C</button>
                    <button class="ctrl-btn btn-sm" style="background: #1e293b; border: 1px solid rgba(255,255,255,0.1);" onclick="setAcTemp(22)">22°C</button>
                    <button class="ctrl-btn btn-sm" style="background: #1e293b; border: 1px solid rgba(255,255,255,0.1);" onclick="setAcTemp(24)">24°C</button>
                    <button class="ctrl-btn btn-sm" style="background: #1e293b; border: 1px solid rgba(255,255,255,0.1);" onclick="setAcTemp(26)">26°C</button>
                </div>

                <div style="margin-bottom: 12px;">
                    <button class="btn-full ctrl-btn" style="background: linear-gradient(135deg, #475569, #334155); border: 1px solid rgba(255,255,255,0.15);" onclick="sendAcOff()">
                        <span class="icon">⏹️</span>
                        <span>כיבוי מזגן (Power OFF)</span>
                    </button>
                </div>

                <div style="font-size: 12px; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(56, 189, 248, 0.2);">
                    💡 <b>משוב פיזי:</b> שידור נשלח מהעינית (IR). יש לוודא שמיעת צפצוף מהמזגן בחדר.
                </div>
            </div>

            <!-- Samsung TV Control Section -->
            <div class="card">
                <div class="card-title">📺 טלוויזיה Samsung - משרד</div>
                <button class="btn-full ctrl-btn" style="background: #7c3aed;" onclick="sendTvPower()">
                    <span class="icon">⏻</span>
                    <span>הפעלה / כיבוי טלוויזיה (Power)</span>
                </button>
            </div>

            <!-- IR Transmitter Diagnostics -->
            <div class="card">
                <div class="card-title">📡 בדיקת עינית אינפרא-אדום (IR Blaster - GPIO 4)</div>
                <div class="btn-grid" style="grid-template-columns: 1fr 1fr;">
                    <button class="ctrl-btn" style="background: #0284c7;" onclick="callApi('/api/ir/test', 'POST')">
                        <span class="icon">✨</span>
                        <span>הפעל הבהוב בדיקה</span>
                    </button>
                    <button class="ctrl-btn" style="background: #64748b;" onclick="callApi('/api/ir/off', 'POST')">
                        <span class="icon">⏹️</span>
                        <span>כבה עינית</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- ============================================================ -->
        <!-- TAB 3: DEDICATED LOCK ACCESS LOGS (WHO OPENED / LOCKED)       -->
        <!-- ============================================================ -->
        <div id="tab-lock-logs" class="tab-content">
            <div class="card">
                <div class="logs-header-actions">
                    <div>
                        <div class="card-title" style="margin-bottom: 2px;">🚪 יומן פעולות מנעול בלבד</div>
                        <div style="font-size: 12px; color: var(--text-muted);">
                            מעקב מדויק מול המנעול | עודכן: <b id="stat-sync-time" style="color:#38bdf8;">טרם סונכרן</b>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="ctrl-btn btn-sm" id="btn-sync-lock" style="background: #0284c7; padding: 7px 14px;" onclick="syncLockActivity()">
                            <span class="icon">🔄</span>
                            <span id="btn-sync-text">רענן וסנכרן מהמנעול</span>
                        </button>
                        <button class="ctrl-btn btn-sm" style="background: #dc2626; padding: 7px 12px;" onclick="clearLockActivity()">🗑️ נקה יומן</button>
                    </div>
                </div>

                <!-- KPI / Stats Summary Cards -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 12px 0 16px 0;">
                    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 12px; padding: 8px; text-align: center;">
                        <div style="font-size: 11px; color: var(--text-muted);">סה"כ פעולות</div>
                        <div id="stat-total-ops" style="font-size: 18px; font-weight: 800; color: #38bdf8; margin-top: 2px;">0</div>
                    </div>
                    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 12px; padding: 8px; text-align: center;">
                        <div style="font-size: 11px; color: var(--text-muted);">מצב מנעול</div>
                        <div id="stat-lock-state" style="font-size: 12px; font-weight: 700; color: #38bdf8; margin-top: 4px;">-</div>
                    </div>
                    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 12px; padding: 8px; text-align: center;">
                        <div style="font-size: 11px; color: var(--text-muted);">פתיחה אחרונה</div>
                        <div id="stat-last-unlock" style="font-size: 12px; font-weight: 700; color: #34d399; margin-top: 4px;">-</div>
                    </div>
                    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 12px; padding: 8px; text-align: center;">
                        <div style="font-size: 11px; color: var(--text-muted);">נעילה אחרונה</div>
                        <div id="stat-last-lock" style="font-size: 12px; font-weight: 700; color: #f87171; margin-top: 4px;">-</div>
                    </div>
                </div>

                <!-- Filters -->
                <div style="display: flex; gap: 6px; margin-bottom: 12px; align-items: center; overflow-x: auto;">
                    <button class="btn-sm filter-lock-btn active" data-filter="all" style="background: var(--primary); color: white; padding: 5px 12px; border-radius: 999px;" onclick="filterLockLogs('all')">הכל</button>
                    <button class="btn-sm filter-lock-btn" data-filter="unlock" style="background: rgba(15, 23, 42, 0.7); color: var(--text-muted); border: 1px solid var(--border); padding: 5px 12px; border-radius: 999px;" onclick="filterLockLogs('unlock')">🔓 פתיחות בלבד</button>
                    <button class="btn-sm filter-lock-btn" data-filter="lock" style="background: rgba(15, 23, 42, 0.7); color: var(--text-muted); border: 1px solid var(--border); padding: 5px 12px; border-radius: 999px;" onclick="filterLockLogs('lock')">🔒 נעילות בלבד</button>
                </div>

                <!-- Lock Activity List Container -->
                <div id="lock-activity-container" style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="text-align: center; color: var(--text-muted); padding: 20px;">טוען היסטוריית פעולות מנעול...</div>
                </div>
            </div>
        </div>

        <!-- ============================================================ -->
        <!-- TAB 4: SYSTEM & HARDWARE LOGS                                -->
        <!-- ============================================================ -->
        <div id="tab-logs" class="tab-content">
            <div class="card">
                <div class="logs-header-actions">
                    <div class="card-title" style="margin-bottom: 0;">📜 יומן פעולות מערכת ואירועי חומרה</div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <label class="logs-auto-scroll">
                            <input type="checkbox" id="auto-scroll-check" checked onchange="toggleAutoScroll(this.checked)">
                            <span>גלילה אוטומטית</span>
                        </label>
                        <button class="ctrl-btn btn-sm" style="background: #334155; padding: 6px 12px;" onclick="fetchLogs()">🔄 רענן</button>
                        <button class="ctrl-btn btn-sm" style="background: #dc2626; padding: 6px 12px;" onclick="clearLogs()">🗑️ נקה</button>
                    </div>
                </div>
                <div class="logs-console" id="logs-container">
                    <div style="color: #64748b; text-align: center; padding: 20px;">טוען יומן לוגים...</div>
                </div>
            </div>
        </div>

        <div id="status-box">מוכן לפקודה...</div>
    </div>

    <script>
        let countdownTimer = null;
        let currentAcTemp = 24;
        let autoScrollLogs = true;

        function setButtonsDisabled(disabled) {
            document.querySelectorAll('.ctrl-btn, .btn-sm').forEach(btn => {
                btn.disabled = disabled;
            });
        }

        // Tab Switching Logic
        function switchTab(tabId) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            const targetBtn = document.querySelector(`[data-tab="${tabId}"]`);
            if (targetBtn) targetBtn.classList.add('active');
            
            const targetContent = document.getElementById(tabId);
            if (targetContent) targetContent.classList.add('active');

            if (tabId === 'tab-logs') {
                fetchLogs();
            } else if (tabId === 'tab-lock-logs') {
                fetchLockActivity();
            }
        }

        function toggleAutoScroll(enabled) {
            autoScrollLogs = enabled;
        }

        // Appliance Controls
        async function setAcTemp(temp) {
            currentAcTemp = Math.min(30, Math.max(16, temp));
            document.getElementById('ac-temp-display').innerText = currentAcTemp;
            setButtonsDisabled(true);
            const sb = document.getElementById('status-box');
            sb.innerHTML = `<span class="spinner"></span> <b>משדר פקודה למזגן TCL: קירור (Cool) ${currentAcTemp}°C...</b>`;
            try {
                const res = await fetch('/api/ir/ac', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ temp: currentAcTemp })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    sb.innerHTML = `<b style="color:#10b981;">❄️ פקודת קירור נשלחה מהעינית (IR) למזגן TCL (${currentAcTemp}°C)!</b><div style="font-size:12px; color:#94a3b8; margin-top:4px;">${data.note || 'יש לוודא שמיעת צפצוף מהמזגן בחדר.'}</div>`;
                } else {
                    sb.innerHTML = `<span style="color:#ef4444;">❌ שידור נכשל: ${data.message || 'שגיאה'}</span>`;
                }
            } catch (e) {
                sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאה: ${e}</span>`;
            } finally {
                setButtonsDisabled(false);
                fetchLogs();
            }
        }

        async function adjustAc(delta) {
            await setAcTemp(currentAcTemp + delta);
        }

        async function sendAcOff() {
            setButtonsDisabled(true);
            const sb = document.getElementById('status-box');
            sb.innerHTML = `<span class="spinner"></span> <b>משדר פקודת כיבוי (Power OFF) למזגן TCL...</b>`;
            try {
                const res = await fetch('/api/ir/ac/off', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                const data = await res.json();
                if (data.status === 'success') {
                    sb.innerHTML = `<b style="color:#10b981;">⏹️ פקודת כיבוי נשלחה מהעינית (IR) למזגן TCL!</b><div style="font-size:12px; color:#94a3b8; margin-top:4px;">${data.note || 'יש לוודא שמיעת צפצוף כיבוי מהמזגן בחדר.'}</div>`;
                } else {
                    sb.innerHTML = `<span style="color:#ef4444;">❌ שידור כיבוי נכשל: ${data.message || 'שגיאה'}</span>`;
                }
            } catch (e) {
                sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאה: ${e}</span>`;
            } finally {
                setButtonsDisabled(false);
                fetchLogs();
            }
        }

        async function sendTvPower() {
            setButtonsDisabled(true);
            const sb = document.getElementById('status-box');
            sb.innerHTML = `<span class="spinner"></span> <b>משדר פקודת Power לטלוויזיה Samsung...</b>`;
            try {
                const res = await fetch('/api/ir/tv', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                const data = await res.json();
                if (data.status === 'success') {
                    sb.innerHTML = `<b style="color:#10b981;">📺 פקודת Power נשלחה בהצלחה לטלוויזיה Samsung!</b>`;
                } else {
                    sb.innerHTML = `<span style="color:#ef4444;">❌ שידור נכשל</span>`;
                }
            } catch (e) {
                sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאה: ${e}</span>`;
            } finally {
                setButtonsDisabled(false);
                fetchLogs();
            }
        }

        // Generic API Calls
        async function callApi(url, method = 'POST', body = null) {
            setButtonsDisabled(true);
            const sb = document.getElementById('status-box');
            let timeLeft = 25;
            
            sb.innerHTML = `<div><span class="spinner"></span> <b>משדר פקודה וממתין למנעול...</b></div>
                <div class="countdown" id="timer-text">מחפש שידור BLE (עד ${timeLeft} שנ'). אם המנעול ישן, <b>גע פעם אחת במקשים שלו</b> להשכמה מיידית!</div>`;

            if (countdownTimer) clearInterval(countdownTimer);
            countdownTimer = setInterval(() => {
                timeLeft--;
                const tt = document.getElementById('timer-text');
                if (tt && timeLeft > 0) {
                    tt.innerHTML = `מחפש שידור BLE (${timeLeft} שנ'). אם המנעול ישן, <b>גע פעם אחת במקשים שלו</b> להשכמה מיידית!`;
                }
            }, 1000);

            try {
                const options = { method: method };
                if (body) {
                    options.headers = { 'Content-Type': 'application/json' };
                    options.body = JSON.stringify(body);
                }
                const res = await fetch(url, options);
                clearInterval(countdownTimer);
                const data = await res.json();
                
                if (data.status === 'success') {
                    let msg = '<b style="color:#10b981;">✅ הפעולה בוצעה בהצלחה!</b><br>';
                    if (data.action === 'unlock') msg += '🔓 הדלת נפתחה!';
                    if (data.action === 'lock') msg += '🔒 הדלת ננעלה!';
                    if (data.action === 'add_passcode') msg += `🔢 הקוד נשמר בהצלחה במנעול!`;
                    if (data.action === 'status') msg += `בקר: <b>${data.gateway === 'online' ? 'מחובר (Online)' : data.gateway}</b> | תקשורת: <b>USB Serial ישיר</b>`;
                    if (data.action === 'ir_test') msg += `✨ הבהוב בדיקה לעינית הופעל`;
                    if (data.action === 'ir_off') msg += `⏹️ העינית כובתה`;
                    sb.innerHTML = msg;
                } else {
                    let errMsg = data.message || 'המנעול לא הגיב';
                    if (errMsg.includes('wake the lock')) {
                        errMsg = 'המנעול ישן ולא זוהה בזמן. אנא גע במקשים ונסה שוב מיד!';
                    }
                    sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאה: ${errMsg}</span>`;
                }
            } catch (e) {
                if (countdownTimer) clearInterval(countdownTimer);
                sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאת רשת: ${e}</span>`;
            } finally {
                setButtonsDisabled(false);
                fetchLogs();
                fetchLockActivity();
            }
        }

        async function addPasscode() {
            const input = document.getElementById('passcode-input');
            const code = input.value.trim();
            if (!code || code.length < 4 || code.length > 9 || isNaN(code)) {
                alert('אנא הזן קוד ספרות בלבד באורך של 4 עד 9 ספרות');
                return;
            }
            await callApi('/api/passcode', 'POST', { code: code });
            input.value = '';
            fetchLockActivity();
        }

        // ============================================================
        // Dedicated Lock Access Activity Functions
        // ============================================================
        let allLockLogs = [];
        let currentLockFilter = 'all';

        async function fetchLockActivity() {
            try {
                const res = await fetch('/api/lock/logs');
                const data = await res.json();
                if (data.status === 'success' && Array.isArray(data.logs)) {
                    allLockLogs = data.logs;
                    renderLockActivity();
                }
            } catch (e) {
                console.error('Lock activity fetch error:', e);
            }
        }

        async function syncLockActivity() {
            const btn = document.getElementById('btn-sync-lock');
            const text = document.getElementById('btn-sync-text');
            if (btn) btn.disabled = true;
            if (text) text.innerHTML = '<span class="spinner"></span> מסנכרן...';
            const sb = document.getElementById('status-box');
            if (sb) sb.innerHTML = '<span class="spinner"></span> <b>מתחבר למנעול ב-Bluetooth ומסנכרן פעולות ומצב...</b> <div style="font-size:12px; color:#f59e0b; margin-top:4px;">מחפש שידור BLE. אם המנעול ישן, <b>גע פעם אחת במקשים שלו</b> להשכמה מיידית!</div>';

            try {
                const res = await fetch('/api/lock/sync', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    allLockLogs = data.logs || [];
                    renderLockActivity();

                    const timeNow = new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                    const syncText = document.getElementById('stat-sync-time');
                    if (syncText) syncText.innerText = timeNow;

                    const stateEl = document.getElementById('stat-lock-state');
                    if (stateEl) {
                        const stText = data.lock_state === 'locked' ? '🔒 נעול' : (data.lock_state === 'unlocked' ? '🔓 פתוח' : 'לא ידוע');
                        const batText = (data.battery >= 0) ? `(${data.battery}%)` : '';
                        stateEl.innerHTML = `${stText} <span style="font-size:11px; color:#94a3b8;">${batText}</span>`;
                    }

                    if (sb) {
                        const st = data.lock_state === 'locked' ? '🔒 נעול' : (data.lock_state === 'unlocked' ? '🔓 פתוח' : '');
                        sb.innerHTML = `<b style="color:#10b981;">✅ סונכרן בהצלחה מול המנעול!</b> מצב: <b>${st}</b> | סוללה: <b>${data.battery}%</b> | סה"כ פעולות: <b>${allLockLogs.length}</b> (עודכן ב-${timeNow})`;
                    }
                } else {
                    if (sb) sb.innerHTML = `<span style="color:#ef4444;">❌ סנכרון מול המנעול נכשל: ${data.message || 'המנעול לא הגיב'}</span>`;
                    await fetchLockActivity();
                }
            } catch (e) {
                if (sb) sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאת תקשורת: ${e}</span>`;
                await fetchLockActivity();
            } finally {
                if (btn) btn.disabled = false;
                if (text) text.innerText = 'רענן וסנכרן מהמנעול';
            }
        }

        function filterLockLogs(filterType) {
            currentLockFilter = filterType;
            document.querySelectorAll('.filter-lock-btn').forEach(btn => {
                const isActive = (btn.dataset.filter === filterType);
                btn.classList.toggle('active', isActive);
                if (isActive) {
                    btn.style.background = 'var(--primary)';
                    btn.style.color = 'white';
                } else {
                    btn.style.background = 'rgba(15, 23, 42, 0.7)';
                    btn.style.color = 'var(--text-muted)';
                }
            });
            renderLockActivity();
        }

        function renderLockActivity() {
            const countBadge = document.getElementById('lock-actions-count');
            if (countBadge) countBadge.innerText = allLockLogs.length;

            const totalOps = document.getElementById('stat-total-ops');
            if (totalOps) totalOps.innerText = allLockLogs.length;

            const lastUnlock = allLockLogs.find(l => l.action === 'unlock' && l.status === 'success');
            const statLastUnlock = document.getElementById('stat-last-unlock');
            if (statLastUnlock) {
                statLastUnlock.innerHTML = lastUnlock 
                    ? `<div>${lastUnlock.time}</div><div style="font-size:10px; font-weight:normal; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(lastUnlock.operator)}</div>` 
                    : '-';
            }

            const lastLock = allLockLogs.find(l => l.action === 'lock' && l.status === 'success');
            const statLastLock = document.getElementById('stat-last-lock');
            if (statLastLock) {
                statLastLock.innerHTML = lastLock 
                    ? `<div>${lastLock.time}</div><div style="font-size:10px; font-weight:normal; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(lastLock.operator)}</div>` 
                    : '-';
            }

            // Quick widget in Tab 1
            const quickList = document.getElementById('lock-quick-activity-list');
            if (quickList) {
                const top3 = allLockLogs.slice(0, 3);
                if (top3.length === 0) {
                    quickList.innerHTML = 'אין פעולות מנעול רשומות עדיין.';
                } else {
                    quickList.innerHTML = top3.map(l => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <span style="display: flex; align-items: center; gap: 6px;">
                                <span>${l.action === 'unlock' ? '🔓' : (l.action === 'lock' ? '🔒' : (l.action === 'passcode' ? '🔢' : '💳'))}</span>
                                <b>${escapeHtml(l.action_label || l.action)}</b>: <span style="color: #cbd5e1;">${escapeHtml(l.operator || 'לא ידוע')}</span>
                            </span>
                            <span style="font-size: 11px; color: var(--text-muted); font-family: ui-monospace, monospace; direction: ltr;">${l.date} ${l.time}</span>
                        </div>
                    `).join('');
                }
            }

            // Tab 3 List Container
            const container = document.getElementById('lock-activity-container');
            if (!container) return;

            let filtered = allLockLogs;
            if (currentLockFilter === 'unlock') {
                filtered = allLockLogs.filter(l => l.action === 'unlock');
            } else if (currentLockFilter === 'lock') {
                filtered = allLockLogs.filter(l => l.action === 'lock');
            }

            if (filtered.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 24px; font-size: 13px;">אין פעולות להצגה בקטגוריה זו</div>';
                return;
            }

            container.innerHTML = filtered.map(item => {
                let badgeClass = 'unlock';
                let badgeIcon = '🔓';
                if (item.action === 'lock') {
                    badgeClass = 'lock';
                    badgeIcon = '🔒';
                } else if (item.action === 'passcode') {
                    badgeClass = 'passcode';
                    badgeIcon = '🔢';
                } else if (item.action === 'card_add' || item.action === 'card_delete') {
                    badgeClass = 'card';
                    badgeIcon = '💳';
                }

                const isSuccess = (item.status === 'success');
                const statusBadge = isSuccess 
                    ? '<span style="color:#34d399; font-size:11px; font-weight:700;">✅ הצלחה</span>'
                    : '<span style="color:#f87171; font-size:11px; font-weight:700;">❌ שגיאה</span>';

                return `
                    <div class="lock-op-row">
                        <div class="lock-op-top">
                            <span class="lock-op-badge ${badgeClass}">
                                <span>${badgeIcon}</span>
                                <span>${escapeHtml(item.action_label || item.action)}</span>
                            </span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${statusBadge}
                                <span class="lock-op-time">📅 ${item.date} | ⏰ ${item.time}</span>
                            </div>
                        </div>
                        <div class="lock-op-body">
                            <div class="lock-op-who">
                                <span style="color:var(--text-muted); font-size:12px; font-weight:normal;">מי ביצע:</span>
                                <span>${escapeHtml(item.operator || 'לא ידוע')}</span>
                            </div>
                            <div style="font-size:11px; color:#38bdf8; background:rgba(56,189,248,0.12); padding:2px 8px; border-radius:6px; font-weight:600;">
                                ${escapeHtml(item.method || 'Bluetooth LE')}
                            </div>
                        </div>
                        ${item.details ? `<div class="lock-op-details">📝 ${escapeHtml(item.details)}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        async function clearLockActivity() {
            if (!confirm('האם אתה בטוח שברצונך לאפס ולמחוק את כל היסטוריית פעולות המנעול?')) return;
            try {
                const res = await fetch('/api/lock/logs/clear', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    allLockLogs = [];
                    renderLockActivity();
                }
            } catch (e) {
                alert('שגיאה באיפוס יומן: ' + e);
            }
        }

        // Logs Functions
        async function fetchLogs() {
            try {
                const res = await fetch('/api/logs');
                const data = await res.json();
                if (data.status === 'success' && data.logs) {
                    renderLogs(data.logs);
                }
            } catch (e) {
                console.error('Logs fetch error', e);
            }
        }

        function renderLogs(logs) {
            const container = document.getElementById('logs-container');
            const badge = document.getElementById('log-count');
            if (badge) badge.innerText = logs.length;
            if (!container) return;

            if (logs.length === 0) {
                container.innerHTML = '<div style="color: #64748b; text-align: center; padding: 20px;">אין לוגים עדיין...</div>';
                return;
            }

            const html = logs.map(l => {
                let lvl = l.level || 'info';
                let tagText = lvl.toUpperCase();
                return `<div class="log-entry">
                    <span class="log-time">[${l.time}]</span>
                    <span class="log-tag ${lvl}">${tagText}</span>
                    <span class="log-msg">${escapeHtml(l.message)}</span>
                </div>`;
            }).join('');

            container.innerHTML = html;

            if (autoScrollLogs) {
                container.scrollTop = container.scrollHeight;
            }
        }

        function escapeHtml(str) {
            return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        async function clearLogs() {
            try {
                const res = await fetch('/api/logs/clear', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    renderLogs(data.logs);
                }
            } catch (e) {
                console.error(e);
            }
        }

        // Physical IC Cards Management
        async function loadCards() {
            const container = document.getElementById('cards-container');
            try {
                const res = await fetch('/api/cards');
                const cards = await res.json();
                if (!Array.isArray(cards) || cards.length === 0) {
                    container.innerHTML = '<div style="text-align:center; color: var(--text-muted); font-size: 13px; padding: 12px;">אין מפתחות פיזיים מוגדרים עדיין</div>';
                    return;
                }
                container.innerHTML = cards.map(c => `
                    <div class="card-row">
                        <div class="card-meta">
                            <div class="card-name">
                                <span>🔑</span>
                                <span>${escapeHtml(c.name || 'מפתח ללא שם')}</span>
                                <span class="tag-badge" style="background: ${c.active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${c.active ? '#34d399' : '#f87171'};">
                                    ${c.active ? 'פעיל' : 'מושבת'}
                                </span>
                            </div>
                            <div class="card-details">מזהה כרטיס: <b>${c.cardId}</b> | נוסף: ${c.addedAt || 'לא ידוע'}</div>
                        </div>
                        <div class="card-actions">
                            <button class="btn-sm" style="background: #334155;" onclick="renameCard('${c.cardId}', '${escapeHtml(c.name)}')">✏️ ערוך</button>
                            <button class="btn-sm" style="background: #ef4444;" onclick="deleteCard('${c.cardId}')">🗑️ מחק</button>
                        </div>
                    </div>
                `).join('');
            } catch (e) {
                container.innerHTML = `<div style="text-align:center; color: #ef4444; font-size: 13px; padding: 12px;">שגיאה בטעינת מפתחות: ${e}</div>`;
            }
        }

        async function addNewCard() {
            const input = document.getElementById('card-name-input');
            const name = input.value.trim() || 'מפתח חדש';
            setButtonsDisabled(true);
            const sb = document.getElementById('status-box');
            sb.innerHTML = `<div><span class="spinner"></span> <b>מעביר מנעול למצב קריאה...</b></div>
                <div class="countdown">המנעול יצפצף – <b>העבר את הצ'יפ על המנעול עכשיו!</b> (זמן קריאה: עד 20 שניות)</div>`;
            try {
                const res = await fetch('/api/cards/add', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name: name })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    sb.innerHTML = `<b style="color:#10b981;">🎉 מפתח חדש נקרא ונשמר בהצלחה!</b><br>שם: <b>${escapeHtml(data.card?.name || name)}</b> | מזהה: <b>${data.card?.cardId}</b>`;
                    input.value = '';
                    await loadCards();
                } else {
                    sb.innerHTML = `<span style="color:#ef4444;">❌ לא נקרא מפתח: ${data.message || 'פסק זמן'}</span>`;
                }
            } catch (e) {
                sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאה: ${e}</span>`;
            } finally {
                setButtonsDisabled(false);
                fetchLogs();
                fetchLockActivity();
            }
        }

        async function renameCard(cardId, currentName) {
            const newName = prompt('הזן שם מעודכן למפתח:', currentName);
            if (!newName || newName.trim() === currentName) return;
            setButtonsDisabled(true);
            const sb = document.getElementById('status-box');
            sb.innerHTML = `<span class="spinner"></span> מעדכן שם מפתח...`;
            try {
                const res = await fetch('/api/cards/update', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ cardId: cardId, name: newName.trim() })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    sb.innerHTML = `<b style="color:#10b981;">✅ שם המפתח עודכן בהצלחה!</b>`;
                    await loadCards();
                } else {
                    sb.innerHTML = `<span style="color:#ef4444;">❌ עדכון שם נכשל</span>`;
                }
            } catch (e) {
                sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאה: ${e}</span>`;
            } finally {
                setButtonsDisabled(false);
                fetchLogs();
            }
        }

        async function deleteCard(cardId) {
            if (!confirm(`האם אתה בטוח שברצונך למחוק ולבטל את מפתח ${cardId}?`)) return;
            setButtonsDisabled(true);
            const sb = document.getElementById('status-box');
            sb.innerHTML = `<span class="spinner"></span> מוחק ומבטל מפתח במנעול...`;
            try {
                const res = await fetch('/api/cards/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ cardId: cardId })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    sb.innerHTML = `<b style="color:#10b981;">🗑️ המפתח נמחק בהצלחה!</b>`;
                    await loadCards();
                } else {
                    sb.innerHTML = `<span style="color:#ef4444;">❌ מחיקה נכשלה</span>`;
                }
            } catch (e) {
                sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאה: ${e}</span>`;
            } finally {
                setButtonsDisabled(false);
                fetchLogs();
                fetchLockActivity();
            }
        }

        // Init
        loadCards();
        fetchLogs();
        fetchLockActivity();

        // Background log refresh every 2.5 seconds
        setInterval(() => {
            fetchLogs();
            fetchLockActivity();
        }, 2500);
    </script>
</body>
</html>
"""

# ============================================================================
# ESP32 Direct USB Serial Client
# ============================================================================
class ESP32SerialClient:
    def __init__(self):
        self.ser = None
        self.lock = threading.Lock()
        self.port = None
        self.running = True
        self.bg_thread = threading.Thread(target=self._bg_read_loop, daemon=True)
        self.bg_thread.start()

    def _find_port(self):
        # Auto-discover USB CDC / Serial on macOS and Linux
        ports = (
            glob.glob('/dev/cu.usbmodem*') +
            glob.glob('/dev/cu.usbserial*') +
            glob.glob('/dev/ttyACM*') +
            glob.glob('/dev/ttyUSB*')
        )
        return ports[0] if ports else None

    def _ensure_connected(self):
        port = self._find_port()
        if not port:
            if self.ser:
                try: self.ser.close()
                except Exception: pass
            self.ser = None
            return False

        if self.ser and self.ser.is_open and self.port == port:
            return True

        try:
            if self.ser:
                try: self.ser.close()
                except Exception: pass
            self.ser = serial.Serial(port, 115200, timeout=0.1)
            time.sleep(0.5)
            self.ser.reset_input_buffer()
            self.port = port
            print(f"[+] Connected to ESP32 over USB Serial ({port})", flush=True)
            log_event("success", f"חיבור טורי ישיר ל-ESP32 הוקם בהצלחה ({port})")
            return True
        except Exception as e:
            print(f"[!] Serial open error on {port}: {e}", flush=True)
            log_event("error", f"שגיאה בפתיחת יציאת ה-USB הטורית {port}: {e}")
            self.ser = None
            return False

    def _bg_read_loop(self):
        """Continuously reads asynchronous incoming lines from the ESP32 when idle."""
        while self.running:
            try:
                line = None
                with self.lock:
                    if self.ser and self.ser.is_open and self.ser.in_waiting > 0:
                        line = self.ser.readline().decode("utf-8", errors="replace").strip()
                if line:
                    self._process_line(line, prefix="[ESP32 Async]")
                else:
                    time.sleep(0.05)
            except Exception:
                time.sleep(0.2)

    def _process_line(self, line, prefix="[ESP32]"):
        if not line: return
        print(f"{prefix} {line}", flush=True)
        lvl = "info"
        lower = line.lower()
        if any(k in lower for k in ["success", "unlocked", "locked", "learned", "connected", "ready", "validated", "captured", "🎉"]):
            lvl = "success"
        elif any(k in lower for k in ["error", "fail", "rejected"]):
            lvl = "error"
        elif any(k in lower for k in ["timed out", "warn", "sleeping"]):
            lvl = "warn"
        log_event(lvl, f"[ESP32] {line}")

    def send_command(self, cmd_dict, timeout=30):
        with self.lock:
            if not self._ensure_connected():
                log_event("error", "בקר ה-ESP32 אינו מחובר ב-USB")
                return {"status": "error", "message": "בקר ה-ESP32 אינו מחובר ב-USB"}

            try:
                self.ser.reset_input_buffer()
                cmd_str = json.dumps(cmd_dict) + "\n"
                log_dict = dict(cmd_dict)
                if "code" in log_dict:
                    log_dict["code"] = "••••"
                log_event("info", f"[TX -> ESP32] {json.dumps(log_dict, ensure_ascii=False)}")
                self.ser.write(cmd_str.encode("utf-8"))
                self.ser.flush()

                start = time.time()
                while time.time() - start < timeout:
                    line = self.ser.readline().decode("utf-8", errors="replace").strip()
                    if line:
                        self._process_line(line)
                        if line.startswith("{") and line.endswith("}"):
                            try:
                                data = json.loads(line)
                                if "status" in data:
                                    if data.get("status") in ["success", "error"]:
                                        return data
                            except Exception:
                                pass
                    time.sleep(0.02)
                log_event("warn", "פסק זמן לתקשורת מול בקר ה-ESP32")
                return {"status": "error", "message": "פסק זמן לתקשורת מול בקר ה-ESP32"}
            except Exception as e:
                print(f"[!] Serial I/O error: {e}", flush=True)
                log_event("error", f"שגיאת תקשורת טורית: {e}")
                try: self.ser.close()
                except Exception: pass
                self.ser = None
                return {"status": "error", "message": f"שגיאת תקשורת טורית: {e}"}

esp32 = ESP32SerialClient()

class GatewayHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        try:
            msg = format % args
            print(f"[{self.client_address[0]}] {msg}", flush=True)
        except Exception:
            pass

    def handle_lock_sync(self):
        log_event("info", "[API] סנכרון נתוני מנעול ויומן פעולות חי דרך BLE...")
        res = esp32.send_command({"cmd": "sync_lock_logs"}, timeout=35)
        if res.get("status") != "success":
            err_msg = res.get("message", "המנעול לא הגיב לסנכרון")
            log_event("error", f"[סנכרון מנעול] נכשל: {err_msg}")
            existing = load_lock_activity()
            self.send_json(200, {
                "status": "error",
                "message": err_msg,
                "logs": existing,
                "battery": -1,
                "lock_state": "unknown"
            })
            return

        battery = res.get("battery", 100)
        lock_state = res.get("lock_state", "unknown")
        raw_records = res.get("records", [])

        cards_map = load_cards_map()
        existing_logs = load_lock_activity()
        existing_ids = {item.get("id") for item in existing_logs if "id" in item}
        existing_keys = {(item.get("timestamp"), item.get("action"), item.get("operator")) for item in existing_logs}

        new_entries = []
        for r in raw_records:
            rec_type = r.get("record_type", 0)
            date_str = r.get("date", "")
            time_str = r.get("time", "")
            ts_str = r.get("timestamp", f"{date_str} {time_str}")

            card_id = r.get("card_id")
            passcode = r.get("passcode")
            rec_battery = r.get("battery", battery)

            action = "unlock"
            action_label = "פתיחת דלת"
            status = "success"
            method = "Bluetooth LE"
            operator = "משתמש מנעול"
            details = f"פעולה מאומתת (סוללה: {rec_battery}%)"

            if rec_type in [1, 3, 28]:
                action = "unlock"
                action_label = "פתיחה (אפליקציה)"
                operator = "אפליקציה / בקר BLE"
                method = "Bluetooth LE"
                details = f"פתיחה מאומתת (סוללה: {rec_battery}%)"
            elif rec_type in [4, 92]:
                action = "unlock"
                action_label = "פתיחה בקוד"
                operator = f"קוד גישה ({passcode})" if passcode else "קוד מקלדת"
                method = f"מקלדת ({passcode})" if passcode else "מקלדת"
                details = f"הקשת קוד תקין במקלדת (סוללה: {rec_battery}%)"
            elif rec_type == 17:
                action = "unlock"
                action_label = "פתיחה בכרטיס"
                card_name = cards_map.get(str(card_id), f"כרטיס פיזי {card_id}") if card_id else "כרטיס פיזי"
                operator = f"כרטיס: {card_name}"
                method = f"RFID ({card_id})" if card_id else "RFID"
                details = f"הצגת כרטיס מורשה על פנל המנעול (סוללה: {rec_battery}%)"
            elif rec_type == 20:
                action = "unlock"
                action_label = "פתיחה בטביעת אצבע"
                operator = "טביעת אצבע מאומתת"
                method = "חיישן ביומטרי"
                details = f"אימות טביעת אצבע מוצלח (סוללה: {rec_battery}%)"
            elif rec_type == 21:
                action = "card_add"
                action_label = "הוספת טביעת אצבע"
                operator = "טביעת אצבע חדשה"
                method = "חיישן ביומטרי"
                details = "נלמדה טביעת אצבע חדשה במנעול"
            elif rec_type == 15:
                action = "card_add"
                action_label = "הוספת מפתח פיזי"
                card_name = cards_map.get(str(card_id), f"כרטיס {card_id}") if card_id else "כרטיס פיזי"
                operator = f"כרטיס: {card_name}"
                method = f"RFID ({card_id})" if card_id else "RFID"
                details = f"נלמד מפתח פיזי חדש במנעול (סוללה: {rec_battery}%)"
            elif rec_type == 18:
                action = "card_delete"
                action_label = "מחיקת מפתח פיזי"
                operator = f"כרטיס: {card_id}" if card_id else "כרטיס פיזי"
                method = f"RFID ({card_id})" if card_id else "RFID"
                details = "בוטל ונמחק מפתח פיזי במנעול"
            elif rec_type in [26, 30, 33, 34, 35, 36, 69]:
                action = "lock"
                action_label = "נעילת דלת"
                operator = "נעילה אוטומטית / מקשים"
                method = "בריח מנעול"
                details = f"נעילת דלת מאומתת (סוללה: {rec_battery}%)"
            elif rec_type in [7, 22, 25, 38, 39, 40, 41, 51, 91]:
                action = "unlock"
                action_label = "ניסיון פתיחה שגוי"
                operator = "קוד / כרטיס שגוי"
                status = "error"
                method = "מקלדת / RFID"
                details = "ניסיון גישה שגוי נדחה על ידי המנעול"
            elif rec_type == 93:
                action = "passcode"
                action_label = "הוספת קוד גישה"
                operator = f"קוד ({passcode})" if passcode else "קוד חדש"
                method = "מקלדת"
                details = "הוגדר קוד גישה חדש במנעול"

            entry_id = f"lock-{ts_str.replace(' ', '-').replace(':', '')}-{card_id or passcode or rec_type}"
            key_tuple = (ts_str, action, operator)

            if entry_id not in existing_ids and key_tuple not in existing_keys:
                entry = {
                    "id": entry_id,
                    "timestamp": ts_str,
                    "date": date_str,
                    "time": time_str,
                    "action": action,
                    "action_label": action_label,
                    "operator": operator,
                    "method": method,
                    "status": status,
                    "status_label": "הצלחה" if status == "success" else "שגיאה",
                    "details": details
                }
                new_entries.append(entry)
                existing_ids.add(entry_id)
                existing_keys.add(key_tuple)

        all_logs = new_entries + existing_logs
        try:
            all_logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        except Exception:
            pass

        if len(all_logs) > 300:
            all_logs = all_logs[:300]

        save_lock_activity(all_logs)
        log_event("success", f"[סנכרון מנעול] הושלם בהצלחה! מצב: {lock_state}, סוללה: {battery}%, סונכרנו {len(new_entries)} פעולות חדשות מהמנעול.")

        self.send_json(200, {
            "status": "success",
            "battery": battery,
            "lock_state": lock_state,
            "new_records": len(new_entries),
            "logs": all_logs
        })

    def do_HEAD(self):
        self.do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/" or path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_DASHBOARD.encode("utf-8"))
            return

        if path == "/api/logs":
            with logs_lock:
                self.send_json(200, {"status": "success", "logs": list(SYSTEM_LOGS)})
            return

        if path == "/api/lock/logs":
            records = load_lock_activity()
            self.send_json(200, {"status": "success", "logs": records})
            return

        if path == "/api/lock/sync":
            self.handle_lock_sync()
            return

        if path == "/api/cards":
            res = esp32.send_command({"cmd": "get_cards"}, timeout=5)
            if res.get("status") == "success":
                self.send_json(200, res.get("cards", []))
            else:
                self.send_json(500, res)
            return

        if path in ["/api/unlock", "/api/lock", "/api/passcode", "/api/ir/ac", "/api/ir/ac/off", "/api/ir/tv", "/api/ir/test", "/api/ir/off"]:
            self.send_json(405, {"status": "error", "message": "פעולות שליטה אינן מורשות ב-GET. יש להשתמש ב-POST מאומת דרך ResortOS."})
            return

        if path == "/api/status":
            res = esp32.send_command({"cmd": "status"}, timeout=3)
            self.send_json(200 if res.get("status") == "success" else 500, res)
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            req_data = json.loads(body.decode('utf-8')) if body else {}
        except Exception:
            req_data = {}

        if path == "/api/logs/clear":
            with logs_lock:
                SYSTEM_LOGS.clear()
                SYSTEM_LOGS.append({
                    "time": time.strftime("%H:%M:%S"),
                    "level": "info",
                    "message": "יומן הלוגים נוקה על ידי המשתמש."
                })
            self.send_json(200, {"status": "success", "logs": list(SYSTEM_LOGS)})
            return

        if path == "/api/status":
            res = esp32.send_command({"cmd": "status"}, timeout=3)
            self.send_json(200 if res.get("status") == "success" else 500, res)
            return

        if path == "/api/unlock":
            log_event("info", "[API] בקשת פתיחת מנעול (POST)...")
            res = esp32.send_command({"cmd": "unlock"}, timeout=25)
            is_ok = (res.get("status") == "success")
            record_lock_action(
                action="unlock",
                operator=req_data.get("operator", "מנהל (ממשק ResortOS)"),
                status="success" if is_ok else "error",
                method="Bluetooth LE (ESP32)",
                details="פתיחה מאומתת דרך ה-Gateway" if is_ok else res.get("message", "פקודת הפתיחה נדחתה")
            )
            self.send_json(200 if is_ok else 500, res)
            return

        if path == "/api/lock":
            log_event("info", "[API] בקשת נעילת מנעול (POST)...")
            res = esp32.send_command({"cmd": "lock"}, timeout=25)
            is_ok = (res.get("status") == "success")
            record_lock_action(
                action="lock",
                operator=req_data.get("operator", "מנהל (ממשק ResortOS)"),
                status="success" if is_ok else "error",
                method="Bluetooth LE (ESP32)",
                details="נעילת בריח יזומה דרך ה-Gateway" if is_ok else res.get("message", "פקודת הנעילה נדחתה")
            )
            self.send_json(200 if is_ok else 500, res)
            return

        if path == "/api/passcode":
            code = str(req_data.get("code", "")).strip()
            if not code or len(code) < 4 or len(code) > 9 or not code.isdigit():
                self.send_json(400, {"status": "error", "message": "Code must be 4 to 9 digits (JSON body: {\"code\":\"...\"})"})
                return
            log_event("info", "[API] צריבת קוד גישה חדש (••••) דרך ESP32 BLE...")
            res = esp32.send_command({"cmd": "add_passcode", "code": code}, timeout=25)
            is_ok = (res.get("status") == "success")
            record_lock_action(
                action="passcode",
                operator=req_data.get("operator", "מנהל (ממשק ResortOS)"),
                status="success" if is_ok else "error",
                method="קוד גישה (••••)",
                details="נצרב קוד קבוע חדש במנעול (קוד מאובטח)" if is_ok else res.get("message", "המנעול דחה את הקוד")
            )
            self.send_json(200 if is_ok else 500, res)
            return

        if path == "/api/ir/ac":
            temp_val = float(req_data.get("temp", 24.0))
            log_event("info", f"[API] שידור פקודת קירור (Cool) {temp_val}°C למזגן TCL...")
            res = esp32.send_command({"cmd": "ir_ac_temp", "temp": temp_val}, timeout=5)
            res["feedback"] = "ir_transmitted"
            res["note"] = "שידור נשלח מהעינית (IR). יש לוודא שמיעת צפצוף מהמזגן בחדר."
            self.send_json(200 if res.get("status") == "success" else 500, res)
            return

        if path == "/api/ir/ac/off":
            log_event("info", "[API] שידור פקודת כיבוי (Power OFF) למזגן TCL...")
            res = esp32.send_command({"cmd": "ir_ac_off"}, timeout=5)
            res["feedback"] = "ir_transmitted"
            res["note"] = "שידור כיבוי נשלח מהעינית (IR). יש לוודא שמיעת צפצוף כיבוי מהמזגן בחדר."
            self.send_json(200 if res.get("status") == "success" else 500, res)
            return

        if path == "/api/ir/tv":
            log_event("info", "[API] שידור פקודת Power לטלוויזיה Samsung...")
            res = esp32.send_command({"cmd": "ir_tv_power"}, timeout=5)
            res["feedback"] = "ir_transmitted"
            res["note"] = "שידור Power נשלח מהעינית לטלוויזיה."
            self.send_json(200 if res.get("status") == "success" else 500, res)
            return

        if path == "/api/ir/test":
            res = esp32.send_command({"cmd": "ir_test"}, timeout=5)
            self.send_json(200 if res.get("status") == "success" else 500, res)
            return

        if path == "/api/ir/off":
            res = esp32.send_command({"cmd": "ir_off"}, timeout=5)
            self.send_json(200 if res.get("status") == "success" else 500, res)
            return

        if path == "/api/lock/sync":
            self.handle_lock_sync()
            return

        if path == "/api/lock/logs/clear":
            save_lock_activity([])
            log_event("warn", "יומן פעולות המנעול נוקה על ידי המשתמש.")
            self.send_json(200, {"status": "success", "logs": []})
            return

        if path == "/api/lock/logs/add":
            entry = record_lock_action(
                action=req_data.get("action", "unlock"),
                operator=req_data.get("operator", "מנהל"),
                status=req_data.get("status", "success"),
                method=req_data.get("method", "Bluetooth LE"),
                details=req_data.get("details", "")
            )
            self.send_json(200, {"status": "success", "entry": entry})
            return

        if path == "/api/cards/add":
            name = req_data.get("name", "מפתח חדש")
            log_event("info", f"[API] הוספת מפתח פיזי חדש: '{name}' (מצב למידה)...")
            res = esp32.send_command({"cmd": "add_card", "name": name}, timeout=35)
            if res.get("status") == "success":
                card = res.get("card", {})
                record_lock_action(
                    action="card_add",
                    operator="מנהל (ממשק Web Gateway)",
                    status="success",
                    method=f"RFID ({card.get('cardId', '')})",
                    details=f"נלמד מפתח פיזי חדש: {card.get('name', name)}"
                )
            self.send_json(200 if res.get("status") == "success" else 408, res)
            return

        if path == "/api/cards/update":
            cmd = {"cmd": "update_card", "cardId": req_data.get("cardId")}
            if "name" in req_data: cmd["name"] = req_data["name"]
            if "active" in req_data: cmd["active"] = req_data["active"]
            log_event("info", f"[API] עדכון מפתח {req_data.get('cardId')}: {cmd}...")
            res = esp32.send_command(cmd, timeout=5)
            self.send_json(200 if res.get("status") == "success" else 500, res)
            return

        if path == "/api/cards/delete":
            card_id = req_data.get("cardId")
            log_event("warn", f"[API] מחיקת וביטול מפתח פיזי {card_id}...")
            res = esp32.send_command({"cmd": "delete_card", "cardId": card_id}, timeout=25)
            if res.get("status") == "success":
                record_lock_action(
                    action="card_delete",
                    operator="מנהל (ממשק Web Gateway)",
                    status="success",
                    method=f"RFID ({card_id})",
                    details=f"נמחק ובוטל מפתח פיזי {card_id}"
                )
            self.send_json(200 if res.get("status") == "success" else 500, res)
            return

        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
        self.do_POST()

    def do_DELETE(self):
        self.do_POST()

    def send_json(self, status, obj):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode("utf-8"))

def run_server(port=8888):
    server = HTTPServer(("127.0.0.1", port), GatewayHandler)
    print(f"ResortOS Gateway HTTP Server running on http://127.0.0.1:{port} (Localhost loopback only)", flush=True)
    server.serve_forever()

if __name__ == "__main__":
    run_server(8888)
