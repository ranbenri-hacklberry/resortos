#include <Arduino.h>
#include <NimBLEDevice.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <time.h>
#include "mbedtls/aes.h"
#include <vector>
#include <set>
#include <string.h>
#include <math.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <ir_Tcl.h>
#include <ArduinoOTA.h>
#include <Update.h>
#include <ld2410.h>


#if __has_include("wifi_credentials.h")
#include "wifi_credentials.h"
#endif

// ============================================================================
// Target Lock Configuration
// ============================================================================
static const char* TARGET_LOCK_MAC = "F5:60:1C:E2:09:A9";
static const uint8_t AES_KEY[16] = {
    0x7e, 0x8b, 0x30, 0x81, 0xb6, 0x72, 0x22, 0xf8,
    0x5f, 0x1a, 0xc4, 0x38, 0x1d, 0x56, 0x2a, 0x32
};
static const uint32_t UNLOCK_KEY   = 118726469;  // "0118726469"
static const uint32_t ADMIN_PS     = 649329475;  // "0649329475"

// TTLock Opcodes
static const uint8_t CMD_CHECK_USER_TIME = 0x55;
static const uint8_t CMD_CHECK_ADMIN     = 0x41;
static const uint8_t CMD_CHECK_RANDOM    = 0x30;
static const uint8_t CMD_UNLOCK          = 0x47;
static const uint8_t CMD_LOCK            = 0x58;
static const uint8_t CMD_IC_MANAGE       = 0x05;
static const uint8_t CMD_QUERY_STATE     = 0x14; // COMM_SEARCH_BICYCLE_STATUS (query lockState & battery)
static const uint8_t CMD_GET_OPERATE_LOG = 0x25; // COMM_GET_OPERATE_LOG (37)
static const uint8_t CMD_MANAGE_KEYBOARD_PASSWORD = 0x03; // COMM_MANAGE_KEYBOARD_PASSWORD

// IC Operate Sub-types
static const uint8_t IC_OP_SEARCH = 0x01;
static const uint8_t IC_OP_ADD    = 0x02;
static const uint8_t IC_OP_DELETE = 0x03;
static const uint8_t IC_OP_CLEAR  = 0x04;
static const uint8_t IC_OP_MODIFY = 0x05;

static const uint8_t STATUS_ADD_SUCCESS      = 0x01;
static const uint8_t STATUS_ENTER_ADD_MODE   = 0x02;

// CRC-8 Lookup Table (libLockCore / TTLock V3)
static const uint8_t CRC_TABLE[256] = {
    0x00, 0x5e, 0xbc, 0xe2, 0x61, 0x3f, 0xdd, 0x83, 0xc2, 0x9c, 0x7e, 0x20, 0xa3, 0xfd, 0x1f, 0x41,
    0x9d, 0xc3, 0x21, 0x7f, 0xfc, 0xa2, 0x40, 0x1e, 0x5f, 0x01, 0xe3, 0xbd, 0x3e, 0x60, 0x82, 0xdc,
    0x23, 0x07, 0x9f, 0xc1, 0x42, 0x1c, 0xfe, 0xa0, 0xe1, 0xbf, 0x5d, 0x03, 0x80, 0xde, 0x3c, 0x62,
    0xbe, 0xe0, 0x02, 0x5c, 0xdf, 0x81, 0x63, 0x3d, 0x7c, 0x22, 0xc0, 0x9e, 0x1d, 0x43, 0xa1, 0xff,
    0x46, 0x18, 0xfa, 0xa4, 0x27, 0x79, 0x9b, 0xc5, 0x84, 0xda, 0x38, 0x66, 0xe5, 0xbb, 0x59, 0x07,
    0xdb, 0x85, 0x67, 0x39, 0xba, 0xe4, 0x06, 0x58, 0x19, 0x47, 0xa5, 0xfb, 0x78, 0x26, 0xc4, 0x9a,
    0x65, 0x3b, 0xd9, 0x87, 0x04, 0x5a, 0xb8, 0xe6, 0xa7, 0xf9, 0x1b, 0x45, 0xc6, 0x98, 0x7a, 0x24,
    0xf8, 0xa6, 0x44, 0x1a, 0x99, 0xc7, 0x25, 0x7b, 0x3a, 0x64, 0x86, 0xd8, 0x5b, 0x05, 0xe7, 0xb9,
    0x8c, 0xd2, 0x30, 0x6e, 0xed, 0xb3, 0x51, 0x0f, 0x4e, 0x10, 0xf2, 0xac, 0x2f, 0x71, 0x93, 0xcd,
    0x11, 0x4f, 0xad, 0xf3, 0x70, 0x2e, 0xcc, 0x92, 0xd3, 0x8d, 0x6f, 0x31, 0xb2, 0xec, 0x0e, 0x50,
    0xaf, 0xf1, 0x13, 0x4d, 0xce, 0x90, 0x72, 0x2c, 0x6d, 0x33, 0xd1, 0x8f, 0x0c, 0x52, 0xb0, 0xee,
    0x32, 0x6c, 0x8e, 0xd0, 0x53, 0x0d, 0xef, 0xb1, 0xf0, 0xae, 0x4c, 0x12, 0x91, 0xcf, 0x2d, 0x73,
    0xca, 0x94, 0x76, 0x28, 0xab, 0xf5, 0x17, 0x49, 0x08, 0x56, 0xb4, 0xea, 0x69, 0x37, 0xd5, 0x8b,
    0x57, 0x09, 0xeb, 0xb5, 0x36, 0x68, 0x8a, 0xd4, 0x95, 0xcb, 0x29, 0x77, 0xf4, 0xaa, 0x48, 0x16,
    0xe9, 0xb7, 0x55, 0x0b, 0x88, 0xd6, 0x34, 0x6a, 0x2b, 0x75, 0x97, 0xc9, 0x4a, 0x14, 0xf6, 0xa8,
    0x74, 0x2a, 0xc8, 0x96, 0x15, 0x4b, 0xa9, 0xf7, 0xb6, 0xe8, 0x0a, 0x54, 0xd7, 0x89, 0x6b, 0x35
};

static uint8_t compute_crc(const uint8_t* data, size_t len) {
    uint8_t crc = 0;
    for (size_t i = 0; i < len; i++) {
        crc = CRC_TABLE[(data[i] ^ crc) & 0xFF];
    }
    return crc & 0xFF;
}

// AES-128-CBC Crypto Routines
static void aes128_cbc_encrypt(const uint8_t* in, size_t len, uint8_t* out, const uint8_t* key) {
    mbedtls_aes_context ctx;
    mbedtls_aes_init(&ctx);
    mbedtls_aes_setkey_enc(&ctx, key, 128);
    uint8_t iv[16];
    memcpy(iv, key, 16);
    mbedtls_aes_crypt_cbc(&ctx, MBEDTLS_AES_ENCRYPT, len, iv, in, out);
    mbedtls_aes_free(&ctx);
}

static void aes128_cbc_decrypt(const uint8_t* in, size_t len, uint8_t* out, const uint8_t* key) {
    mbedtls_aes_context ctx;
    mbedtls_aes_init(&ctx);
    mbedtls_aes_setkey_dec(&ctx, key, 128);
    uint8_t iv[16];
    memcpy(iv, key, 16);
    mbedtls_aes_crypt_cbc(&ctx, MBEDTLS_AES_DECRYPT, len, iv, in, out);
    mbedtls_aes_free(&ctx);
}

static size_t pad_pkcs7(const uint8_t* in, size_t in_len, uint8_t* out) {
    uint8_t pad_len = 16 - (in_len % 16);
    memcpy(out, in, in_len);
    for (size_t i = 0; i < pad_len; i++) {
        out[in_len + i] = pad_len;
    }
    return in_len + pad_len;
}

// Frame Builder for TTLock V3
static std::vector<uint8_t> build_v3_frame(uint8_t cmd, const uint8_t* plain_payload, size_t payload_len) {
    uint8_t padded[64];
    size_t padded_len = pad_pkcs7(plain_payload, payload_len, padded);
    uint8_t encrypted[64];
    aes128_cbc_encrypt(padded, padded_len, encrypted, AES_KEY);

    std::vector<uint8_t> frame;
    frame.push_back(0x7F);
    frame.push_back(0x5A);
    frame.push_back(0x05); // proto: 5
    frame.push_back(0x03); // sub: 3
    frame.push_back(0x02); // scene: 2
    frame.push_back(0x00); // groupId high
    frame.push_back(0x01); // groupId low: 1
    frame.push_back(0x00); // orgId high
    frame.push_back(0x01); // orgId low: 1
    frame.push_back(cmd);  // command opcode
    frame.push_back(0xAA); // encrypt flag: APP_COMMAND
    frame.push_back((uint8_t)padded_len);
    
    for (size_t i = 0; i < padded_len; i++) {
        frame.push_back(encrypted[i]);
    }

    uint8_t crc = compute_crc(frame.data(), frame.size());
    frame.push_back(crc);
    frame.push_back(0x0D);
    frame.push_back(0x0A);

    return frame;
}

// GATT Identifiers
static const char* SERVICE_UUID     = "00001910-0000-1000-8000-00805f9b34fb";
static const char* CHAR_WRITE_UUID  = "0000fff2-0000-1000-8000-00805f9b34fb";
static const char* CHAR_NOTIFY_UUID = "0000fff4-0000-1000-8000-00805f9b34fb";

static volatile bool hasResponse = false;
static std::vector<uint8_t> rxBuffer;

static void notifyCallback(NimBLERemoteCharacteristic* pChar, uint8_t* pData, size_t length, bool isNotify) {
    for (size_t i = 0; i < length; i++) {
        rxBuffer.push_back(pData[i]);
    }
    if (rxBuffer.size() >= 15) {
        if (rxBuffer[0] == 0x7F && rxBuffer[1] == 0x5A) {
            uint8_t declared_len = rxBuffer[11];
            size_t total_expected = 12 + declared_len + 1 + 2;
            if (rxBuffer.size() >= total_expected) {
                if (rxBuffer[total_expected - 2] == 0x0D && rxBuffer[total_expected - 1] == 0x0A) {
                    hasResponse = true;
                }
            }
        }
    }
}

static bool wait_and_decrypt_response(uint8_t expected_cmd, std::vector<uint8_t>& out_plain, uint32_t timeout_ms = 4000) {
    uint32_t start = millis();
    while (millis() - start < timeout_ms) {
        if (hasResponse) break;
        delay(10);
    }
    if (!hasResponse) {
        Serial.printf("[-] Response timeout for cmd 0x%02X\n", expected_cmd);
        return false;
    }

    size_t cipher_len = rxBuffer[11];
    uint8_t cipher[256];
    if (cipher_len > sizeof(cipher)) cipher_len = sizeof(cipher);
    memcpy(cipher, &rxBuffer[12], cipher_len);

    uint8_t plain[256];
    aes128_cbc_decrypt(cipher, cipher_len, plain, AES_KEY);

    uint8_t pad = plain[cipher_len - 1];
    size_t plain_len = (pad > 0 && pad <= 16) ? (cipher_len - pad) : cipher_len;

    out_plain.assign(plain, plain + plain_len);
    rxBuffer.clear();
    hasResponse = false;

    return (plain[0] == expected_cmd && plain[1] == 0x01);
}

// Fallback scanner state
static bool fallbackFound = false;
static NimBLEAdvertisedDevice fallbackDev;

class FallbackScanCallbacks: public NimBLEAdvertisedDeviceCallbacks {
    void onResult(NimBLEAdvertisedDevice* dev) override {
        NimBLEAddress targetAddr(TARGET_LOCK_MAC, BLE_ADDR_RANDOM);
        if (dev->getAddress() == targetAddr || dev->getAddress().toString() == std::string(TARGET_LOCK_MAC)) {
            Serial.printf("[+] Lock beacon captured! RSSI: %d dBm\n", dev->getRSSI());
            fallbackDev = *dev;
            fallbackFound = true;
            NimBLEDevice::getScan()->stop();
        }
    }
};
static FallbackScanCallbacks staticScanCallbacks;

// Core BLE Connection Establisher
static volatile bool bleOpBusy = false;

NimBLEClient* connectToLock() {
    bleOpBusy = true;
    NimBLEScan* pScan = NimBLEDevice::getScan();
    if (pScan && pScan->isScanning()) {
        pScan->stop();
    }
    delay(40);
    NimBLEAddress lockAddress(TARGET_LOCK_MAC, BLE_ADDR_RANDOM);

    NimBLEClient* pClient = NimBLEDevice::getClientByPeerAddress(lockAddress);
    if (!pClient) {
        pClient = NimBLEDevice::createClient();
    }
    if (!pClient) {
        Serial.println("[-] Error creating NimBLE client");
        return nullptr;
    }

    if (pClient->isConnected()) {
        return pClient;
    }

    pClient->setConnectTimeout(8);
    pClient->setConnectionParams(16, 32, 0, 400, 160, 160);

    bool connected = false;
    Serial.println("\n[*] Initiating DIRECT HARDWARE CONNECT (8s baseband latch)...");
    connected = pClient->connect(lockAddress, false);

    if (!connected) {
        Serial.println("[!] Direct connect timed out. Launching 100% duty-cycle passive scan...");
        NimBLEScan* pBLEScan = NimBLEDevice::getScan();
        pBLEScan->setAdvertisedDeviceCallbacks(&staticScanCallbacks, true);
        pBLEScan->setInterval(160);
        pBLEScan->setWindow(160);
        pBLEScan->setActiveScan(false);

        fallbackFound = false;
        pBLEScan->start(8, false);

        if (fallbackFound) {
            Serial.println("[*] Connecting to captured device...");
            connected = pClient->connect(&fallbackDev, false);
        }
    }

    if (!connected) {
        Serial.println("[-] Connection failed.");
        bleOpBusy = false;
        return nullptr;
    }

    Serial.printf("[+] Connected to lock! (Conn ID: %d, MTU: %d)\n", 
                  pClient->getConnId(), pClient->getMTU());
    return pClient;
}

// Handshake for UNLOCK (0x47) or LOCK (0x58)
bool performLockAction(NimBLEClient* pClient, uint8_t actionCmd) {
    NimBLERemoteService* pService = pClient->getService(SERVICE_UUID);
    if (!pService) {
        Serial.println("[-] Service 0x1910 not found!");
        return false;
    }

    NimBLERemoteCharacteristic* pWriteChar = pService->getCharacteristic(CHAR_WRITE_UUID);
    NimBLERemoteCharacteristic* pNotifyChar = pService->getCharacteristic(CHAR_NOTIFY_UUID);
    if (!pWriteChar || !pNotifyChar) {
        Serial.println("[-] Characteristics FFF2/FFF4 not found!");
        return false;
    }

    rxBuffer.clear();
    hasResponse = false;
    if (pNotifyChar->canNotify()) {
        pNotifyChar->subscribe(true, notifyCallback);
    }
    delay(150);

    // 1. CHECK_USER_TIME (0x55)
    uint8_t check_time_payload[17] = {
        0x00, 0x01, 0x31, 0x14, 0x00,
        0x99, 0x11, 0x30, 0x14, 0x00,
        0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00
    };

    Serial.println("[>>>] Sending CHECK_USER_TIME (0x55)...");
    std::vector<uint8_t> frame1 = build_v3_frame(0x55, check_time_payload, sizeof(check_time_payload));
    pWriteChar->writeValue(frame1.data(), frame1.size(), true);

    std::vector<uint8_t> resp1;
    if (!wait_and_decrypt_response(0x55, resp1, 5000) || resp1.size() < 6) {
        Serial.println("[-] CHECK_USER_TIME rejected!");
        return false;
    }

    uint32_t psFromLock = ((uint32_t)resp1[2] << 24) |
                          ((uint32_t)resp1[3] << 16) |
                          ((uint32_t)resp1[4] << 8)  |
                          ((uint32_t)resp1[5]);
    Serial.printf("[+] psFromLock: 0x%08X\n", psFromLock);

    // 2. Action Frame (UNLOCK 0x47 or LOCK 0x58)
    uint32_t sum_val = (psFromLock + UNLOCK_KEY);
    time_t now = time(nullptr);
    if (now < 1700000000) now = 1728288000;

    uint8_t payload[8];
    payload[0] = (sum_val >> 24) & 0xFF;
    payload[1] = (sum_val >> 16) & 0xFF;
    payload[2] = (sum_val >> 8) & 0xFF;
    payload[3] = sum_val & 0xFF;

    payload[4] = (now >> 24) & 0xFF;
    payload[5] = (now >> 16) & 0xFF;
    payload[6] = (now >> 8) & 0xFF;
    payload[7] = now & 0xFF;

    const char* actionName = (actionCmd == CMD_UNLOCK) ? "UNLOCK" : "LOCK";
    Serial.printf("[>>>] Sending %s (0x%02X)...\n", actionName, actionCmd);
    std::vector<uint8_t> frame2 = build_v3_frame(actionCmd, payload, sizeof(payload));
    pWriteChar->writeValue(frame2.data(), frame2.size(), true);

    std::vector<uint8_t> resp2;
    if (!wait_and_decrypt_response(actionCmd, resp2, 5000)) {
        Serial.printf("[-] %s command rejected!\n", actionName);
        return false;
    }

    Serial.println("\n**************************************************");
    Serial.printf("🎉🎉🎉 [SUCCESS] LOCK %s SUCCEEDED! 🎉🎉🎉\n", actionName);
    Serial.println("**************************************************\n");
    return true;
}

// Authenticate Admin session for sensitive commands (IC Cards, Passcodes)
bool performAdminAuth(NimBLERemoteCharacteristic* pWriteChar, uint32_t& outPs) {
    // 1. CHECK_ADMIN (0x41)
    uint8_t adminPayload[11];
    adminPayload[0] = (ADMIN_PS >> 24) & 0xFF;
    adminPayload[1] = (ADMIN_PS >> 16) & 0xFF;
    adminPayload[2] = (ADMIN_PS >> 8) & 0xFF;
    adminPayload[3] = ADMIN_PS & 0xFF;
    memset(&adminPayload[4], 0, 7);

    Serial.println("[>>>] Sending CHECK_ADMIN (0x41)...");
    std::vector<uint8_t> frame1 = build_v3_frame(CMD_CHECK_ADMIN, adminPayload, sizeof(adminPayload));
    pWriteChar->writeValue(frame1.data(), frame1.size(), true);

    std::vector<uint8_t> resp1;
    if (!wait_and_decrypt_response(CMD_CHECK_ADMIN, resp1, 5000) || resp1.size() < 6) {
        Serial.println("[-] CHECK_ADMIN rejected!");
        return false;
    }

    uint32_t psFromLock = ((uint32_t)resp1[2] << 24) |
                          ((uint32_t)resp1[3] << 16) |
                          ((uint32_t)resp1[4] << 8)  |
                          ((uint32_t)resp1[5]);
    outPs = psFromLock;
    Serial.printf("[+] Admin psFromLock: 0x%08X\n", psFromLock);

    // 2. CHECK_RANDOM (0x30)
    uint32_t sum_val = (psFromLock + UNLOCK_KEY);
    uint8_t randPayload[4];
    randPayload[0] = (sum_val >> 24) & 0xFF;
    randPayload[1] = (sum_val >> 16) & 0xFF;
    randPayload[2] = (sum_val >> 8) & 0xFF;
    randPayload[3] = sum_val & 0xFF;

    Serial.println("[>>>] Sending CHECK_RANDOM (0x30)...");
    std::vector<uint8_t> frame2 = build_v3_frame(CMD_CHECK_RANDOM, randPayload, sizeof(randPayload));
    pWriteChar->writeValue(frame2.data(), frame2.size(), true);

    std::vector<uint8_t> resp2;
    if (!wait_and_decrypt_response(CMD_CHECK_RANDOM, resp2, 5000)) {
        Serial.println("[-] CHECK_RANDOM rejected!");
        return false;
    }
    Serial.println("[+] Admin session validated successfully!");
    return true;
}

// Add IC Card: Initiates card learning on lock and captures card ID
bool performAddCardBLE(String& outCardId, uint32_t waitTimeoutMs = 15000) {
    NimBLEClient* pClient = connectToLock();
    if (!pClient) return false;

    NimBLERemoteService* pService = pClient->getService(SERVICE_UUID);
    if (!pService) { pClient->disconnect(); return false; }

    NimBLERemoteCharacteristic* pWriteChar = pService->getCharacteristic(CHAR_WRITE_UUID);
    NimBLERemoteCharacteristic* pNotifyChar = pService->getCharacteristic(CHAR_NOTIFY_UUID);
    if (!pWriteChar || !pNotifyChar) { pClient->disconnect(); return false; }

    rxBuffer.clear();
    hasResponse = false;
    pNotifyChar->subscribe(true, notifyCallback);
    delay(150);

    uint32_t ps = 0;
    if (!performAdminAuth(pWriteChar, ps)) {
        pClient->disconnect();
        return false;
    }

    // Send COMM_IC_MANAGE (0x05) with opType = ADD (0x02)
    uint8_t addPayload[1] = { IC_OP_ADD };
    Serial.println("[>>>] Sending COMM_IC_MANAGE (0x05) ADD...");
    std::vector<uint8_t> frame = build_v3_frame(CMD_IC_MANAGE, addPayload, 1);
    pWriteChar->writeValue(frame.data(), frame.size(), true);

    std::vector<uint8_t> resp;
    if (!wait_and_decrypt_response(CMD_IC_MANAGE, resp, 5000)) {
        Serial.println("[-] Failed to enter IC Card ADD mode!");
        pClient->disconnect();
        return false;
    }

    Serial.printf("[+] Add mode entered! Lock response len=%d: ", resp.size());
    for (size_t i = 0; i < resp.size(); i++) Serial.printf("%02X ", resp[i]);
    Serial.println();
    Serial.println("[+] Lock is in Card Learning mode! Please swipe card on the lock now...");
    
    // Now wait up to waitTimeoutMs for the card swipe notification
    uint32_t tStart = millis();
    bool cardCaptured = false;
    while (millis() - tStart < waitTimeoutMs) {
        if (hasResponse) {
            uint8_t cipher_len = rxBuffer[11];
            uint8_t cipher[64];
            memcpy(cipher, &rxBuffer[12], cipher_len);
            uint8_t plain[64];
            aes128_cbc_decrypt(cipher, cipher_len, plain, AES_KEY);
            uint8_t pad = plain[cipher_len - 1];
            size_t plain_len = (pad > 0 && pad <= 16) ? (cipher_len - pad) : cipher_len;

            rxBuffer.clear();
            hasResponse = false;

            Serial.printf("[DEBUG] Rx plain_len=%d: ", plain_len);
            for (size_t i = 0; i < plain_len; i++) Serial.printf("%02X ", plain[i]);
            Serial.println();

            // Check if card swipe packet:
            // plain[0]=0x05, plain[1]=0x01 (SUCCESS), plain[2]=batt, plain[3]=0x02 (ADD), plain[4]=0x01 (STATUS_ADD_SUCCESS)
            if (plain_len >= 5 && plain[0] == CMD_IC_MANAGE && plain[1] == 0x01) {
                uint8_t opType = plain[3];
                uint8_t addStatus = plain[4];
                if (opType == IC_OP_ADD && addStatus == STATUS_ADD_SUCCESS) {
                    uint32_t cNum = 0;
                    if (plain_len >= 9) {
                        cNum = ((uint32_t)plain[5] << 24) |
                               ((uint32_t)plain[6] << 16) |
                               ((uint32_t)plain[7] << 8)  |
                               ((uint32_t)plain[8]);
                        outCardId = String(cNum);
                    }
                    Serial.printf("[🎉] Card Learned Successfully! Card ID: %s (Raw: 0x%08X)\n", outCardId.c_str(), cNum);
                    cardCaptured = true;

                    // Send MODIFY (0x05) to set permanent validity dates (2024-01-01 to 2099-12-31)
                    delay(150);
                    uint8_t modPayload[15];
                    modPayload[0] = IC_OP_MODIFY; // 0x05
                    modPayload[1] = (cNum >> 24) & 0xFF;
                    modPayload[2] = (cNum >> 16) & 0xFF;
                    modPayload[3] = (cNum >> 8) & 0xFF;
                    modPayload[4] = cNum & 0xFF;
                    // startDate: 24-01-01 00:00
                    modPayload[5] = 24; modPayload[6] = 1; modPayload[7] = 1; modPayload[8] = 0; modPayload[9] = 0;
                    // endDate: 99-12-31 23:59
                    modPayload[10] = 99; modPayload[11] = 12; modPayload[12] = 31; modPayload[13] = 23; modPayload[14] = 59;

                    Serial.printf("[>>>] Sending COMM_IC_MANAGE (0x05) MODIFY for card %s...\n", outCardId.c_str());
                    std::vector<uint8_t> modFrame = build_v3_frame(CMD_IC_MANAGE, modPayload, 15);
                    pWriteChar->writeValue(modFrame.data(), modFrame.size(), true);

                    std::vector<uint8_t> modResp;
                    if (wait_and_decrypt_response(CMD_IC_MANAGE, modResp, 5000)) {
                        Serial.println("[+] Card permanent validity registered in lock!");
                    }
                    break;
                }
            }
        }
        delay(20);
    }

    pClient->disconnect();
    return cardCaptured;
}

// Delete IC Card from Lock
bool performDeleteCardBLE(const String& cardId) {
    NimBLEClient* pClient = connectToLock();
    if (!pClient) return false;

    NimBLERemoteService* pService = pClient->getService(SERVICE_UUID);
    if (!pService) { pClient->disconnect(); return false; }

    NimBLERemoteCharacteristic* pWriteChar = pService->getCharacteristic(CHAR_WRITE_UUID);
    NimBLERemoteCharacteristic* pNotifyChar = pService->getCharacteristic(CHAR_NOTIFY_UUID);
    if (!pWriteChar || !pNotifyChar) { pClient->disconnect(); return false; }

    rxBuffer.clear();
    hasResponse = false;
    pNotifyChar->subscribe(true, notifyCallback);
    delay(150);

    uint32_t ps = 0;
    if (!performAdminAuth(pWriteChar, ps)) {
        pClient->disconnect();
        return false;
    }

    uint32_t cNum = cardId.toInt();
    uint8_t delPayload[5];
    delPayload[0] = IC_OP_DELETE;
    delPayload[1] = (cNum >> 24) & 0xFF;
    delPayload[2] = (cNum >> 16) & 0xFF;
    delPayload[3] = (cNum >> 8) & 0xFF;
    delPayload[4] = cNum & 0xFF;

    Serial.printf("[>>>] Sending COMM_IC_MANAGE (0x05) DELETE for card %s...\n", cardId.c_str());
    std::vector<uint8_t> frame = build_v3_frame(CMD_IC_MANAGE, delPayload, 5);
    pWriteChar->writeValue(frame.data(), frame.size(), true);

    std::vector<uint8_t> resp;
    bool ok = wait_and_decrypt_response(CMD_IC_MANAGE, resp, 5000);
    pClient->disconnect();
    return ok;
}

// Provision Passcode (4-9 digits, Permanent) to Lock over BLE
bool performAddPasscodeBLE(const String& passcode) {
    if (passcode.length() < 4 || passcode.length() > 9) return false;

    NimBLEClient* pClient = connectToLock();
    if (!pClient) return false;

    NimBLERemoteService* pService = pClient->getService(SERVICE_UUID);
    if (!pService) { pClient->disconnect(); return false; }

    NimBLERemoteCharacteristic* pWriteChar = pService->getCharacteristic(CHAR_WRITE_UUID);
    NimBLERemoteCharacteristic* pNotifyChar = pService->getCharacteristic(CHAR_NOTIFY_UUID);
    if (!pWriteChar || !pNotifyChar) { pClient->disconnect(); return false; }

    rxBuffer.clear();
    hasResponse = false;
    pNotifyChar->subscribe(true, notifyCallback);
    delay(150);

    // Payload: [0x02 (ADD), 0x01 (PERMANENT), len, ...ascii..., 0x00, 0x01, 0x1F, 0x0E, 0x00]
    std::vector<uint8_t> payload;
    payload.push_back(0x02); // ADD
    payload.push_back(0x01); // PERMANENT
    payload.push_back((uint8_t)passcode.length());
    for (size_t i = 0; i < passcode.length(); i++) {
        payload.push_back((uint8_t)passcode[i]);
    }
    // start_date "0001311400" -> {0, 1, 31, 14, 0}
    payload.push_back(0x00);
    payload.push_back(0x01);
    payload.push_back(0x1F);
    payload.push_back(0x0E);
    payload.push_back(0x00);

    Serial.printf("[>>>] Sending COMM_MANAGE_KEYBOARD_PASSWORD (0x03) ADD...\n");
    std::vector<uint8_t> frame = build_v3_frame(CMD_MANAGE_KEYBOARD_PASSWORD, payload.data(), payload.size());
    pWriteChar->writeValue(frame.data(), frame.size(), true);

    std::vector<uint8_t> resp;
    bool ok = wait_and_decrypt_response(CMD_MANAGE_KEYBOARD_PASSWORD, resp, 5000);
    pClient->disconnect();
    if (ok) {
        Serial.println("[+] Passcode successfully provisioned in lock memory!");
    } else {
        Serial.println("[-] Lock rejected passcode command!");
    }
    return ok;
}

// ============================================================================
// Lock State & Operation Logs Query over BLE
// ============================================================================
bool syncLockLogsBLE(String& outJson) {
    NimBLEClient* pClient = connectToLock();
    if (!pClient) return false;

    NimBLERemoteService* pService = pClient->getService(SERVICE_UUID);
    if (!pService) { pClient->disconnect(); return false; }

    NimBLERemoteCharacteristic* pWriteChar = pService->getCharacteristic(CHAR_WRITE_UUID);
    NimBLERemoteCharacteristic* pNotifyChar = pService->getCharacteristic(CHAR_NOTIFY_UUID);
    if (!pWriteChar || !pNotifyChar) { pClient->disconnect(); return false; }

    rxBuffer.clear();
    hasResponse = false;
    pNotifyChar->subscribe(true, notifyCallback);
    delay(150);

    JsonDocument doc;
    doc["status"] = "success";
    doc["action"] = "sync_lock_logs";

    // 1. Query State & Battery (0x14 - COMM_SEARCH_BICYCLE_STATUS)
    uint8_t statePayload[7] = {'S', 'C', 'I', 'E', 'N', 'E', 'R'};
    Serial.println("[>>>] Sending CMD_QUERY_STATE (0x14)...");
    std::vector<uint8_t> frameState = build_v3_frame(CMD_QUERY_STATE, statePayload, 7);
    pWriteChar->writeValue(frameState.data(), frameState.size(), true);

    std::vector<uint8_t> respState;
    if (wait_and_decrypt_response(CMD_QUERY_STATE, respState, 3500) && respState.size() >= 4) {
        int battery = respState[2];
        int lockState = respState[3]; // 0=LOCKED, 1=UNLOCKED
        doc["battery"] = battery;
        doc["lock_state"] = (lockState == 0) ? "locked" : ((lockState == 1) ? "unlocked" : "unknown");
        Serial.printf("[+] Lock State: %s | Battery: %d%%\n", (lockState == 0) ? "LOCKED" : "UNLOCKED", battery);
    } else {
        doc["battery"] = -1;
        doc["lock_state"] = "unknown";
    }

    // 2. Query Operation Logs (0x25 - COMM_GET_OPERATE_LOG) with multi-page support
    JsonArray records = doc["records"].to<JsonArray>();
    uint16_t nextSeq = 0xFFFF;
    int page = 0;
    std::set<uint16_t> seenSeqs;

    while (page < 20) {
        page++;
        uint8_t logPayload[2] = { (uint8_t)(nextSeq >> 8), (uint8_t)(nextSeq & 0xFF) };
        Serial.printf("[>>>] Sending CMD_GET_OPERATE_LOG (seq: 0x%04X, page: %d)...\n", nextSeq, page);
        std::vector<uint8_t> frameLog = build_v3_frame(CMD_GET_OPERATE_LOG, logPayload, 2);

        rxBuffer.clear();
        hasResponse = false;
        pWriteChar->writeValue(frameLog.data(), frameLog.size(), true);

        std::vector<uint8_t> respLog;
        bool logOk = wait_and_decrypt_response(CMD_GET_OPERATE_LOG, respLog, 2800);
        if (!logOk || respLog.size() < 6) {
            Serial.printf("[!] No log response for seq 0x%04X\n", nextSeq);
            break;
        }

        uint16_t totalLen = ((uint16_t)respLog[2] << 8) | respLog[3];
        uint16_t lastSeq = ((uint16_t)respLog[4] << 8) | respLog[5];
        if (page == 1) {
            doc["total_len"] = totalLen;
            doc["sequence"] = lastSeq;
        }
        Serial.printf("[+] Log page %d: totalLen=%d, lastSeq=%d, respBytes=%d\n", page, totalLen, lastSeq, respLog.size());

        if (totalLen == 0 || lastSeq == 0) {
            break;
        }

        size_t idx = 6;
        int recsInPage = 0;
        while (idx < respLog.size()) {
            uint8_t recLen = respLog[idx++];
            if (recLen == 0 || idx + recLen > respLog.size()) break;
            size_t recEnd = idx + recLen;

            uint8_t recType = respLog[idx++];
            int year = 2000 + respLog[idx++];
            int month = respLog[idx++];
            int day = respLog[idx++];
            int hour = respLog[idx++];
            int minute = respLog[idx++];
            int second = respLog[idx++];
            int recBattery = respLog[idx++];

            JsonObject r = records.add<JsonObject>();
            r["record_type"] = recType;
            r["battery"] = recBattery;

            char dateBuf[16], timeBuf[16], tsBuf[32];
            snprintf(dateBuf, sizeof(dateBuf), "%02d/%02d/%04d", day, month, year);
            snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d:%02d", hour, minute, second);
            snprintf(tsBuf, sizeof(tsBuf), "%04d-%02d-%02d %02d:%02d:%02d", year, month, day, hour, minute, second);
            r["date"] = String(dateBuf);
            r["time"] = String(timeBuf);
            r["timestamp"] = String(tsBuf);
            r["sequence"] = lastSeq;

            // Payload parsing
            if (recType == 17 || recType == 15 || recType == 18 || recType == 25 || recType == 35) {
                // IC Card
                uint32_t cardId = 0;
                for (size_t k = idx; k < recEnd; k++) {
                    cardId = (cardId << 8) | respLog[k];
                }
                r["card_id"] = String(cardId);
            } else if (recType == 4 || recType == 5 || recType == 6 || recType == 34 || recType == 92) {
                // Passcode
                if (idx < recEnd) {
                    uint8_t pLen = respLog[idx++];
                    String pwd = "";
                    for (size_t k = 0; k < pLen && idx < recEnd; k++) {
                        pwd += (char)respLog[idx++];
                    }
                    r["passcode"] = pwd;
                }
            } else if (recType == 1 || recType == 26 || recType == 28) {
                // App / BLE / Gateway
                if (recEnd - idx >= 4) {
                    uint32_t uid = ((uint32_t)respLog[idx] << 24) | ((uint32_t)respLog[idx+1] << 16) | ((uint32_t)respLog[idx+2] << 8) | respLog[idx+3];
                    r["uid"] = uid;
                }
            }
            idx = recEnd;
            recsInPage++;
        }

        if (recsInPage == 0) break;
        if (seenSeqs.count(lastSeq)) break;
        seenSeqs.insert(lastSeq);

        if (lastSeq == nextSeq) break;
        nextSeq = lastSeq;
    }

    pClient->disconnect();
    serializeJson(doc, outJson);
    return true;
}

// ============================================================================
// Persistent Storage (Preferences / NVS)
// ============================================================================
Preferences prefs;

String getCardsJson() {
    prefs.begin("resortos", false);
    String json = prefs.getString("cards", "");
    prefs.end();
    if (json.isEmpty() || json == "null") {
        return "[]";
    }
    return json;
}

void saveCardsJson(const String& json) {
    prefs.begin("resortos", false);
    prefs.putString("cards", json);
    prefs.end();
}

String getCurrentDateTime() {
    time_t now = time(nullptr);
    struct tm timeinfo;
    char buf[32];
    if (localtime_r(&now, &timeinfo) && timeinfo.tm_year > 120) {
        strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M", &timeinfo);
        return String(buf);
    }
    return "2026-10-07 10:45";
}

// ============================================================================
// Web Server & REST API
// ============================================================================
WebServer server(80);

void setCORS() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleOptions() {
    setCORS();
    server.send(204);
}

const char HTML_PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ResortOS - בקר חדר חכם ומנעול BLE</title>
    <style>
        :root {
            --primary: #2563eb;
            --primary-hover: #1d4ed8;
            --bg: #0f172a;
            --card: #1e293b;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --accent-green: #10b981;
            --accent-red: #ef4444;
            --accent-blue: #38bdf8;
            --accent-yellow: #f59e0b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
        body { background: var(--bg); color: var(--text); padding: 24px 16px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
        .container { width: 100%; max-width: 500px; }
        header { text-align: center; margin-bottom: 24px; }
        h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px; }
        .subtitle { color: var(--text-muted); font-size: 14px; }
        .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-top: 8px; border: 1px solid rgba(16, 185, 129, 0.3); }
        .pulse-dot { width: 8px; height: 8px; background: #34d399; border-radius: 50%; box-shadow: 0 0 8px #34d399; }
        .card { background: var(--card); border-radius: 18px; padding: 20px; margin-bottom: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); }
        .card-title { font-size: 16px; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
        .btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        button { background: var(--primary); color: white; border: none; border-radius: 12px; padding: 14px 12px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
        button:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.1); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        button.btn-unlock { background: linear-gradient(135deg, #059669, #10b981); }
        button.btn-lock { background: linear-gradient(135deg, #dc2626, #ef4444); }
        button.btn-full { grid-column: span 2; }
        .input-group { display: flex; gap: 8px; margin-top: 8px; }
        input { flex: 1; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; padding: 12px; color: white; font-size: 15px; }
        input:focus { outline: none; border-color: var(--primary); }
        #status-box { background: rgba(15, 23, 42, 0.8); border-radius: 12px; padding: 14px; margin-top: 16px; font-size: 14px; color: var(--text-muted); min-height: 52px; border: 1px solid rgba(255,255,255,0.05); line-height: 1.5; }
        .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 0.8s linear infinite; vertical-align: middle; margin-left: 6px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes asset-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .tag-blink { animation: asset-blink 1s ease-in-out infinite; }
        
        /* Card Items */
        .card-row { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .card-meta { display: flex; flex-direction: column; gap: 3px; }
        .card-name { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 6px; }
        .card-details { font-size: 12px; color: var(--text-muted); }
        .card-actions { display: flex; gap: 6px; align-items: center; }
        .tag-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
        .btn-sm { padding: 6px 10px; font-size: 12px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>ResortOS Gateway</h1>
            <div class="subtitle">בקר חומרה ESP32-S3 | משרד ראשי</div>
            <div class="badge">
                <span class="pulse-dot"></span>
                <span>חיבור מקומי מאובטח (WiFi & BLE)</span>
            </div>
        </header>

        <!-- Lock Control -->
        <div class="card">
            <div class="card-title">🔐 מנעול חכם (Mate - TTLock BLE)</div>
            <div class="btn-grid">
                <button class="btn-unlock ctrl-btn" onclick="callApi('/unlock', 'פתח מנעול')">
                    <span style="font-size:20px;">🔓</span> פתח מנעול
                </button>
                <button class="btn-lock ctrl-btn" onclick="callApi('/lock', 'נעל דלת')">
                    <span style="font-size:20px;">🔒</span> נעל דלת
                </button>
            </div>
        </div>

        <!-- IC Card Management Section -->
        <div class="card">
            <div class="card-title">💳 ניהול מפתחות פיזיים (IC Cards / צ'יפים)</div>
            <div class="input-group">
                <input type="text" id="card-name-input" placeholder="שם המפתח (למשל: מפתח חדרנית)">
                <button class="ctrl-btn" style="padding: 12px 16px; background: #2563eb;" onclick="addNewCard()">
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
        </div>

        <!-- Asset Anti-Theft Protection -->
        <div class="card">
            <div class="card-title">🛡️ אבטחת נכסים ומניעת גניבות (nRF52810 Beacons)</div>
            <div class="input-group">
                <input type="text" id="asset-name-input" placeholder="שם המכשיר (למשל: סודסטרים)" style="flex:1;">
                <input type="text" id="asset-mac-input" placeholder="כתובת MAC (למשל: fb:d0:1a:46:8d:59)" style="flex:1; font-family:monospace; font-size:13px;">
                <button class="ctrl-btn" style="padding: 12px 16px; background: #059669;" onclick="addNewAsset()">
                    <span>➕ הצמד</span>
                </button>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                <span style="font-size: 12px; color: var(--text-muted);">
                    💡 ירוק בתוך החדר, צהוב בחצר או בחניה, אדום כשהאות נעלם
                </span>
                <button class="btn-sm" style="background:#334155;" onclick="scanNearbyBeacons()">
                    🔍 סרוק ביקונים
                </button>
            </div>

            <!-- Dynamic List of Assets -->
            <div id="assets-container" style="margin-top: 14px;">
                <div style="text-align:center; color: var(--text-muted); font-size: 13px; padding: 12px;">טוען נכסים מאובטחים...</div>
            </div>
            <div id="beacon-scan-results" style="display:none; margin-top:12px; background:rgba(15,23,42,0.8); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:12px; font-size:12px;"></div>
        </div>

        <div id="status-box">מוכן לפקודה...</div>
    </div>

    <script>
        function setDisabled(d) {
            document.querySelectorAll('.ctrl-btn, .btn-sm').forEach(b => b.disabled = d);
        }

        async function callApi(url, label) {
            setDisabled(true);
            const sb = document.getElementById('status-box');
            sb.innerHTML = `<span class="spinner"></span> <b>משדר פקודה למנעול (${label})...</b>`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.status === 'success') {
                    sb.innerHTML = `<b style="color:#10b981;">✅ ${label} בוצע בהצלחה!</b>`;
                } else {
                    sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאה בביצוע פקודת ${label}</span>`;
                }
            } catch (e) {
                sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאת תקשורת: ${e}</span>`;
            } finally {
                setDisabled(false);
            }
        }

        async function loadCards() {
            const container = document.getElementById('cards-container');
            try {
                const res = await fetch('/api/cards');
                const cards = await res.json();
                if (!Array.isArray(cards) || cards.length === 0) {
                    container.innerHTML = '<div style="text-align:center; color: var(--text-muted); font-size: 13px; padding: 12px; border: 1px dashed rgba(255,255,255,0.1); border-radius: 10px;">אין מפתחות פיזיים מוגדרים עדיין</div>';
                    return;
                }
                let html = '';
                cards.forEach(c => {
                    const activeColor = c.active ? 'background: rgba(16,185,129,0.2); color:#34d399;' : 'background: rgba(148,163,184,0.2); color:#94a3b8;';
                    const activeText = c.active ? 'פעיל' : 'מושבת';
                    html += `
                    <div class="card-row">
                        <div class="card-meta">
                            <div class="card-name">
                                <span>🏷️</span> <span>${c.name}</span>
                                <span class="tag-badge" style="${activeColor}">${activeText}</span>
                            </div>
                            <div class="card-details">
                                מזהה צ'יפ: <code style="color:#38bdf8;">${c.cardId}</code> | נוסף: ${c.addedAt || 'לא ידוע'}
                            </div>
                        </div>
                        <div class="card-actions">
                            <button class="btn-sm" style="background:${c.active ? '#334155' : '#059669'};" onclick="toggleCard('${c.cardId}', ${!c.active})" title="${c.active ? 'השבת מפתח' : 'הפעל מפתח'}">
                                ${c.active ? '⏸️' : '▶️'}
                            </button>
                            <button class="btn-sm" style="background:#3b82f6;" onclick="renameCard('${c.cardId}', '${c.name}')" title="ערוך שם">
                                ✏️
                            </button>
                            <button class="btn-sm" style="background:#dc2626;" onclick="deleteCard('${c.cardId}')" title="מחק מפתח">
                                🗑️
                            </button>
                        </div>
                    </div>`;
                });
                container.innerHTML = html;
            } catch (e) {
                container.innerHTML = `<div style="color:#ef4444; font-size: 12px;">שגיאה בטעינת מפתחות: ${e}</div>`;
            }
        }

        async function addNewCard() {
            const input = document.getElementById('card-name-input');
            const name = input.value.trim();
            if (!name) {
                alert('אנא הזן שם למפתח (למשל: מפתח חדרנית)');
                return;
            }
            setDisabled(true);
            const sb = document.getElementById('status-box');
            sb.innerHTML = `<span class="spinner"></span> <b>המנעול בצפצוף למידה!</b><br><span style="color:#f59e0b;">העבר כעת את הצ'יפ על המנעול תוך 15 שניות...</span>`;
            try {
                const res = await fetch('/api/cards/add', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name: name })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    sb.innerHTML = `<b style="color:#10b981;">🎉 המפתח '${data.card.name}' (צ'יפ ${data.card.cardId}) נשמר בהצלחה!</b>`;
                    input.value = '';
                    await loadCards();
                } else {
                    sb.innerHTML = `<span style="color:#ef4444;">❌ לא נקלט צ'יפ במנעול: ${data.message || 'פסק זמן'}</span>`;
                }
            } catch (e) {
                sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאת תקשורת: ${e}</span>`;
            } finally {
                setDisabled(false);
            }
        }

        async function toggleCard(cardId, newStatus) {
            setDisabled(true);
            const sb = document.getElementById('status-box');
            sb.innerHTML = `<span class="spinner"></span> מעדכן סטטוס מפתח...`;
            try {
                const res = await fetch('/api/cards/update', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ cardId: cardId, active: newStatus })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    sb.innerHTML = `<b style="color:#10b981;">✅ סטטוס המפתח עודכן!</b>`;
                    await loadCards();
                } else {
                    sb.innerHTML = `<span style="color:#ef4444;">❌ עדכון נכשל</span>`;
                }
            } catch (e) {
                sb.innerHTML = `<span style="color:#ef4444;">❌ שגיאה: ${e}</span>`;
            } finally {
                setDisabled(false);
            }
        }

        async function renameCard(cardId, oldName) {
            const newName = prompt('הזן שם מעודכן למפתח:', oldName);
            if (!newName || newName.trim() === '' || newName === oldName) return;
            setDisabled(true);
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
                setDisabled(false);
            }
        }

        async function deleteCard(cardId) {
            if (!confirm(`האם אתה בטוח שברצונך למחוק ולבטל את מפתח ${cardId}?`)) return;
            setDisabled(true);
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
                setDisabled(false);
            }
        }

        async function loadAssets() {
            const container = document.getElementById('assets-container');
            try {
                const res = await fetch('/api/assets');
                const data = await res.json();
                if (!data || !data.assets || data.assets.length === 0) {
                    container.innerHTML = '<div style="text-align:center; color: var(--text-muted); font-size: 13px; padding: 12px; border: 1px dashed rgba(255,255,255,0.1); border-radius: 10px;">אין נכסים מוגנים כרגע</div>';
                    return;
                }
                let html = '';
                data.assets.forEach(a => {
                    const status = a.status || (a.is_present ? 'SAFE' : 'ALERT_MISSING');
                    const place = status === 'SAFE'
                        ? 'בתוך החדר'
                        : (status === 'SUSPECT_OUTSIDE' ? 'מחוץ לבקתה / בחניה' : 'נותק / לא זוהה');
                    const badgeBg = status === 'SAFE'
                        ? 'background: rgba(16,185,129,0.2); color:#34d399;'
                        : (status === 'SUSPECT_OUTSIDE'
                            ? 'background: rgba(245,158,11,0.22); color:#fbbf24; border: 1px solid #f59e0b;'
                            : 'background: rgba(239,68,68,0.25); color:#f87171; border: 1px solid #ef4444;');
                    const badgeText = status === 'SAFE' ? '🟢 בטוח' : (status === 'SUSPECT_OUTSIDE' ? '🟡 חשד ליציאה' : '🔴 נותק');
                    const blink = status === 'ALERT_MISSING' ? ' tag-blink' : '';
                    const rowStyle = status === 'ALERT_MISSING'
                        ? 'border: 1px solid rgba(239,68,68,0.5); background: rgba(239,68,68,0.08);'
                        : (status === 'SUSPECT_OUTSIDE' ? 'border: 1px solid rgba(245,158,11,0.45); background: rgba(245,158,11,0.08);' : '');
                    const icon = (a.name.includes('סודה') || a.name.includes('סודסטרים')) ? '🥤' : '🏷️';
                    const smooth = (typeof a.rssi_smooth === 'number') ? a.rssi_smooth.toFixed(1) : '—';
                    const lastSeenText = a.last_seen_sec <= 3 ? 'כרגע' : `לפני ${a.last_seen_sec} שנ\'`;
                    html += `
                    <div class="card-row" style="${rowStyle}">
                        <div class="card-meta">
                            <div class="card-name">
                                <span>${icon}</span> <span>${a.name}</span>
                                <span class="tag-badge${blink}" style="${badgeBg}">${badgeText}</span>
                            </div>
                            <div class="card-details" style="color:#e2e8f0; font-weight:700;">${place}</div>
                            <div class="card-details">
                                MAC: <code style="color:#38bdf8;">${a.mac}</code> | ממוצע: <b>${smooth} dBm</b> | רגעי: ${a.rssi} | אות אחרון: ${lastSeenText}
                            </div>
                        </div>
                        <div class="card-actions">
                            <button class="btn-sm" style="background:#dc2626;" onclick="deleteAsset('${a.mac}')" title="הסר מכשיר">
                                🗑️
                            </button>
                        </div>
                    </div>`;
                });
                container.innerHTML = html;
            } catch (e) {
                console.error('Failed to load assets', e);
            }
        }

        async function addNewAsset() {
            const nameInput = document.getElementById('asset-name-input');
            const macInput = document.getElementById('asset-mac-input');
            const name = nameInput.value.trim();
            const mac = macInput.value.trim();
            if (!name || !mac) {
                alert('אנא הזן שם מכשיר וכתובת MAC');
                return;
            }
            try {
                const res = await fetch('/api/assets', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name, mac, timeout_sec: 35})
                });
                const data = await res.json();
                if (data.status === 'success') {
                    nameInput.value = '';
                    macInput.value = '';
                    loadAssets();
                } else {
                    alert('שגיאה: ' + (data.message || 'לא ניתן להוסיף'));
                }
            } catch (e) {
                alert('שגיאת תקשורת: ' + e);
            }
        }

        async function deleteAsset(mac) {
            if (!confirm(`האם להסיר את המכשיר (${mac}) מרשימת המעקב?`)) return;
            try {
                const res = await fetch('/api/assets/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({mac})
                });
                loadAssets();
            } catch (e) {
                alert('שגיאה: ' + e);
            }
        }

        async function scanNearbyBeacons() {
            const box = document.getElementById('beacon-scan-results');
            box.style.display = 'block';
            box.innerHTML = '<span>🔍 סורק ביקונים בלוטוס בסביבה (3 שניות)...</span>';
            try {
                const res = await fetch('/api/ble/scan');
                const data = await res.json();
                if (!data.devices || data.devices.length === 0) {
                    box.innerHTML = '<span>לא נמצאו מכשירי BLE בסביבה</span>';
                    return;
                }
                let html = '<b>תוצאות סריקה (לחץ על כתובת להזנה מהירה):</b><br><div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">';
                data.devices.forEach(d => {
                    const dName = d.name || '(ללא שם)';
                    html += `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:6px; cursor:pointer;" onclick="document.getElementById('asset-mac-input').value='${d.addr}'; if(!document.getElementById('asset-name-input').value) document.getElementById('asset-name-input').value='${dName}';">
                        <span><b>${dName}</b> <code>${d.addr}</code></span>
                        <span style="color:#34d399;">${d.rssi} dBm</span>
                    </div>`;
                });
                html += '</div>';
                box.innerHTML = html;
            } catch (e) {
                box.innerHTML = '<span>שגיאה בסריקה: ' + e + '</span>';
            }
        }

        // Load cards and assets on startup
        loadCards();
        loadAssets();
        setInterval(loadAssets, 3000);
    </script>
</body>
</html>
)rawliteral";

// ============================================================================
// Endpoint Handlers
// ============================================================================
void handleRoot() {
    setCORS();
    server.send(200, "text/html", HTML_PAGE);
}

void handleUnlock() {
    setCORS();
    NimBLEClient* pClient = connectToLock();
    if (!pClient) {
        server.send(500, "application/json", "{\"status\":\"error\",\"message\":\"BLE connect failed\"}");
        return;
    }
    bool ok = performLockAction(pClient, CMD_UNLOCK);
    pClient->disconnect();
    bleOpBusy = false;
    if (ok) {
        server.send(200, "application/json", "{\"status\":\"success\",\"action\":\"unlock\"}");
    } else {
        server.send(500, "application/json", "{\"status\":\"error\",\"action\":\"unlock\"}");
    }
}

void handleLock() {
    setCORS();
    NimBLEClient* pClient = connectToLock();
    if (!pClient) {
        server.send(500, "application/json", "{\"status\":\"error\",\"message\":\"BLE connect failed\"}");
        return;
    }
    bool ok = performLockAction(pClient, CMD_LOCK);
    pClient->disconnect();
    bleOpBusy = false;
    if (ok) {
        server.send(200, "application/json", "{\"status\":\"success\",\"action\":\"lock\"}");
    } else {
        server.send(500, "application/json", "{\"status\":\"error\",\"action\":\"lock\"}");
    }
}

void handleGetCards() {
    setCORS();
    String json = getCardsJson();
    server.send(200, "application/json", json);
}

void handleAddCard() {
    setCORS();
    String body = server.arg("plain");
    String cardName = "מפתח חדש";

    if (!body.isEmpty()) {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, body);
        if (!err && doc["name"].is<const char*>()) {
            cardName = doc["name"].as<String>();
        }
    } else if (server.hasArg("name")) {
        cardName = server.arg("name");
    }

    String learnedCardId = "";
    bool success = performAddCardBLE(learnedCardId, 20000);

    if (!success || learnedCardId.isEmpty()) {
        server.send(408, "application/json", "{\"status\":\"error\",\"message\":\"לא זוהה כרטיס במנעול - פסק זמן לקריאה\"}");
        return;
    }

    // Save to persistent registry
    String cardsJson = getCardsJson();
    JsonDocument doc;
    deserializeJson(doc, cardsJson);
    JsonArray arr = doc.as<JsonArray>();

    JsonObject newCard = arr.add<JsonObject>();
    newCard["cardId"] = learnedCardId;
    newCard["name"] = cardName;
    newCard["active"] = true;
    newCard["addedAt"] = getCurrentDateTime();

    String updatedJson;
    serializeJson(doc, updatedJson);
    saveCardsJson(updatedJson);

    JsonDocument respDoc;
    respDoc["status"] = "success";
    JsonObject cObj = respDoc["card"].to<JsonObject>();
    cObj["cardId"] = learnedCardId;
    cObj["name"] = cardName;
    cObj["active"] = true;
    cObj["addedAt"] = newCard["addedAt"];

    String respStr;
    serializeJson(respDoc, respStr);
    server.send(200, "application/json", respStr);
}

void handleUpdateCard() {
    setCORS();
    String body = server.arg("plain");
    if (body.isEmpty()) {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Empty body\"}");
        return;
    }

    JsonDocument doc;
    if (deserializeJson(doc, body)) {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid JSON\"}");
        return;
    }

    if (!doc["cardId"].is<const char*>()) {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing cardId\"}");
        return;
    }

    String cardId = doc["cardId"].as<String>();
    String cardsJson = getCardsJson();
    JsonDocument listDoc;
    deserializeJson(listDoc, cardsJson);
    JsonArray arr = listDoc.as<JsonArray>();

    bool found = false;
    for (JsonObject c : arr) {
        if (c["cardId"].as<String>() == cardId) {
            found = true;
            if (doc["name"].is<const char*>()) {
                c["name"] = doc["name"].as<String>();
            }
            if (doc["active"].is<bool>()) {
                c["active"] = doc["active"].as<bool>();
            }
            break;
        }
    }

    if (!found) {
        server.send(404, "application/json", "{\"status\":\"error\",\"message\":\"Card not found\"}");
        return;
    }

    String updatedJson;
    serializeJson(listDoc, updatedJson);
    saveCardsJson(updatedJson);

    server.send(200, "application/json", "{\"status\":\"success\"}");
}

void handleDeleteCard() {
    setCORS();
    String body = server.arg("plain");
    String cardId = "";

    if (!body.isEmpty()) {
        JsonDocument doc;
        if (!deserializeJson(doc, body) && doc["cardId"].is<const char*>()) {
            cardId = doc["cardId"].as<String>();
        }
    } else if (server.hasArg("cardId")) {
        cardId = server.arg("cardId");
    }

    if (cardId.isEmpty()) {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing cardId\"}");
        return;
    }

    // Attempt BLE deletion from Lock
    performDeleteCardBLE(cardId);

    // Remove from persistent storage
    String cardsJson = getCardsJson();
    JsonDocument listDoc;
    deserializeJson(listDoc, cardsJson);
    JsonArray arr = listDoc.as<JsonArray>();

    JsonDocument newDoc;
    JsonArray newArr = newDoc.to<JsonArray>();
    for (JsonObject c : arr) {
        if (c["cardId"].as<String>() != cardId) {
            newArr.add(c);
        }
    }

    String updatedJson;
    serializeJson(newDoc, updatedJson);
    saveCardsJson(updatedJson);

    server.send(200, "application/json", "{\"status\":\"success\"}");
}

// ============================================================================
// mmWave Human Presence Radar (Hi-Link HLK-LD2410C)
// ============================================================================
#define RADAR_RX_PIN 18  // ESP32 RX <- LD2410C TX
#define RADAR_TX_PIN 17  // ESP32 TX -> LD2410C RX
static HardwareSerial radarSerial(1);
static ld2410 radar;
static int radarRxPin = RADAR_RX_PIN;
static int radarTxPin = RADAR_TX_PIN;
static uint32_t radarBaud = 256000;




// ============================================================================
// IR Hardware & Appliances Controller
// ============================================================================
#define IR_TX_PIN 4
static IRsend irsend(IR_TX_PIN);
static IRTcl112Ac tclAc(IR_TX_PIN);

static bool irBlinkActive = false;
static unsigned long lastIrBlink = 0;
static bool irPinState = false;
static float currentAcTemp = 24.0f;

// ============================================================================
// Extended WebServer HTTP Handlers (For Remote WiFi Access from Mac Studio)
// ============================================================================
void handleAcTemp() {
    setCORS();
    float temp = 24.0f;
    String body = server.arg("plain");
    if (!body.isEmpty()) {
        JsonDocument doc;
        if (!deserializeJson(doc, body) && doc["temp"].is<float>()) {
            temp = doc["temp"].as<float>();
        }
    } else if (server.hasArg("temp")) {
        temp = server.arg("temp").toFloat();
    }
    if (temp < 16.0f) temp = 16.0f;
    if (temp > 30.0f) temp = 30.0f;
    currentAcTemp = temp;

    irBlinkActive = false;
    Serial.printf("[HTTP] TCL AC: ON, COOL, %.1f C\n", temp);
    tclAc.on();
    tclAc.setPower(true);
    tclAc.setMode(kTcl112AcCool);
    tclAc.setTemp(temp);
    tclAc.setFan(kTcl112AcFanAuto);
    tclAc.send();

    char resp[256];
    snprintf(resp, sizeof(resp),
        "{\"status\":\"success\",\"action\":\"ir_ac_temp\",\"device\":\"tcl_ac\",\"temp\":%.1f,\"mode\":\"cool\",\"feedback\":\"ir_transmitted\",\"note\":\"IR signal sent. Verify audible beep from AC\"}",
        temp);
    server.send(200, "application/json", resp);
}

void handleAcOff() {
    setCORS();
    irBlinkActive = false;
    Serial.println("[HTTP] TCL AC: POWER OFF");
    tclAc.off();
    tclAc.setPower(false);
    tclAc.send();

    server.send(200, "application/json",
        "{\"status\":\"success\",\"action\":\"ir_ac_off\",\"device\":\"tcl_ac\",\"power\":false,\"feedback\":\"ir_transmitted\",\"note\":\"IR power-off signal sent. Verify audible beep from AC\"}");
}

static const uint32_t kSamsungTvPowerToggle = 0xE0E040BF;
static const uint32_t kSamsungTvPowerOn = 0xE0E09966;
static const uint32_t kSamsungTvPowerOff = 0xE0E019E6;

static void sendSamsungTv(uint32_t code) {
    irBlinkActive = false;
    digitalWrite(IR_TX_PIN, LOW);
    irsend.sendSAMSUNG(code, 32, 2);
}

void handleTvPower() {
    setCORS();
    String power = "";
    String body = server.arg("plain");
    if (!body.isEmpty()) {
        JsonDocument doc;
        if (!deserializeJson(doc, body) && doc["power"].is<const char*>()) {
            power = doc["power"].as<String>();
        }
    }
    power.toLowerCase();
    uint32_t code = kSamsungTvPowerToggle;
    const char* which = "toggle";
    if (power == "off") {
        code = kSamsungTvPowerOff;
        which = "off";
    } else if (power == "on") {
        code = kSamsungTvPowerOn;
        which = "on";
    }
    Serial.printf("[HTTP] Samsung TV power %s\n", which);
    sendSamsungTv(code);

    char resp[180];
    snprintf(resp, sizeof(resp),
        "{\"status\":\"success\",\"action\":\"ir_tv_power\",\"device\":\"samsung_tv\",\"power\":\"%s\",\"feedback\":\"ir_transmitted\"}",
        which);
    server.send(200, "application/json", resp);
}

void handleAddPasscode() {
    setCORS();
    String code = "";
    String body = server.arg("plain");
    if (!body.isEmpty()) {
        JsonDocument doc;
        if (!deserializeJson(doc, body) && doc["code"].is<const char*>()) {
            code = doc["code"].as<String>();
        }
    } else if (server.hasArg("code")) {
        code = server.arg("code");
    }

    if (code.length() < 4 || code.length() > 9) {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Passcode must be 4 to 9 digits\"}");
        return;
    }

    Serial.println("[HTTP] Adding passcode via BLE...");
    bool ok = performAddPasscodeBLE(code);
    if (ok) {
        server.send(200, "application/json", "{\"status\":\"success\",\"action\":\"add_passcode\"}");
    } else {
        server.send(500, "application/json", "{\"status\":\"error\",\"message\":\"Lock rejected passcode\"}");
    }
}

void handleStatus() {
    setCORS();
    char resp[256];
    snprintf(resp, sizeof(resp),
        "{\"status\":\"success\",\"action\":\"status\",\"gateway\":\"online\",\"transport\":\"wifi\",\"ip\":\"%s\",\"mac\":\"%s\"}",
        WiFi.localIP().toString().c_str(), WiFi.macAddress().c_str());
    server.send(200, "application/json", resp);
}

void handleLockSync() {
    setCORS();
    String respJson;
    bool ok = syncLockLogsBLE(respJson);
    if (ok) {
        server.send(200, "application/json", respJson);
    } else {
        server.send(500, "application/json", "{\"status\":\"error\",\"message\":\"Failed to communicate with lock\"}");
    }
}

void handleRadar() {
    setCORS();
    radar.read();
    JsonDocument doc;
    doc["status"] = "success";
    bool conn = radar.isConnected();
    bool pres = radar.presenceDetected();
    doc["connected"] = conn;
    doc["presence"] = pres;

    String state = "clear";
    if (radar.movingTargetDetected() && radar.stationaryTargetDetected()) state = "both";
    else if (radar.movingTargetDetected()) state = "moving";
    else if (radar.stationaryTargetDetected()) state = "stationary";
    doc["state"] = state;

    JsonObject moving = doc["moving_target"].to<JsonObject>();
    moving["detected"] = radar.movingTargetDetected();
    moving["distance_cm"] = radar.movingTargetDistance();
    moving["energy"] = radar.movingTargetEnergy();

    JsonObject stat = doc["stationary_target"].to<JsonObject>();
    stat["detected"] = radar.stationaryTargetDetected();
    stat["distance_cm"] = radar.stationaryTargetDistance();
    stat["energy"] = radar.stationaryTargetEnergy();

    doc["rx_pin"] = radarRxPin;
    doc["tx_pin"] = radarTxPin;
    doc["baud"] = radarBaud;
    doc["gpio18"] = digitalRead(18);
    doc["gpio17"] = digitalRead(17);
    doc["gpio16"] = digitalRead(16);
    doc["gpio15"] = digitalRead(15);
    doc["gpio4"] = digitalRead(4);
    doc["gpio5"] = digitalRead(5);
    doc["gpio6"] = digitalRead(6);
    doc["gpio7"] = digitalRead(7);
    doc["gpio8"] = digitalRead(8);

    String resp;
    serializeJson(doc, resp);
    server.send(200, "application/json", resp);
}


// ============================================================================
// BLE Asset Anti-Theft Engine (Nordic nRF52810 Beacons)
// ============================================================================
struct TrackedAsset {
    String mac;
    String name;
    String assetType;
    int lastRssi;
    float rssiSmooth;
    int rssiRing[5];
    uint8_t rssiCount;
    uint8_t rssiPos;
    unsigned long lastSeenMs;
    unsigned long suspectSinceMs;
    unsigned long weakSinceMs;
    unsigned long safeSinceMs;
    int timeoutSec;
    uint8_t statusCode;
    char status[20];
};

static const float RSSI_SAFE_ABOVE = -78.0f;
static const float RSSI_SUSPECT_HIGH = -79.0f;
static const float RSSI_SUSPECT_LOW = -88.0f;
static const float RSSI_MISSING_AT = -89.0f;
static const unsigned long SUSPECT_HOLD_MS = 15000;
static unsigned long g_assetsBootMs = 0;

static const char* assetStatusText(uint8_t code) {
    if (code == 1) return "SUSPECT_OUTSIDE";
    if (code == 2) return "ALERT_MISSING";
    return "SAFE";
}

static void setAssetStatus(TrackedAsset& asset, uint8_t code) {
    asset.statusCode = code;
    strncpy(asset.status, assetStatusText(code), sizeof(asset.status) - 1);
    asset.status[sizeof(asset.status) - 1] = '\0';
}

static void initAssetRuntime(TrackedAsset& asset) {
    asset.lastRssi = -99;
    asset.rssiSmooth = -99.0f;
    asset.rssiCount = 0;
    asset.rssiPos = 0;
    asset.lastSeenMs = 0;
    asset.suspectSinceMs = 0;
    asset.weakSinceMs = 0;
    asset.safeSinceMs = 0;
    for (int i = 0; i < 5; i++) asset.rssiRing[i] = -99;
    setAssetStatus(asset, 0);
}

static void pushRssiSample(TrackedAsset& asset, int rssi) {
    asset.lastRssi = rssi;
    asset.lastSeenMs = millis();
    asset.rssiRing[asset.rssiPos] = rssi;
    asset.rssiPos = (asset.rssiPos + 1) % 5;
    if (asset.rssiCount < 5) asset.rssiCount++;
    int sum = 0;
    for (uint8_t i = 0; i < asset.rssiCount; i++) sum += asset.rssiRing[i];
    asset.rssiSmooth = (float)sum / (float)asset.rssiCount;
}

static void refreshAssetStatus(TrackedAsset& asset, unsigned long now) {
    const unsigned long timeoutMs = (unsigned long)asset.timeoutSec * 1000UL;
    const unsigned long anchor = asset.lastSeenMs == 0 ? g_assetsBootMs : asset.lastSeenMs;
    const bool heard = asset.lastSeenMs != 0 && (now - asset.lastSeenMs) <= timeoutMs;
    if (anchor != 0 && (now - anchor) > timeoutMs) {
        setAssetStatus(asset, 2);
        asset.suspectSinceMs = 0;
        asset.weakSinceMs = 0;
        asset.safeSinceMs = 0;
        return;
    }
    if (!heard) {
        setAssetStatus(asset, 0);
        return;
    }
    if (asset.rssiCount < 5) return;

    const float smooth = asset.rssiSmooth;
    if (smooth > RSSI_SAFE_ABOVE) {
        setAssetStatus(asset, 0);
        asset.weakSinceMs = 0;
        asset.suspectSinceMs = 0;
        asset.safeSinceMs = 0;
        return;
    }

    asset.safeSinceMs = 0;
    if (smooth <= RSSI_MISSING_AT) {
        asset.suspectSinceMs = 0;
        if (asset.weakSinceMs == 0) asset.weakSinceMs = now;
        if (now - asset.weakSinceMs >= timeoutMs) setAssetStatus(asset, 2);
        else if (now - asset.weakSinceMs >= SUSPECT_HOLD_MS && asset.statusCode == 0) setAssetStatus(asset, 1);
        return;
    }
    if (smooth <= RSSI_SUSPECT_HIGH && smooth >= RSSI_SUSPECT_LOW) {
        asset.weakSinceMs = 0;
        if (asset.suspectSinceMs == 0) asset.suspectSinceMs = now;
        if (now - asset.suspectSinceMs >= SUSPECT_HOLD_MS && asset.statusCode == 0) setAssetStatus(asset, 1);
    }
}

static std::vector<TrackedAsset> g_assets;
static Preferences assetPrefs;

void saveAssetsToNVS() {
    assetPrefs.begin("assets_nvs", false);
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    for (const auto& a : g_assets) {
        JsonObject obj = arr.add<JsonObject>();
        obj["mac"] = a.mac;
        obj["name"] = a.name;
        obj["asset_type"] = a.assetType;
        obj["timeout_sec"] = a.timeoutSec;
    }
    String out;
    serializeJson(doc, out);
    assetPrefs.putString("list", out);
    assetPrefs.end();
}

void loadAssetsFromNVS() {
    if (g_assetsBootMs == 0) g_assetsBootMs = millis();
    assetPrefs.begin("assets_nvs", false);
    String jsonStr = assetPrefs.getString("list", "");
    assetPrefs.end();

    g_assets.clear();
    if (jsonStr.length() > 0) {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, jsonStr);
        if (!err && doc.is<JsonArray>()) {
            for (JsonObject obj : doc.as<JsonArray>()) {
                TrackedAsset a;
                a.mac = obj["mac"].as<String>();
                a.mac.toLowerCase();
                a.name = obj["name"].as<String>();
                a.assetType = obj["asset_type"] | "";
                if (a.assetType.length() == 0) {
                    a.assetType = (a.name.indexOf("סוד") >= 0) ? "kitchen_portable" : "appliances";
                }
                a.timeoutSec = obj["timeout_sec"] | 35;
                initAssetRuntime(a);
                g_assets.push_back(a);
            }
        }
    }

    // Default seed: Sodastream beacon (Holy-IOT nRF52810) if list is empty
    if (g_assets.empty()) {
        TrackedAsset soda;
        soda.mac = "fb:d0:1a:46:8d:59";
        soda.name = "סודסטרים";
        soda.assetType = "kitchen_portable";
        soda.timeoutSec = 35;
        initAssetRuntime(soda);
        g_assets.push_back(soda);
        saveAssetsToNVS();
        Serial.println("[Assets] Seeded 'סודסטרים' (fb:d0:1a:46:8d:59) into NVS.");
    } else {
        Serial.printf("[Assets] Loaded %d tracked assets from NVS.\n", (int)g_assets.size());
    }
}

class AssetScanCallbacks : public NimBLEAdvertisedDeviceCallbacks {
    void onResult(NimBLEAdvertisedDevice* dev) override {
        String addr = dev->getAddress().toString().c_str();
        addr.toLowerCase();
        int rssi = dev->getRSSI();
        unsigned long now = millis();

        for (auto& a : g_assets) {
            String targetMac = a.mac;
            targetMac.toLowerCase();
            if (addr == targetMac) {
                pushRssiSample(a, rssi);
                refreshAssetStatus(a, now);
            }
        }
    }
};
static AssetScanCallbacks assetScanCallbacks;

void assetScanTask(void* pvParameters) {
    vTaskDelay(pdMS_TO_TICKS(3500));
    while (true) {
        if (bleOpBusy) {
            const unsigned long paused = millis();
            for (auto& asset : g_assets) {
                if (asset.lastSeenMs != 0) asset.lastSeenMs = paused;
                asset.weakSinceMs = 0;
                asset.suspectSinceMs = 0;
                asset.safeSinceMs = 0;
            }
            vTaskDelay(pdMS_TO_TICKS(400));
            continue;
        }
        NimBLEScan* pScan = NimBLEDevice::getScan();
        if (pScan) {
            pScan->setAdvertisedDeviceCallbacks(&assetScanCallbacks, true);
            pScan->setActiveScan(false);
            pScan->setInterval(160);
            pScan->setWindow(120);
            pScan->start(2, false);
            pScan->clearResults();
        }
        const unsigned long stamped = millis();
        for (auto& asset : g_assets) refreshAssetStatus(asset, stamped);
        vTaskDelay(pdMS_TO_TICKS(1500));
    }
}

void handleGetAssets() {
    setCORS();
    JsonDocument doc;
    doc["status"] = "success";
    doc["count"] = g_assets.size();
    JsonArray arr = doc["assets"].to<JsonArray>();

    unsigned long now = millis();
    for (auto& a : g_assets) {
        refreshAssetStatus(a, now);
        JsonObject obj = arr.add<JsonObject>();
        obj["mac"] = a.mac;
        obj["name"] = a.name;
        obj["asset_type"] = a.assetType;
        if (a.lastRssi <= -99) obj["rssi"] = nullptr;
        else obj["rssi"] = a.lastRssi;
        if (a.lastRssi <= -99 && a.rssiCount == 0 && a.rssiSmooth <= -99.0f) obj["rssi_smooth"] = nullptr;
        else obj["rssi_smooth"] = roundf(a.rssiSmooth * 10.0f) / 10.0f;
        obj["timeout_sec"] = a.timeoutSec;

        unsigned long elapsedSec = (a.lastSeenMs == 0) ? 999999 : ((now - a.lastSeenMs) / 1000);
        obj["last_seen_sec"] = elapsedSec;
        obj["status"] = assetStatusText(a.statusCode);
        obj["is_present"] = a.statusCode != 2;
    }

    String resp;
    serializeJson(doc, resp);
    server.send(200, "application/json", resp);
}

void handleAddAsset() {
    setCORS();
    String body = server.arg("plain");
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);
    if (err || !doc["mac"].is<const char*>()) {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing or invalid 'mac' parameter\"}");
        return;
    }

    String mac = doc["mac"].as<String>();
    mac.toLowerCase();
    mac.trim();

    String name = doc["name"] | "מכשיר חשמלי";
    String assetType = doc["asset_type"] | "appliances";
    int timeoutSec = doc["timeout_sec"] | 35;

    bool found = false;
    for (auto& a : g_assets) {
        if (a.mac == mac) {
            a.name = name;
            a.assetType = assetType;
            a.timeoutSec = timeoutSec;
            found = true;
            break;
        }
    }

    if (!found) {
        TrackedAsset newAsset;
        newAsset.mac = mac;
        newAsset.name = name;
        newAsset.assetType = assetType;
        newAsset.timeoutSec = timeoutSec;
        initAssetRuntime(newAsset);
        g_assets.push_back(newAsset);
    }

    saveAssetsToNVS();
    server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Asset paired and saved to NVS\"}");
}

void handleDeleteAsset() {
    setCORS();
    String mac = "";
    if (server.hasArg("mac")) {
        mac = server.arg("mac");
    } else {
        String body = server.arg("plain");
        JsonDocument doc;
        if (!deserializeJson(doc, body) && doc["mac"].is<const char*>()) {
            mac = doc["mac"].as<String>();
        }
    }
    mac.toLowerCase();
    mac.trim();

    if (mac.length() == 0) {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing mac parameter\"}");
        return;
    }

    bool removed = false;
    for (auto it = g_assets.begin(); it != g_assets.end(); ) {
        if (it->mac == mac) {
            it = g_assets.erase(it);
            removed = true;
        } else {
            ++it;
        }
    }

    if (removed) {
        saveAssetsToNVS();
        server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Asset removed\"}");
    } else {
        server.send(404, "application/json", "{\"status\":\"error\",\"message\":\"Asset not found\"}");
    }
}

void handleBleScan() {
    setCORS();
    bleOpBusy = true;
    NimBLEScan* pScan = NimBLEDevice::getScan();
    if (pScan && pScan->isScanning()) pScan->stop();
    pScan->setActiveScan(true);
    pScan->setInterval(100);
    pScan->setWindow(99);
    NimBLEScanResults results = pScan->start(3, false);
    JsonDocument doc;
    doc["status"] = "success";
    JsonArray arr = doc["devices"].to<JsonArray>();
    for (int i = 0; i < results.getCount(); i++) {
        NimBLEAdvertisedDevice dev = results.getDevice(i);
        JsonObject d = arr.add<JsonObject>();
        d["name"] = dev.getName().c_str();
        d["addr"] = dev.getAddress().toString().c_str();
        d["rssi"] = dev.getRSSI();
        if (dev.haveServiceUUID()) {
            d["service"] = dev.getServiceUUID().toString().c_str();
        }
        if (dev.haveManufacturerData()) {
            String mData = "";
            std::string raw = dev.getManufacturerData();
            for (size_t k = 0; k < raw.length(); k++) {
                char hex[4];
                snprintf(hex, sizeof(hex), "%02X", (uint8_t)raw[k]);
                mData += hex;
            }
            d["mfg"] = mData;
        }
    }
    pScan->clearResults();
    bleOpBusy = false;
    String resp;
    serializeJson(doc, resp);
    server.send(200, "application/json", resp);
}

static bool pauseRadarRead = false;

void handleRadarRaw() {
    setCORS();
    pauseRadarRead = true;
    while (radarSerial.available()) radarSerial.read();

    String hex = "";
    int count = 0;
    uint32_t tStart = millis();
    while (millis() - tStart < 150 && count < 128) {
        while (radarSerial.available() && count < 128) {
            uint8_t b = radarSerial.read();
            char h[4];
            snprintf(h, sizeof(h), "%02X ", b);
            hex += h;
            count++;
        }
        delay(1);
    }
    pauseRadarRead = false;

    JsonDocument doc;
    doc["status"] = "success";
    doc["rx_pin"] = radarRxPin;
    doc["tx_pin"] = radarTxPin;
    doc["baud"] = radarBaud;
    doc["bytes_captured"] = count;
    doc["raw_hex"] = hex;

    String resp;
    serializeJson(doc, resp);
    server.send(200, "application/json", resp);
}

void handleRadarConfig() {

    setCORS();
    if (server.hasArg("swap")) {
        int temp = radarRxPin;
        radarRxPin = radarTxPin;
        radarTxPin = temp;
    }
    if (server.hasArg("baud")) {
        radarBaud = server.arg("baud").toInt();
    }
    if (server.hasArg("rx")) {
        radarRxPin = server.arg("rx").toInt();
    }
    if (server.hasArg("tx")) {
        radarTxPin = server.arg("tx").toInt();
    }
    radarSerial.end();
    delay(50);
    radarSerial.setRxBufferSize(2048);
    radarSerial.begin(radarBaud, SERIAL_8N1, radarRxPin, radarTxPin);
    radar.begin(radarSerial, false);

    char resp[160];
    snprintf(resp, sizeof(resp), "{\"status\":\"success\",\"rx_pin\":%d,\"tx_pin\":%d,\"baud\":%u}",
        radarRxPin, radarTxPin, radarBaud);
    server.send(200, "application/json", resp);
}

void handleRadarPinTest() {
    setCORS();
    radarSerial.end();
    delay(10);

    pinMode(17, OUTPUT);
    pinMode(18, INPUT_PULLUP);

    digitalWrite(17, LOW);
    delay(10);
    int readLow = digitalRead(18);

    digitalWrite(17, HIGH);
    delay(10);
    int readHigh = digitalRead(18);

    radarSerial.setRxBufferSize(2048);
    radarSerial.begin(radarBaud, SERIAL_8N1, radarRxPin, radarTxPin);
    radar.begin(radarSerial, false);

    JsonDocument doc;
    doc["status"] = "success";
    doc["when_17_is_low_18_is"] = readLow;
    doc["when_17_is_high_18_is"] = readHigh;
    doc["are_17_and_18_shorted"] = (readLow == 0 && readHigh == 1);

    String resp;
    serializeJson(doc, resp);
    server.send(200, "application/json", resp);
}


void handleRadarInit() {
    setCORS();
    while (radarSerial.available()) radarSerial.read();

    // 1. Enable Configuration Mode
    uint8_t cmdEnableConfig[] = {0xFD, 0xFC, 0xFB, 0xFA, 0x04, 0x00, 0xFF, 0x00, 0x01, 0x00, 0x04, 0x03, 0x02, 0x01};
    radarSerial.write(cmdEnableConfig, sizeof(cmdEnableConfig));
    radarSerial.flush();
    delay(150);

    String respHex = "";
    int avail = radarSerial.available();
    while (radarSerial.available()) {
        uint8_t b = radarSerial.read();
        char h[5];
        snprintf(h, sizeof(h), "%02X ", b);
        respHex += h;
    }

    // 2. Read Firmware Version
    uint8_t cmdReadFw[] = {0xFD, 0xFC, 0xFB, 0xFA, 0x02, 0x00, 0xA0, 0x00, 0x04, 0x03, 0x02, 0x01};
    radarSerial.write(cmdReadFw, sizeof(cmdReadFw));
    radarSerial.flush();
    delay(150);

    String fwHex = "";
    while (radarSerial.available()) {
        uint8_t b = radarSerial.read();
        char h[5];
        snprintf(h, sizeof(h), "%02X ", b);
        fwHex += h;
    }

    // 3. End Configuration Mode (Resume normal reporting)
    uint8_t cmdEndConfig[] = {0xFD, 0xFC, 0xFB, 0xFA, 0x02, 0x00, 0xFE, 0x00, 0x04, 0x03, 0x02, 0x01};
    radarSerial.write(cmdEndConfig, sizeof(cmdEndConfig));
    radarSerial.flush();
    delay(150);

    String endHex = "";
    while (radarSerial.available()) {
        uint8_t b = radarSerial.read();
        char h[5];
        snprintf(h, sizeof(h), "%02X ", b);
        endHex += h;
    }

    JsonDocument doc;
    doc["status"] = "success";
    doc["enable_cfg_bytes"] = avail;
    doc["enable_cfg_resp"] = respHex;
    doc["fw_resp"] = fwHex;
    doc["end_cfg_resp"] = endHex;

    String resp;
    serializeJson(doc, resp);
    server.send(200, "application/json", resp);
}

void handleRadarScan() {
    setCORS();
    int pinsToTest[] = {18, 17, 16, 15, 7, 6, 5, 4, 8, 3, 46};
    uint32_t bauds[] = {256000, 115200};
    JsonDocument doc;
    doc["status"] = "success";
    JsonArray results = doc["results"].to<JsonArray>();

    int foundPin = -1;
    uint32_t foundBaud = 256000;

    for (int p : pinsToTest) {
        JsonObject pinObj = results.add<JsonObject>();
        pinObj["pin"] = p;
        pinObj["gpio_level"] = digitalRead(p);

        for (uint32_t b : bauds) {
            radarSerial.end();
            delay(10);
            radarSerial.begin(b, SERIAL_8N1, p, (p == 17 ? 18 : 17));
            delay(200);
            int avail = radarSerial.available();
            if (avail > 0) {
                String hex = "";
                bool isRadar = false;
                int count = 0;
                while (radarSerial.available() && count < 32) {
                    uint8_t byteVal = radarSerial.read();
                    char h[4];
                    snprintf(h, sizeof(h), "%02X ", byteVal);
                    hex += h;
                    if (byteVal == 0xF4 || byteVal == 0xFD) isRadar = true;
                    count++;
                }
                while (radarSerial.available()) radarSerial.read();

                pinObj["baud"] = b;
                pinObj["bytes_read"] = avail;
                pinObj["hex"] = hex;
                pinObj["is_radar"] = isRadar;

                if (isRadar || avail >= 10) {
                    foundPin = p;
                    foundBaud = b;
                    break;
                }
            }
        }
        if (foundPin != -1) break;
    }

    if (foundPin != -1) {
        radarRxPin = foundPin;
        radarBaud = foundBaud;
        radarTxPin = (foundPin == 18 ? 17 : 18);
        radarSerial.end();
        delay(20);
        radarSerial.begin(radarBaud, SERIAL_8N1, radarRxPin, radarTxPin);
        radar.begin(radarSerial, false);
        doc["matched"] = true;
        doc["matched_pin"] = foundPin;
        doc["matched_baud"] = foundBaud;
    } else {
        radarSerial.end();
        delay(20);
        radarSerial.begin(radarBaud, SERIAL_8N1, radarRxPin, radarTxPin);
        radar.begin(radarSerial, false);
        doc["matched"] = false;
    }

    String resp;
    serializeJson(doc, resp);
    server.send(200, "application/json", resp);
}



void setupOTA() {
    ArduinoOTA.setHostname("ResortOS-ESP32");
    ArduinoOTA.setPassword("resortos123");

    ArduinoOTA.onStart([]() {
        String type;
        if (ArduinoOTA.getCommand() == U_FLASH) {
            type = "sketch";
        } else {
            type = "filesystem";
        }
        Serial.println("\n[OTA] Update started: " + type);
    });
    ArduinoOTA.onEnd([]() {
        Serial.println("\n[OTA] Update finished successfully!");
    });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("[OTA] Progress: %u%%\r", (progress / (total / 100)));
    });
    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("[OTA] Error[%u]: ", error);
        if (error == OTA_AUTH_ERROR) Serial.println("Auth Failed");
        else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Failed");
        else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
        else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
        else if (error == OTA_END_ERROR) Serial.println("End Failed");
    });
    ArduinoOTA.begin();
    Serial.println("[+] ArduinoOTA initialized on port 3232");
}


// ============================================================================
// USB Serial Command Processor (For Direct USB Operation without Router)
// ============================================================================
static String serialRxLine = "";

void processSerialCommand(const String& line) {
    String trimmed = line;
    trimmed.trim();
    if (trimmed.isEmpty()) return;

    // Single-character commands for manual debugging
    if (trimmed == "u" || trimmed == "U") {
        Serial.println("[SERIAL] Executing Unlock...");
        NimBLEClient* pClient = connectToLock();
        if (pClient) {
            bool ok = performLockAction(pClient, CMD_UNLOCK);
            pClient->disconnect();
            if (ok) Serial.println("{\"status\":\"success\",\"action\":\"unlock\"}");
            else Serial.println("{\"status\":\"error\",\"action\":\"unlock\",\"message\":\"Lock rejected command\"}");
        } else {
            Serial.println("{\"status\":\"error\",\"action\":\"unlock\",\"message\":\"BLE connection failed\"}");
        }
        return;
    }
    if (trimmed == "l" || trimmed == "L") {
        Serial.println("[SERIAL] Executing Lock...");
        NimBLEClient* pClient = connectToLock();
        if (pClient) {
            bool ok = performLockAction(pClient, CMD_LOCK);
            pClient->disconnect();
            if (ok) Serial.println("{\"status\":\"success\",\"action\":\"lock\"}");
            else Serial.println("{\"status\":\"error\",\"action\":\"lock\",\"message\":\"Lock rejected command\"}");
        } else {
            Serial.println("{\"status\":\"error\",\"action\":\"lock\",\"message\":\"BLE connection failed\"}");
        }
        return;
    }

    // JSON structured commands
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, trimmed);
    if (err) {
        Serial.printf("{\"status\":\"error\",\"message\":\"Invalid JSON: %s\"}\n", err.c_str());
        return;
    }

    String cmd = doc["cmd"].as<String>();

    if (cmd == "ping" || cmd == "status" || cmd == "wifi_status") {
        bool wifiOk = (WiFi.status() == WL_CONNECTED);
        Serial.printf("{\"status\":\"success\",\"action\":\"status\",\"gateway\":\"online\",\"transport\":\"usb_serial\",\"wifi_connected\":%s,\"ip\":\"%s\",\"rssi\":%d}\n",
            wifiOk ? "true" : "false",
            wifiOk ? WiFi.localIP().toString().c_str() : "0.0.0.0",
            wifiOk ? WiFi.RSSI() : 0);
        return;
    }

    if (cmd == "wifi_connect") {
        String ssid = doc["ssid"].is<const char*>() ? doc["ssid"].as<String>() : "ResortOS";
        String pass = doc["pass"].is<const char*>() ? doc["pass"].as<String>() : "0506102416";
        prefs.begin("resortos", false);
        prefs.putString("wifi_ssid", ssid);
        prefs.putString("wifi_pass", pass);
        prefs.end();
        WiFi.disconnect();
        WiFi.mode(WIFI_STA);
        WiFi.begin(ssid.c_str(), pass.c_str());
        Serial.printf("{\"status\":\"success\",\"action\":\"wifi_connect\",\"message\":\"Connecting to %s...\"}\n", ssid.c_str());
        return;
    }

    if (cmd == "sync_lock_logs" || cmd == "get_lock_logs") {
        String respJson;
        bool ok = syncLockLogsBLE(respJson);
        if (ok) {
            Serial.println(respJson);
        } else {
            Serial.println("{\"status\":\"error\",\"action\":\"sync_lock_logs\",\"message\":\"Failed to communicate with lock\"}");
        }
        return;
    }

    if (cmd == "get_cards") {
        String cardsJson = getCardsJson();
        Serial.printf("{\"status\":\"success\",\"action\":\"get_cards\",\"cards\":%s}\n", cardsJson.c_str());
        return;
    }

    if (cmd == "unlock") {
        NimBLEClient* pClient = connectToLock();
        if (!pClient) {
            Serial.println("{\"status\":\"error\",\"action\":\"unlock\",\"message\":\"BLE connection failed\"}");
            return;
        }
        bool ok = performLockAction(pClient, CMD_UNLOCK);
        pClient->disconnect();
        if (ok) Serial.println("{\"status\":\"success\",\"action\":\"unlock\"}");
        else Serial.println("{\"status\":\"error\",\"action\":\"unlock\",\"message\":\"Lock rejected unlock\"}");
        return;
    }

    if (cmd == "lock") {
        NimBLEClient* pClient = connectToLock();
        if (!pClient) {
            Serial.println("{\"status\":\"error\",\"action\":\"lock\",\"message\":\"BLE connection failed\"}");
            return;
        }
        bool ok = performLockAction(pClient, CMD_LOCK);
        pClient->disconnect();
        if (ok) Serial.println("{\"status\":\"success\",\"action\":\"lock\"}");
        else Serial.println("{\"status\":\"error\",\"action\":\"lock\",\"message\":\"Lock rejected lock\"}");
        return;
    }

    if (cmd == "add_card") {
        String cardName = doc["name"].is<const char*>() ? doc["name"].as<String>() : "מפתח חדש";
        String learnedCardId = "";
        Serial.println("{\"status\":\"info\",\"message\":\"connecting_to_lock\"}");
        bool success = performAddCardBLE(learnedCardId, 20000);
        if (!success || learnedCardId.isEmpty()) {
            Serial.println("{\"status\":\"error\",\"action\":\"add_card\",\"message\":\"לא זוהה כרטיס במנעול (פסק זמן לקריאה)\"}");
            return;
        }

        // Save to persistent registry
        String cardsJson = getCardsJson();
        JsonDocument listDoc;
        deserializeJson(listDoc, cardsJson);
        JsonArray arr = listDoc.as<JsonArray>();

        JsonObject newCard = arr.add<JsonObject>();
        newCard["cardId"] = learnedCardId;
        newCard["name"] = cardName;
        newCard["active"] = true;
        newCard["addedAt"] = getCurrentDateTime();

        String updatedJson;
        serializeJson(listDoc, updatedJson);
        saveCardsJson(updatedJson);

        JsonDocument respDoc;
        respDoc["status"] = "success";
        respDoc["action"] = "add_card";
        JsonObject cObj = respDoc["card"].to<JsonObject>();
        cObj["cardId"] = learnedCardId;
        cObj["name"] = cardName;
        cObj["active"] = true;
        cObj["addedAt"] = newCard["addedAt"];

        String respStr;
        serializeJson(respDoc, respStr);
        Serial.println(respStr);
        return;
    }

    if (cmd == "update_card") {
        if (!doc["cardId"].is<const char*>()) {
            Serial.println("{\"status\":\"error\",\"action\":\"update_card\",\"message\":\"Missing cardId\"}");
            return;
        }
        String cardId = doc["cardId"].as<String>();
        String cardsJson = getCardsJson();
        JsonDocument listDoc;
        deserializeJson(listDoc, cardsJson);
        JsonArray arr = listDoc.as<JsonArray>();
        bool found = false;
        for (JsonObject c : arr) {
            if (c["cardId"].as<String>() == cardId) {
                found = true;
                if (doc["name"].is<const char*>()) c["name"] = doc["name"].as<String>();
                if (doc["active"].is<bool>()) c["active"] = doc["active"].as<bool>();
                break;
            }
        }
        if (!found) {
            Serial.println("{\"status\":\"error\",\"action\":\"update_card\",\"message\":\"Card not found\"}");
            return;
        }
        String updatedJson;
        serializeJson(listDoc, updatedJson);
        saveCardsJson(updatedJson);
        Serial.println("{\"status\":\"success\",\"action\":\"update_card\"}");
        return;
    }

    if (cmd == "delete_card") {
        if (!doc["cardId"].is<const char*>()) {
            Serial.println("{\"status\":\"error\",\"action\":\"delete_card\",\"message\":\"Missing cardId\"}");
            return;
        }
        String cardId = doc["cardId"].as<String>();
        performDeleteCardBLE(cardId);

        String cardsJson = getCardsJson();
        JsonDocument listDoc;
        deserializeJson(listDoc, cardsJson);
        JsonArray arr = listDoc.as<JsonArray>();

        JsonDocument newDoc;
        JsonArray newArr = newDoc.to<JsonArray>();
        for (JsonObject c : arr) {
            if (c["cardId"].as<String>() != cardId) {
                newArr.add(c);
            }
        }
        String updatedJson;
        serializeJson(newDoc, updatedJson);
        saveCardsJson(updatedJson);
        Serial.println("{\"status\":\"success\",\"action\":\"delete_card\"}");
        return;
    }

    if (cmd == "add_passcode" || cmd == "passcode") {
        if (!doc["code"].is<const char*>()) {
            Serial.println("{\"status\":\"error\",\"action\":\"add_passcode\",\"message\":\"Missing code\"}");
            return;
        }
        String code = doc["code"].as<String>();
        if (code.length() < 4 || code.length() > 9) {
            Serial.println("{\"status\":\"error\",\"action\":\"add_passcode\",\"message\":\"Code must be 4-9 digits\"}");
            return;
        }
        bool ok = performAddPasscodeBLE(code);
        if (ok) {
            Serial.println("{\"status\":\"success\",\"action\":\"add_passcode\"}");
        } else {
            Serial.println("{\"status\":\"error\",\"action\":\"add_passcode\",\"message\":\"Lock rejected passcode command\"}");
        }
        return;
    }

    if (cmd == "ir_tv_power" || cmd == "tv_power" || cmd == "ir_tv_on" || cmd == "ir_tv_off") {
        String power = doc["power"].is<const char*>() ? doc["power"].as<String>() : "";
        power.toLowerCase();
        uint32_t code = kSamsungTvPowerToggle;
        const char* which = "toggle";
        if (cmd == "ir_tv_off" || power == "off") {
            code = kSamsungTvPowerOff;
            which = "off";
        } else if (cmd == "ir_tv_on" || power == "on") {
            code = kSamsungTvPowerOn;
            which = "on";
        }
        Serial.printf("[IR] Samsung TV power %s\n", which);
        sendSamsungTv(code);
        Serial.printf("{\"status\":\"success\",\"action\":\"ir_tv_power\",\"device\":\"samsung_tv\",\"power\":\"%s\"}\n", which);
        return;
    }

    if (cmd == "ir_ac_temp" || cmd == "ac_temp" || cmd == "ir_ac") {
        irBlinkActive = false;
        float temp = doc["temp"].is<float>() ? doc["temp"].as<float>() : currentAcTemp;
        if (temp < 16.0f) temp = 16.0f;
        if (temp > 30.0f) temp = 30.0f;
        currentAcTemp = temp;

        Serial.printf("[IR] Sending TCL AC Command: ON, COOL, %.1f C, FAN AUTO...\n", temp);
        tclAc.on();
        tclAc.setPower(true);
        tclAc.setMode(kTcl112AcCool);
        tclAc.setTemp(temp);
        tclAc.setFan(kTcl112AcFanAuto);
        tclAc.send();

        Serial.printf("{\"status\":\"success\",\"action\":\"ir_ac_temp\",\"device\":\"tcl_ac\",\"temp\":%.1f,\"mode\":\"cool\",\"feedback\":\"ir_transmitted\",\"note\":\"IR signal sent. Verify audible beep from AC\"}\n", temp);
        return;
    }

    if (cmd == "ir_ac_off" || cmd == "ac_off") {
        irBlinkActive = false;
        Serial.println("[IR] Sending TCL AC Command: POWER OFF...");
        tclAc.off();
        tclAc.setPower(false);
        tclAc.send();

        Serial.println("{\"status\":\"success\",\"action\":\"ir_ac_off\",\"device\":\"tcl_ac\",\"power\":false,\"feedback\":\"ir_transmitted\",\"note\":\"IR power-off signal sent. Verify audible beep from AC\"}");
        return;
    }

    if (cmd == "ir_test" || cmd == "ir_blink") {
        irBlinkActive = true;
        Serial.println("{\"status\":\"success\",\"action\":\"ir_test\",\"message\":\"IR strobe active\"}");
        return;
    }

    if (cmd == "ir_off" || cmd == "ir_stop") {
        irBlinkActive = false;
        irPinState = false;
        digitalWrite(IR_TX_PIN, LOW);
        Serial.println("{\"status\":\"success\",\"action\":\"ir_off\",\"message\":\"IR LED turned OFF\"}");
        return;
    }

    if (cmd == "radar" || cmd == "presence") {
        radar.read();
        String state = "clear";
        if (radar.movingTargetDetected() && radar.stationaryTargetDetected()) state = "both";
        else if (radar.movingTargetDetected()) state = "moving";
        else if (radar.stationaryTargetDetected()) state = "stationary";

        Serial.printf("{\"status\":\"success\",\"action\":\"radar\",\"connected\":%s,\"presence\":%s,\"state\":\"%s\",\"moving\":%s,\"moving_dist\":%d,\"moving_energy\":%d,\"stationary\":%s,\"stat_dist\":%d,\"stat_energy\":%d}\n",
            radar.isConnected() ? "true" : "false",
            radar.presenceDetected() ? "true" : "false",
            state.c_str(),
            radar.movingTargetDetected() ? "true" : "false",
            radar.movingTargetDistance(),
            radar.movingTargetEnergy(),
            radar.stationaryTargetDetected() ? "true" : "false",
            radar.stationaryTargetDistance(),
            radar.stationaryTargetEnergy());
        return;
    }



    Serial.printf("{\"status\":\"error\",\"message\":\"Unknown command: %s\"}\n", cmd.c_str());
}

// ============================================================================
// Arduino Setup & Loop
// ============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n==================================================");
    Serial.println(" ResortOS ESP32-S3 IoT Gateway - Smart Lock & IC  ");
    Serial.println("==================================================");

    pinMode(IR_TX_PIN, OUTPUT);
    digitalWrite(IR_TX_PIN, LOW);
    irsend.begin();
    tclAc.begin();
    Serial.printf("[+] IR Transmitter & Appliances ready on GPIO %d\n", IR_TX_PIN);

    // Initialize mmWave Radar (UART1 @ 256000 bps)
    radarSerial.setRxBufferSize(2048);
    radarSerial.begin(256000, SERIAL_8N1, RADAR_RX_PIN, RADAR_TX_PIN);
    radar.begin(radarSerial, false);
    Serial.printf("[+] mmWave Radar LD2410C initialized on RX=%d, TX=%d @ 256000 baud\n", RADAR_RX_PIN, RADAR_TX_PIN);


    NimBLEDevice::init("ResortOS-ESP32");
    loadAssetsFromNVS();
    xTaskCreatePinnedToCore(assetScanTask, "assetScanTask", 4096, NULL, 1, NULL, 0);

    // Initialize Preferences with default cards if empty
    prefs.begin("resortos", false);
    String existingCards = prefs.getString("cards", "");
    if (existingCards.isEmpty()) {
        prefs.putString("cards", "[{\"cardId\":\"384910284\",\"name\":\"מפתח מאסטר - קבלה\",\"active\":true,\"addedAt\":\"2026-10-07 10:00\"}]");
    }
    prefs.end();

    // WiFi configuration loaded from NVS or wifi_credentials.h (kept out of Git)
    prefs.begin("resortos", false);
    String wifiSsid = prefs.getString("wifi_ssid", "");
    String wifiPass = prefs.getString("wifi_pass", "");
#ifdef WIFI_SSID_CONFIG
    if (wifiSsid.isEmpty()) {
        wifiSsid = WIFI_SSID_CONFIG;
        wifiPass = WIFI_PASS_CONFIG;
        prefs.putString("wifi_ssid", wifiSsid);
        prefs.putString("wifi_pass", wifiPass);
        Serial.printf("[*] Initialized WiFi credentials in NVS for '%s'\n", wifiSsid.c_str());
    }
#endif
    prefs.end();

    if (!wifiSsid.isEmpty()) {
        WiFi.mode(WIFI_STA);
        WiFi.setAutoReconnect(true);
        WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
        Serial.printf("[*] Connecting to configured WiFi '%s'...\n", wifiSsid.c_str());
        uint32_t t0 = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
            delay(500);
            Serial.print(".");
        }
        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("\n[+] WiFi Connected! IP: %s | RSSI: %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
            configTime(3 * 3600, 0, "pool.ntp.org");

            setupOTA();

            // Web Server Routes (For remote control from Mac Studio or any device)
            server.on("/", HTTP_GET, handleRoot);

            // Radar & Human Presence Routes
            server.on("/api/radar", HTTP_GET, handleRadar);
            server.on("/api/radar", HTTP_POST, handleRadar);
            server.on("/api/radar/config", HTTP_GET, handleRadarConfig);
            server.on("/api/radar/config", HTTP_POST, handleRadarConfig);
            server.on("/api/radar/scan", HTTP_GET, handleRadarScan);
            server.on("/api/radar/scan", HTTP_POST, handleRadarScan);
            server.on("/api/radar/raw", HTTP_GET, handleRadarRaw);
            server.on("/api/radar/raw", HTTP_POST, handleRadarRaw);
            server.on("/api/radar/pin_test", HTTP_GET, handleRadarPinTest);
            server.on("/api/radar/pin_test", HTTP_POST, handleRadarPinTest);
            server.on("/api/radar/init", HTTP_GET, handleRadarInit);
            server.on("/api/radar/init", HTTP_POST, handleRadarInit);
            server.on("/api/presence", HTTP_GET, handleRadar);
            server.on("/radar", HTTP_GET, handleRadar);
            server.on("/api/ble/scan", HTTP_GET, handleBleScan);




            // Wireless Firmware Update (OTA via Browser)
            server.on("/update", HTTP_GET, []() {
                setCORS();
                server.send(200, "text/html",
                    "<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'><title>ResortOS - עדכון קושחה אלחוטי (OTA)</title>"
                    "<style>body{font-family:sans-serif;background:#0f172a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}"
                    ".card{background:#1e293b;padding:32px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.5);width:380px;text-align:center;border:1px solid rgba(255,255,255,0.1);}"
                    "input[type=file]{margin:20px 0;width:100%;color:#cbd5e1;}input[type=submit]{background:#2563eb;color:#fff;border:none;padding:14px;border-radius:10px;font-weight:bold;cursor:pointer;width:100%;font-size:15px;}"
                    "h2{margin-bottom:8px;font-size:20px;}p{color:#94a3b8;font-size:13px;margin-bottom:16px;}"
                    "</style></head><body><div class='card'><h2>ResortOS OTA Updater</h2><p>בחר קובץ firmware.bin לשדרוג אלחוטי מהיר</p>"
                    "<form method='POST' action='/update' enctype='multipart/form-data'>"
                    "<input type='file' name='update' accept='.bin' required><br>"
                    "<input type='submit' value='צרוב קושחה אלחוטית (Flash)'>"
                    "</form></div></body></html>");
            });
            server.on("/update", HTTP_POST, []() {
                setCORS();
                server.sendHeader("Connection", "close");
                if (Update.hasError()) {
                    server.send(500, "application/json", "{\"status\":\"error\",\"message\":\"Update failed\"}");
                } else {
                    server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Update succeeded. Rebooting...\"}");
                    delay(500);
                    ESP.restart();
                }
            }, []() {
                HTTPUpload& upload = server.upload();
                if (upload.status == UPLOAD_FILE_START) {
                    Serial.printf("[HTTP-OTA] Update Start: %s\n", upload.filename.c_str());
                    if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
                        Update.printError(Serial);
                    }
                } else if (upload.status == UPLOAD_FILE_WRITE) {
                    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
                        Update.printError(Serial);
                    }
                } else if (upload.status == UPLOAD_FILE_END) {
                    if (Update.end(true)) {
                        Serial.printf("[HTTP-OTA] Success: %u bytes written\n", upload.totalSize);
                    } else {
                        Update.printError(Serial);
                    }
                }
            });

            server.on("/unlock", HTTP_GET, handleUnlock);
            server.on("/unlock", HTTP_POST, handleUnlock);
            server.on("/api/unlock", HTTP_POST, handleUnlock);
            server.on("/api/unlock", HTTP_GET, handleUnlock);

            server.on("/lock", HTTP_GET, handleLock);
            server.on("/lock", HTTP_POST, handleLock);
            server.on("/api/lock", HTTP_POST, handleLock);
            server.on("/api/lock", HTTP_GET, handleLock);

            server.on("/passcode", HTTP_POST, handleAddPasscode);
            server.on("/api/passcode", HTTP_POST, handleAddPasscode);
            server.on("/api/passcode", HTTP_GET, handleAddPasscode);

            server.on("/api/ir/ac", HTTP_POST, handleAcTemp);
            server.on("/api/ir/ac", HTTP_GET, handleAcTemp);
            server.on("/api/ir/ac/off", HTTP_POST, handleAcOff);
            server.on("/api/ir/ac/off", HTTP_GET, handleAcOff);

            server.on("/api/ir/tv", HTTP_POST, handleTvPower);
            server.on("/api/ir/tv", HTTP_GET, handleTvPower);

            server.on("/api/status", HTTP_GET, handleStatus);
            server.on("/api/status", HTTP_POST, handleStatus);
            server.on("/status", HTTP_GET, handleStatus);

            server.on("/api/lock/sync", HTTP_POST, handleLockSync);
            server.on("/api/lock/sync", HTTP_GET, handleLockSync);
            server.on("/api/lock/logs", HTTP_GET, handleLockSync);

            server.on("/api/cards", HTTP_GET, handleGetCards);
            server.on("/api/cards", HTTP_OPTIONS, handleOptions);

            server.on("/api/cards/add", HTTP_POST, handleAddCard);
            server.on("/api/cards/add", HTTP_OPTIONS, handleOptions);

            server.on("/api/cards/update", HTTP_POST, handleUpdateCard);
            server.on("/api/cards/update", HTTP_PUT, handleUpdateCard);
            server.on("/api/cards/update", HTTP_OPTIONS, handleOptions);

            server.on("/api/cards/delete", HTTP_POST, handleDeleteCard);
            server.on("/api/cards/delete", HTTP_DELETE, handleDeleteCard);
            server.on("/api/cards/delete", HTTP_OPTIONS, handleOptions);

            // Asset Anti-Theft Routes
            server.on("/api/assets", HTTP_GET, handleGetAssets);
            server.on("/api/assets", HTTP_POST, handleAddAsset);
            server.on("/api/assets", HTTP_DELETE, handleDeleteAsset);
            server.on("/api/assets", HTTP_OPTIONS, handleOptions);
            server.on("/api/assets/delete", HTTP_POST, handleDeleteAsset);
            server.on("/api/assets/delete", HTTP_OPTIONS, handleOptions);

            server.onNotFound(handleOptions);

            server.begin();
            Serial.printf("[+] Web Server running on http://%s/\n", WiFi.localIP().toString().c_str());
        } else {
            Serial.printf("\n[!] WiFi connection timed out for '%s'. Will retry in background...\n", wifiSsid.c_str());
        }
    } else {
        WiFi.mode(WIFI_OFF);
        Serial.println("[*] WiFi disabled (USB Serial mode active, zero credentials in code).");
    }

    Serial.println("Ready! Listening for Serial JSON commands and 'u'/'l' keys.");
}

void loop() {
    if (!pauseRadarRead) radar.read();

    if (WiFi.status() == WL_CONNECTED) {
        server.handleClient();
        ArduinoOTA.handle();
    }



    // Non-blocking IR test strobe: 300ms ON / 700ms OFF
    if (irBlinkActive) {
        unsigned long now = millis();
        if (irPinState && (now - lastIrBlink >= 300)) {
            irPinState = false;
            digitalWrite(IR_TX_PIN, LOW);
            lastIrBlink = now;
        } else if (!irPinState && (now - lastIrBlink >= 700)) {
            irPinState = true;
            digitalWrite(IR_TX_PIN, HIGH);
            lastIrBlink = now;
        }
    }

    while (Serial.available()) {
        char c = (char)Serial.read();
        if (c == '\n' || c == '\r') {
            if (serialRxLine.length() > 0) {
                processSerialCommand(serialRxLine);
                serialRxLine = "";
            }
        } else {
            serialRxLine += c;
        }
    }
    yield();
}
