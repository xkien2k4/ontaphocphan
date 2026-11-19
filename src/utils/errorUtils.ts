export function extractErrorMessage(
  err: unknown,
  fallback = 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.'
): string {
  if (err === null || err === undefined) return fallback;

  if (typeof err === 'string') {
    const trimmed = err.trim();
    if (!trimmed || trimmed === '[object Object]') return fallback;
    return trimmed;
  }

  if (typeof err === 'number' || typeof err === 'boolean') {
    return String(err);
  }

  if (err instanceof Error) {
    if (err.name === 'AbortError') {
      return 'Kết nối đến máy chủ vượt quá thời gian chờ. Vui lòng thử lại sau ít giây.';
    }
    const msg = typeof err.message === 'string' ? err.message.trim() : extractErrorMessage(err.message, '');
    if (msg && msg !== '[object Object]') {
      return msg;
    }
  }

  if (typeof err === 'object') {
    const obj = err as Record<string, any>;

    // Handle nested platform errors such as Vercel { error: { code, message } }
    for (const key of ['error', 'message', 'reason', 'detail', 'details', 'statusText']) {
      const val = obj[key];
      if (val !== undefined && val !== null) {
        const nested = extractErrorMessage(val, '');
        if (nested && nested !== '[object Object]') {
          if (key === 'error' && typeof val === 'object' && val?.code) {
            return `${nested} (${String(val.code)})`;
          }
          return nested;
        }
      }
    }

    if (typeof obj.code === 'string' && obj.code.trim()) {
      return `Lỗi hệ thống (${obj.code.trim()}).`;
    }

    try {
      const serialized = JSON.stringify(obj);
      if (serialized && serialized !== '{}' && serialized !== '[]') {
        return serialized;
      }
    } catch {
      // ignore circular structures
    }
  }

  return fallback;
}
