#!/usr/bin/env python3
import asyncio
import getpass
import json
import sys
from ttlock_ble import TTLockCloud, CloudError

async def fetch_keys(username=None, password=None):
    print("=" * 60)
    print("  ResortOS - TTLock Key Fetcher")
    print("=" * 60)
    
    if not username:
        username = input("TTLock Account (Email or Phone number): ").strip()
    if not password:
        password = getpass.getpass("TTLock Password: ").strip()

    if not username or not password:
        print("Error: Username and password are required.")
        return

    async with TTLockCloud() as cloud:
        print("\nConnecting to TTLock Cloud...")
        try:
            await cloud.discover_site()
        except Exception as e:
            print(f"Site discovery notice: {e}")

        try:
            print("Authenticating...")
            await cloud.login(username, password)
        except CloudError as e:
            body = getattr(e, 'body', {})
            errcode = body.get('errcode') or body.get('errorCode')
            err_msg = str(e)
            
            # Check for new device verification (-1014 or Chinese/English text)
            if errcode == -1014 or "新设备" in err_msg or "验证" in err_msg or "verification" in err_msg.lower():
                print("\n" + "=" * 60)
                print("[!] New Device Verification (2FA) is required by TTLock.")
                print("    Requesting verification code from TTLock...")
                try:
                    res = await cloud.request_login_verification_code(username)
                    print(f"    -> Verification code sent to: {username}")
                except Exception as req_err:
                    print(f"    -> Code request notice: {req_err}")
                
                print("=" * 60)
                code = input("\nEnter the verification code you received (Email/SMS): ").strip()
                print("Validating device with code...")
                await cloud.validate_new_device(username, code)
                print("Device verified successfully! Logging in...")
                await cloud.login(username, password)
            else:
                print(f"Login failed: {e}")
                return
        except Exception as e:
            print(f"Login error: {e}")
            return

        print("\nLogin successful! Fetching locks...")
        keys = await cloud.list_keys()
        if not keys:
            print("No locks found associated with this account.")
            return

        print(f"\nFound {len(keys)} lock(s):")
        locks_data = []
        for k in keys:
            print(f"  * Name: {k.lockAlias or k.lockName} | MAC: {k.lockMac} | ID: {k.lockId}")
            lock_dict = {
                "lockId": k.lockId,
                "lockMac": k.lockMac,
                "lockName": k.lockAlias or k.lockName,
                "aesKeyStr": k.aesKeyStr,
                "unlockKey": k.unlockKey,
                "lockFlagPos": k.lockFlagPos,
                "adminPs": k.adminPs,
                "keyboardPwdVersion": k.keyboardPwdVersion,
                "specialValue": k.specialValue,
                "lockVersion": {
                    "protocolType": getattr(k.lockVersion, 'protocol_type', None),
                    "protocolVersion": getattr(k.lockVersion, 'protocol_version', None),
                    "scene": getattr(k.lockVersion, 'scene', None),
                    "groupId": getattr(k.lockVersion, 'group_id', None),
                    "orgId": getattr(k.lockVersion, 'org_id', None),
                } if k.lockVersion else None
            }
            locks_data.append(lock_dict)

        output_file = "/Users/user/Documents/Max/hotelos/firmware/lock_config.json"
        with open(output_file, "w") as f:
            json.dump(locks_data, f, indent=2)

        print(f"\n[SUCCESS] Successfully retrieved and saved keys to {output_file}!")

if __name__ == "__main__":
    u = sys.argv[1] if len(sys.argv) > 1 else None
    p = sys.argv[2] if len(sys.argv) > 2 else None
    asyncio.run(fetch_keys(u, p))
