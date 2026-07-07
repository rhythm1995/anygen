import { Logger } from '@nestjs/common';

/**
 * Minimal HTTP client for a self-hosted eve agent service.
 *
 * Implements the documented eve session API (see vercel-labs/steve + eve docs):
 *   POST /eve/v1/session            → { sessionId, continuationToken }
 *   POST /eve/v1/session/:id        → { message, continuationToken }  (NDJSON stream)
 *   GET  /eve/v1/session/:id/stream → NDJSON event stream
 *
 * The client is intentionally defensive: any failure throws, and AgentService
 * falls back to the local mock generator so the platform always responds.
 *
 * NOTE: verify the exact `continue` payload against eve.dev/docs for your eve
 * version — the API is still in beta and field names may shift.
 */
export interface EveRunResult {
  text: string;
  sessionId?: string;
  model?: string;
}

export class EveClient {
  private readonly log = new Logger('EveClient');

  constructor(private baseUrl: string, private timeoutMs = 180_000) {}

  async runAgent(userMessage: string, systemHint?: string): Promise<EveRunResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const sess = await this.post(`${this.baseUrl}/eve/v1/session`, {});
      const sessionId = sess.sessionId ?? sess.session_id;
      const continuationToken = sess.continuationToken ?? sess.continuation_token;
      if (!sessionId) throw new Error('eve returned no sessionId');

      const res = await fetch(`${this.baseUrl}/eve/v1/session/${sessionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: systemHint ? `${systemHint}\n\n${userMessage}` : userMessage, continuationToken }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`eve continue ${res.status}: ${await safeText(res)}`);

      const text = await extractText(res);
      return { text, sessionId, model: sess.model };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Health probe used by the /api/health endpoint. */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/.well-known/workflow`, { method: 'GET' });
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  }

  private async post(url: string, body: unknown): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new Error(`eve POST ${url} ${res.status}: ${await safeText(res)}`);
    return res.json();
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}

/** Read an NDJSON event stream (or single JSON body) and extract assistant text. */
async function extractText(res: Response): Promise<string> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('stream') && !ct.includes('ndjson')) {
    const json = await res.json().catch(() => null);
    return pickText(json) ?? '';
  }
  const raw = await res.text();
  const parts: string[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let evt: any;
    try {
      evt = JSON.parse(t);
    } catch {
      continue;
    }
    const txt = pickText(evt);
    if (txt) parts.push(txt);
  }
  return parts.join('');
}

function pickText(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  // common eve/AI SDK event shapes
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.delta === 'string') return obj.delta;
  if (obj.data) {
    if (typeof obj.data.text === 'string') return obj.data.text;
    if (typeof obj.data === 'string') return obj.data;
  }
  if (obj.type === 'text' && typeof obj.value === 'string') return obj.value;
  return null;
}
