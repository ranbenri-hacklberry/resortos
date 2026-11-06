// Jura service-port UART helper for Arduino-ESP32 (ESP32-S3 and ESP32-P4).
// Community reverse engineering, not a Jura interface:
//   https://github.com/COM8/esp32-jura
//   https://github.com/Jutta-Proto/protocol-cpp
//
// UNVERIFIED ON A JURA X8. FA: button numbers were mapped on older models.
// The X8 service port is a D-SUB 9 behind the logo. Pinout is unpublished.
// Measure before wiring. The port is 5V TTL, 9600 8N1. Use a level shifter
// to 3.3V and a common ground. Do not power the ESP from the machine 5V pin
// until that pin has been measured.
//
// command() refuses AN: and FN: (reported EEPROM erase and direct actuators).
// Those bytes are never written.
#pragma once

#include <Arduino.h>

class JuraUart {
 public:
  JuraUart(HardwareSerial &port, int rxPin, int txPin) : _s(port), _rx(rxPin), _tx(txPin) {}

  void begin();

  // One logical byte becomes four raw bytes. Data bits land in UART bits 2 and 5,
  // same polarity as COM8/esp32-jura (a 1 is sent as a 1). Spare bits stay 1
  // (0xFF base, the usual Arduino form). COM8's encoder uses base 0x5B, so the
  // two differ only in bit 7. COM8's decoder ignores that bit. Unverified on X8.
  void sendRawByte(uint8_t b);
  // Waits up to timeoutMs for one logical byte. The whole byte shares one deadline.
  bool readRawByte(uint8_t &out, uint32_t timeoutMs);
  // Sends "cmd\r\n" and reads one reply line with the CR stripped.
  // Returns false on timeout, overlong reply, or a blocked AN:/FN: command.
  // A blocked command does not touch the UART. timeoutMs covers the whole read.
  bool command(const String &cmd, String &reply, uint32_t timeoutMs = 2000);

  bool getType(String &type);        // TY:  -> reply starts with "ty:"
  bool readCounters(String &raw);    // RT:0000 -> reply starts with "rt:"
  // buttonIndex 1..6 -> FA:04..FA:09. Expects a reply that starts with "ok:".
  // UNVERIFIED ON X8.
  bool brewProduct(int buttonIndex);
  // IC: raw reply. Bit meanings are model-specific and unknown for the X8.
  bool readStatusRaw(String &raw);

 private:
  bool readRawByteUntil(uint8_t &out, uint32_t deadlineMs);

  HardwareSerial &_s;
  int _rx;
  int _tx;
};
