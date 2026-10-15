#!/usr/bin/env python3
import asyncio
import json
import sys
from ttlock_ble import VirtualKey, LockVersion, TTLockClient, KeyboardPwdType

def load_virtual_key(config_file="/Users/user/Documents/Max/hotelos/firmware/lock_config.json"):
    with open(config_file) as f:
        locks = json.load(f)
    if not locks:
        raise ValueError("No locks found in lock_config.json")
    
    cfg = locks[0]
    lv_data = cfg.get("lockVersion", {}) or {}
    lv = LockVersion(
        protocolType=lv_data.get("protocolType") or 5,
        protocolVersion=lv_data.get("protocolVersion") or 3,
        scene=lv_data.get("scene") or 2,
        groupId=lv_data.get("groupId") or 1,
        orgId=lv_data.get("orgId") or 1
    )
    
    return VirtualKey(
        keyId=cfg["lockId"],
        lockId=cfg["lockId"],
        lockMac=cfg["lockMac"],
        lockAlias=cfg["lockName"],
        lockName=cfg["lockName"],
        lockVersion=lv,
        aesKeyStr=cfg["aesKeyStr"],
        unlockKey=cfg["unlockKey"],
        lockFlagPos=cfg.get("lockFlagPos", 0),
        timezoneRawOffSet=cfg.get("timezoneRawOffSet", 0),
        adminPs=cfg.get("adminPs", ""),
        specialValue=cfg.get("specialValue", 0)
    )

async def add_passcode(code: str):
    print("=" * 60)
    print("  ResortOS - Local TTLock Add Passcode")
    print("=" * 60)

    key = load_virtual_key()
    print(f"Target Lock: {key.lockAlias} ({key.lockMac})")
    print(f"Adding Passcode: {code}")

    print(f"\nConnecting to {key.lockMac} via Bluetooth Low Energy...")
    print(">>> If the lock keypad is asleep, touch it once to wake it up! <<<")
    
    try:
        async with TTLockClient(key, scan_timeout=25.0) as client:
            print("\n[+] Connected to lock over BLE!")
            print(f"[>>>] Programming custom passcode '{code}' into lock memory...")
            await client.add_passcode(code, pwd_type=KeyboardPwdType.PERMANENT)
            print(f"\n[SUCCESS] *** PASSCODE '{code}' PROGRAMMED SUCCESSFULLY! *** 🎉")
            print("You can now enter this code on the lock keypad followed by '#' to unlock!")
    except Exception as e:
        print(f"\n[!] Error programming passcode: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 add_passcode_test.py <4-9_digit_code>")
        print("Example: python3 add_passcode_test.py 1234")
        sys.exit(1)
    
    code_to_add = sys.argv[1].strip()
    asyncio.run(add_passcode(code_to_add))
