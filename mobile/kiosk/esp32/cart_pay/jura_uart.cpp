#include "jura_uart.h"

#include <stdio.h>

namespace {

// True when the command, after leading whitespace, starts with AN: or FN:.
// Case-insensitive. Checked before any UART access.
bool juraCommandBlocked(const String &cmd) {
  size_t i = 0;
  while (i < cmd.length()) {
    char c = cmd.charAt(i);
    if (c != ' ' && c != '\t' && c != '\r' && c != '\n') break;
    i++;
  }
  if (cmd.length() - i < 3) return false;
  char a = cmd.charAt(i);
  char b = cmd.charAt(i + 1);
  char colon = cmd.charAt(i + 2);
  if (a >= 'a' && a <= 'z') a = (char)(a - 'a' + 'A');
  if (b >= 'a' && b <= 'z') b = (char)(b - 'a' + 'A');
  if (colon != ':') return false;
  if (a == 'A' && b == 'N') return true;
  if (a == 'F' && b == 'N') return true;
  return false;
}

}  // namespace

void JuraUart::begin() {
  _s.begin(9600, SERIAL_8N1, _rx, _tx);
}

void JuraUart::sendRawByte(uint8_t b) {
  for (int s = 0; s < 8; s += 2) {
    uint8_t raw = 0xFF;
    bitWrite(raw, 2, bitRead(b, s));
    bitWrite(raw, 5, bitRead(b, s + 1));
    _s.write(raw);
    _s.flush();
    delay(8);
  }
}

bool JuraUart::readRawByteUntil(uint8_t &out, uint32_t deadlineMs) {
  uint8_t v = 0;
  for (int s = 0; s < 8; s += 2) {
    while (!_s.available()) {
      // Wrap-safe for waits under ~24 days. deadlineMs is an absolute millis().
      if ((int32_t)(millis() - deadlineMs) >= 0) return false;
      delay(1);
    }
    uint8_t raw = (uint8_t)_s.read();
    bitWrite(v, s, bitRead(raw, 2));
    bitWrite(v, s + 1, bitRead(raw, 5));
  }
  out = v;
  return true;
}

bool JuraUart::readRawByte(uint8_t &out, uint32_t timeoutMs) {
  return readRawByteUntil(out, millis() + timeoutMs);
}

bool JuraUart::command(const String &cmd, String &reply, uint32_t timeoutMs) {
  reply = "";
  // AN:0A is reported to erase EEPROM. FN: is reported as direct actuator control.
  // Refuse before dropping the RX buffer or writing a single raw byte.
  if (juraCommandBlocked(cmd)) return false;

  while (_s.available()) (void)_s.read();
  String full = cmd + "\r\n";
  for (unsigned int i = 0; i < full.length(); i++) {
    sendRawByte((uint8_t)full.charAt(i));
  }

  uint32_t deadline = millis() + timeoutMs;
  while ((int32_t)(millis() - deadline) < 0) {
    uint8_t c = 0;
    if (!readRawByteUntil(c, deadline)) return false;
    if (c == '\n') {
      if (reply.endsWith("\r")) reply.remove(reply.length() - 1);
      return true;
    }
    reply += (char)c;
    if (reply.length() > 256) return false;
  }
  return false;
}

bool JuraUart::getType(String &type) {
  if (!command("TY:", type)) return false;
  return type.startsWith("ty:");
}

bool JuraUart::readCounters(String &raw) {
  if (!command("RT:0000", raw)) return false;
  return raw.startsWith("rt:");
}

bool JuraUart::brewProduct(int buttonIndex) {
  // UNVERIFIED ON X8. Older-model map: button 1..6 => FA:04..FA:09.
  if (buttonIndex < 1 || buttonIndex > 6) return false;
  char cmd[8];
  snprintf(cmd, sizeof(cmd), "FA:%02X", 3 + buttonIndex);
  String reply;
  if (!command(cmd, reply)) return false;
  return reply.startsWith("ok:");
}

bool JuraUart::readStatusRaw(String &raw) {
  // UNVERIFIED ON X8. IC: bit meanings are not known for this model.
  if (!command("IC:", raw)) return false;
  return raw.startsWith("ic:");
}
