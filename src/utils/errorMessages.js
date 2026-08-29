const ADMIN_FALLBACK_MESSAGE = 'Please contact Administrator for this.'

const BACKEND_NOISE_PATTERNS = [
  /syntax error/i,
  /column .* does not exist/i,
  /relation .* does not exist/i,
  /invalid input syntax/i,
  /cannot read properties of undefined/i,
  /cannot destructure/i,
  /stack trace/i,
  /at .*:\d+:\d+/i,
  /sql state:/i,
  /database error/i,
]

export const isBackendNoiseMessage = (message) => {
  const text = String(message || '').trim()
  if (!text) return false
  return BACKEND_NOISE_PATTERNS.some((pattern) => pattern.test(text))
}

export const toUserFacingError = (error, fallback = ADMIN_FALLBACK_MESSAGE) => {
  const message = String(error?.message || error || '').trim()
  if (!message) return fallback
  return isBackendNoiseMessage(message) ? fallback : message
}

export const ADMIN_ERROR_MESSAGE = ADMIN_FALLBACK_MESSAGE
