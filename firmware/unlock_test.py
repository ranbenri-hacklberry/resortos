#!/usr/bin/env python3
import asyncio
import json
import sys
from ttlock_ble import VirtualKey, LockVersion, TTLockClient

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

async def unlock_lock():
    print("=" * 60)
    print("  ResortOS - Local TTLock BLE Unlocker (100% Offline)")
    print("=" * 60)

    key = load_virtual_key()
    print(f"Target Lock: {key.lockAlias} ({key.lockMac})")
    print(f"AES Key:     {key.aesKeyStr}")
    print(f"Unlock Key:  {key.unlockKey}")

    print(f"\nScanning and connecting to {key.lockMac} via Bluetooth Low Energy...")
    print(">>> If the lock keypad is asleep, touch it once to wake it up! <<<")
    
    try:
        async with TTLockClient(key, scan_timeout=25.0) as client:
            print("\n[+] Connected to lock over BLE!")
            print("[+] Querying current lock state...")
            try:
                state, battery = await client.query_state()
                print(f"    Current state: {state} | Battery: {battery}%")
            except Exception as q_err:
                print(f"    (State query note: {q_err})")

            print("\n[>>>] Sending authenticated UNLOCK command...")
            await client.unlock()
            print("\n[SUCCESS] *** LOCK OPENED SUCCESSFULLY! *** 🔓")
    except Exception as e:
        print(f"\n[!] Error during BLE unlock: {e}")

if __name__ == "__main__":
    asyncio.run(unlock_lock())
