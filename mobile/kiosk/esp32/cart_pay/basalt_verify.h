#pragma once
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Returns 1 when sig is a valid Ed25519 signature over msg for pk.
// Runs TweetNaCl on a 32KB worker so the field math does not use the loop stack.
int basalt_verify_worker(const uint8_t *msg, size_t msg_len, const uint8_t sig[64], const uint8_t pk[32]);
int basalt_b64_decode(const char *text, uint8_t *out, size_t cap);

#ifdef __cplusplus
}
#endif
