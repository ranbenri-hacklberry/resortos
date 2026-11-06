#include "basalt_verify.h"

#include <Arduino.h>
#include <string.h>

extern "C" {
#include "tweetnacl.h"

void randombytes(unsigned char *p, unsigned long long n) {
  if (p && n) memset(p, 0, (size_t)n);
}
}

static int basalt_ed25519_verify(const uint8_t *msg, size_t msg_len, const uint8_t sig[64], const uint8_t pk[32]) {
  if (!msg || !sig || !pk || msg_len > 1024) return 0;
  uint8_t sm[64 + 1024];
  uint8_t opened[64 + 1024];
  memcpy(sm, sig, 64);
  memcpy(sm + 64, msg, msg_len);
  unsigned long long mlen = 0;
  int rc = crypto_sign_open(opened, &mlen, sm, (unsigned long long)(64 + msg_len), pk);
  return rc == 0 && mlen == msg_len;
}

struct BasaltVerifyJob {
  const uint8_t *msg;
  size_t len;
  const uint8_t *sig;
  const uint8_t *pk;
  volatile int result;
};

static void basaltVerifyTask(void *arg) {
  BasaltVerifyJob *job = static_cast<BasaltVerifyJob *>(arg);
  job->result = basalt_ed25519_verify(job->msg, job->len, job->sig, job->pk);
  vTaskDelete(nullptr);
}

extern "C" int basalt_verify_worker(const uint8_t *msg, size_t msg_len, const uint8_t sig[64], const uint8_t pk[32]) {
  BasaltVerifyJob job{msg, msg_len, sig, pk, -1};
  if (xTaskCreate(basaltVerifyTask, "basalt-verify", 32768, &job, 1, nullptr) != pdPASS) return 0;
  while (job.result < 0) delay(1);
  return job.result;
}

extern "C" int basalt_b64_decode(const char *text, uint8_t *out, size_t cap) {
  static const int8_t table[256] = {
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,
    -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,
    -1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1
  };
  size_t n = 0;
  int val = 0;
  int valb = -8;
  for (const char *p = text; *p; p++) {
    unsigned char c = (unsigned char)*p;
    if (c >= 128) return -1;
    if (c == '=' || c == '\n' || c == '\r') break;
    int d = table[c];
    if (d < 0) return -1;
    val = (val << 6) + d;
    valb += 6;
    if (valb >= 0) {
      if (n >= cap) return -1;
      out[n++] = (uint8_t)((val >> valb) & 0xFF);
      valb -= 8;
    }
  }
  return (int)n;
}
