export class ApiRouteError extends Error {
  /** 服务端给出的错误类别（可选）。 */
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** 把接口的错误响应变成 ApiRouteError，保留服务端的错误类别。 */
export async function apiRouteError(response: Response, fallback: string): Promise<ApiRouteError> {
  try {
    const payload: unknown = await response.json();
    if (payload !== null && typeof payload === 'object') {
      const { error, code } = payload as { error?: unknown; code?: unknown };
      return new ApiRouteError(typeof error === 'string' && error.trim() ? error : fallback, typeof code === 'string' ? code : undefined);
    }
  } catch {
    // Keep the caller's fallback if the server returned a non-JSON error.
  }
  return new ApiRouteError(fallback);
}

export type RetrievedPassage = { url: string; text: string };

export async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (payload !== null && typeof payload === 'object' && 'error' in payload) {
      const error = (payload as { error?: unknown }).error;
      if (typeof error === 'string' && error.trim()) return error;
    }
  } catch {
    // Keep the caller's fallback if the server returned a non-JSON error.
  }
  return fallback;
}

export async function consumeSseText(
  response: Response,
  onText: (text: string) => void,
  onReferences?: (references: string[]) => void,
  onPassages?: (passages: RetrievedPassage[]) => void,
): Promise<void> {
  if (!response.body) throw new Error('无响应流');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';

  const processLine = (line: string): boolean => {
    const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!normalizedLine.startsWith('data:')) return false;

    const data = normalizedLine.slice(5).trimStart();
    if (data === '[DONE]') return true;
    if (!data) return false;

    let payload: { delta?: { text?: unknown }; references?: unknown; passages?: unknown; error?: unknown };
    try {
      payload = JSON.parse(data);
    } catch {
      return false;
    }
    if (typeof payload.error === 'string') throw new ApiRouteError(payload.error);
    {
      if (Array.isArray(payload.references) && payload.references.every(item => typeof item === 'string')) {
        onReferences?.(payload.references);
      }
      if (Array.isArray(payload.passages) && payload.passages.every(item =>
        item && typeof item.url === 'string' && typeof item.text === 'string')) {
        onPassages?.(payload.passages);
      }
      const text = payload.delta?.text;
      if (typeof text === 'string') onText(text);
    }
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });

      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        const isDone = processLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        if (isDone) return;
        newline = pending.indexOf('\n');
      }

      if (done) {
        if (pending) processLine(pending);
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
