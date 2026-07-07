export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
export const ORG_ID =
  process.env.NEXT_PUBLIC_ORG_ID || '00000000-0000-0000-0000-000000000001';
const ORG = ORG_ID;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-org-id': ORG,
      ...((init.headers as Record<string, string>) || {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, text || res.statusText);
  return (text ? JSON.parse(text) : null) as T;
}

export const apiPost = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });

export const apiPatch = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined });

export const apiDel = (path: string) => api(path, { method: 'DELETE' });

/** Fetch an export payload and trigger a browser download. Client-only. */
export async function downloadExport(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'content-type': 'application/json', 'x-org-id': ORG },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`export failed (${res.status})`);
  const d = (await res.json()) as { filename: string; body: string };
  const blob = new Blob([d.body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = d.filename;
  a.click();
  URL.revokeObjectURL(url);
}
