"""Local LAN control for Moes S16 Pro units defined in climateUnits.json.

Credentials come from environment variables named by each unit. This process
never prints those values.
"""

import json
import os
import sys
import time
from pathlib import Path

import tinytuya

ROOT = Path(__file__).resolve().parents[1]
UNITS_PATH = Path(__file__).with_name("climateUnits.json")
MODES = ("cold", "warm", "auto", "air", "dehumidify")
FANS = ("auto", "low", "middle", "high")
MODE_CODE = {"cold": 0, "warm": 1, "auto": 2, "air": 3, "dehumidify": 4}
FAN_CODE = {"auto": 0, "low": 1, "middle": 2, "high": 3}
MODE_FROM_CODE = {value: key for key, value in MODE_CODE.items()}
FAN_FROM_CODE = {value: key for key, value in FAN_CODE.items()}


def load_env_file():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
            continue
        key, val = trimmed.split("=", 1)
        val = val.strip()
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        os.environ.setdefault(key.strip(), val)


def load_units():
    data = json.loads(UNITS_PATH.read_text())
    return data.get("units") or []


def unit_by_id(unit_id):
    units = load_units()
    if not unit_id:
        return units[0] if units else None
    for unit in units:
        if unit.get("id") == unit_id:
            return unit
    return None


def hosts_for(unit):
    ordered = []
    host_env = unit.get("hostEnv")
    if host_env and os.environ.get(host_env):
        ordered.append(os.environ[host_env].strip())
    for host in unit.get("fallbackHosts") or []:
        if host not in ordered:
            ordered.append(host)
    return ordered


def connect(unit):
    device_id = os.environ.get(unit.get("deviceIdEnv") or "", "").strip()
    local_key = os.environ.get(unit.get("localKeyEnv") or "", "")
    if not device_id or not local_key:
        raise RuntimeError(f"Missing credentials for {unit.get('id')}")
    version = float(unit.get("version") or 3.3)
    last_error = "unreachable"
    for host in hosts_for(unit):
        device = tinytuya.Device(device_id, host, local_key, version=version)
        device.set_socketTimeout(2)
        device.set_socketRetryLimit(1)
        device.set_socketRetryDelay(0)
        try:
            status = device.status()
        except Exception:
            last_error = "network"
            continue
        if isinstance(status, dict) and isinstance(status.get("dps"), dict):
            return device, host, status
        last_error = str((status or {}).get("Err") or "status failed") if isinstance(status, dict) else "status failed"
    raise RuntimeError(last_error)


def public_state(unit, host, status):
    dps = status.get("dps") or {}
    raw_current = dps.get("2")
    library = dps.get("201")
    library_ready = False
    if isinstance(library, str) and "irlib_download" in library and "100" in library:
        library_ready = True
    return {
        "id": unit["id"],
        "name": unit.get("name"),
        "room": unit.get("room"),
        "productId": unit.get("productId"),
        "host": host,
        "online": True,
        "power": bool(dps.get("1")),
        "currentC": (raw_current / 10) if isinstance(raw_current, (int, float)) else None,
        "targetC": dps.get("3"),
        "mode": dps.get("4"),
        "fan": dps.get("5"),
        "humidity": dps.get("12"),
        "work": dps.get("16"),
        "libraryReady": library_ready,
        "modes": list(MODES),
        "fans": list(FANS),
        "tempMin": dps.get("10") or 16,
        "tempMax": dps.get("9") or 30,
    }


def desired_state(status, body):
    dps = (status or {}).get("dps") or {}
    power = bool(body["power"]) if "power" in body else bool(dps.get("1"))
    mode = str(body.get("mode") or dps.get("4") or "cold")
    fan = str(body.get("fan") or dps.get("5") or "low")
    if body.get("target") is not None:
        target = int(body["target"])
    else:
        target = dps.get("3")
    if mode not in MODES:
        raise RuntimeError("unknown mode")
    if fan not in FANS:
        raise RuntimeError("unknown fan")
    if target is None:
        raise RuntimeError("missing target")
    target = int(target)
    if target < 16 or target > 30:
        raise RuntimeError("target out of range")
    if not any(key in body for key in ("power", "target", "mode", "fan")):
        raise RuntimeError("empty command")
    return {"power": power, "mode": mode, "fan": fan, "target": target}


def apply_command(device, desired):
    device.set_multiple_values({
        "1": bool(desired["power"]),
        "3": int(desired["target"]),
        "4": desired["mode"],
        "5": desired["fan"],
    })


def open_cloud(unit):
    access_id = os.environ.get("TUYA_ACCESS_ID", "").strip()
    secret = os.environ.get("TUYA_ACCESS_SECRET", "")
    if not access_id or not secret:
        raise RuntimeError("missing AC remote credentials")
    from tuya_connector import TuyaOpenAPI

    api = TuyaOpenAPI(unit.get("cloudEndpoint") or "https://openapi.tuyaeu.com", access_id, secret)
    connected = api.connect()
    if not connected.get("success"):
        raise RuntimeError("cloud auth failed")
    return api


def remote_snapshot(unit):
    remote_id = unit.get("remoteId")
    if not remote_id:
        raise RuntimeError("missing AC remote")
    result = open_cloud(unit).get(f"/v1.0/devices/{remote_id}/status")
    if not isinstance(result, dict) or not result.get("success"):
        raise RuntimeError("remote status failed")
    rows = result.get("result") or []
    by_code = {row.get("code"): row.get("value") for row in rows if isinstance(row, dict)}
    return {
        "power": str(by_code.get("power")).lower() in ("1", "true"),
        "mode": MODE_FROM_CODE.get(int(by_code.get("mode") or 0), "cold"),
        "fan": FAN_FROM_CODE.get(int(by_code.get("wind") or 0), "auto"),
        "target": int(float(by_code.get("temp") or 20)),
    }


def dps_from_remote(remote):
    return {
        "1": remote["power"],
        "3": remote["target"],
        "4": remote["mode"],
        "5": remote["fan"],
    }


def state_from_remote(unit, remote):
    return {
        "id": unit["id"],
        "name": unit.get("name"),
        "room": unit.get("room"),
        "productId": unit.get("productId"),
        "host": "cloud",
        "online": True,
        "power": remote["power"],
        "currentC": None,
        "targetC": remote["target"],
        "mode": remote["mode"],
        "fan": remote["fan"],
        "humidity": None,
        "work": None,
        "libraryReady": False,
        "modes": list(MODES),
        "fans": list(FANS),
        "tempMin": 16,
        "tempMax": 30,
    }


def send_remote(unit, body, desired):
    """Transmit only the fields the user changed. A bundled command is rejected."""
    remote_id = unit.get("remoteId")
    access_id = os.environ.get("TUYA_ACCESS_ID", "").strip()
    secret = os.environ.get("TUYA_ACCESS_SECRET", "")
    if not remote_id or not access_id or not secret:
        raise RuntimeError("missing AC remote credentials")
    from tuya_connector import TuyaOpenAPI

    api = TuyaOpenAPI(unit.get("cloudEndpoint") or "https://openapi.tuyaeu.com", access_id, secret)
    connected = api.connect()
    if not connected.get("success"):
        raise RuntimeError("cloud auth failed")
    commands = []
    if "power" in body:
        commands.append({
            "code": "PowerOn" if desired["power"] else "PowerOff",
            "value": "PowerOn" if desired["power"] else "PowerOff",
        })
    if body.get("mode"):
        commands.append({"code": "M", "value": MODE_CODE[desired["mode"]]})
    if body.get("target") is not None:
        commands.append({"code": "T", "value": int(desired["target"])})
    if body.get("fan"):
        commands.append({"code": "F", "value": FAN_CODE[desired["fan"]]})
    if not commands:
        raise RuntimeError("empty command")
    result = api.post(f"/v1.0/devices/{remote_id}/commands", {"commands": commands})
    if not isinstance(result, dict) or not result.get("success"):
        message = "remote command failed"
        if isinstance(result, dict) and result.get("msg"):
            message = str(result.get("msg"))
        raise RuntimeError(message)


def command_landed(status, desired):
    dps = (status or {}).get("dps") or {}
    if bool(dps.get("1")) != bool(desired["power"]):
        return False
    if dps.get("4") != desired["mode"]:
        return False
    if dps.get("5") != desired["fan"]:
        return False
    if dps.get("3") != int(desired["target"]):
        return False
    return True


def emit(payload):
    sys.stdout.write(json.dumps(payload))


def main():
    load_env_file()
    command = sys.argv[1] if len(sys.argv) > 1 else "status"
    try:
        if command == "list":
            emit({"ok": True, "units": [{"id": u["id"], "name": u.get("name"), "room": u.get("room")} for u in load_units()]})
            return 0
        body = {}
        if command == "command":
            raw = sys.stdin.read()
            body = json.loads(raw) if raw.strip() else {}
        unit = unit_by_id(body.get("id"))
        if not unit:
            emit({"ok": False, "error": "unknown unit"})
            return 1
        device = host = status = None
        try:
            device, host, status = connect(unit)
        except RuntimeError:
            device = host = status = None
        if command == "command":
            base = status if isinstance(status, dict) else {"dps": dps_from_remote(remote_snapshot(unit))}
            desired = desired_state(base, body)
            send_remote(unit, body, desired)
            if device:
                apply_command(device, desired)
                status = {}
                for _ in range(4):
                    status = device.status()
                    if isinstance(status, dict) and command_landed(status, desired):
                        break
                    time.sleep(0.35)
                if not isinstance(status, dict) or "dps" not in status or not command_landed(status, desired):
                    emit({"ok": False, "error": "command not confirmed"})
                    return 1
            else:
                remote = remote_snapshot(unit)
                status = {"dps": dps_from_remote(remote)}
                if not command_landed(status, desired):
                    emit({"ok": False, "error": "command not confirmed"})
                    return 1
                emit({"ok": True, "unit": state_from_remote(unit, remote)})
                return 0
        elif command != "status":
            emit({"ok": False, "error": "unknown command"})
            return 1
        if isinstance(status, dict):
            emit({"ok": True, "unit": public_state(unit, host, status)})
        else:
            emit({"ok": True, "unit": state_from_remote(unit, remote_snapshot(unit))})
        return 0
    except Exception as err:
        emit({"ok": False, "error": str(err)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
