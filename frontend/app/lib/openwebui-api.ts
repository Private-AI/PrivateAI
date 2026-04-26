export interface OWModel {
  id: string;
  name?: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface OWMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface OWConversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  chat?: { messages: OWMessage[] };
}

const LOCAL_EMAIL = 'privateai@local';
const LOCAL_PASS = 'privateai-local-only-2024';
const TOKEN_KEY_PREFIX = 'privateai_ow_token:';
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function tokenKey(baseUrl: string): string {
  return TOKEN_KEY_PREFIX + baseUrl;
}

function getCachedToken(baseUrl: string): string | null {
  try {
    return localStorage.getItem(tokenKey(baseUrl));
  } catch {
    return null;
  }
}

function setCachedToken(baseUrl: string, token: string): void {
  try {
    localStorage.setItem(tokenKey(baseUrl), token);
  } catch {}
}

function clearCachedToken(baseUrl: string): void {
  try {
    localStorage.removeItem(tokenKey(baseUrl));
  } catch {}
}

async function acquireToken(baseUrl: string): Promise<string> {
  // Primary: ask our backend (avoids CORS on Open WebUI auth endpoints)
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/open-webui/token`);
    if (res.ok) {
      const data = await res.json() as { token?: string };
      if (data.token) {
        setCachedToken(baseUrl, data.token);
        return data.token;
      }
    }
  } catch {}

  // Fallback: call Open WebUI auth endpoints directly from the browser

  // Try signup first (fresh Open WebUI instance)
  try {
    const res = await fetch(`${baseUrl}/api/v1/auths/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'PrivateAI', email: LOCAL_EMAIL, password: LOCAL_PASS }),
    });
    if (res.ok) {
      const data = await res.json() as { token?: string };
      if (data.token) {
        setCachedToken(baseUrl, data.token);
        return data.token;
      }
    }
  } catch {}

  // Signup failed (user exists or disabled) — try sign in
  try {
    const res = await fetch(`${baseUrl}/api/v1/auths/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: LOCAL_EMAIL, password: LOCAL_PASS }),
    });
    if (res.ok) {
      const data = await res.json() as { token?: string };
      if (data.token) {
        setCachedToken(baseUrl, data.token);
        return data.token;
      }
    }
  } catch {}

  throw new Error('Could not authenticate with Open WebUI. Make sure it is running and try again.');
}

async function getToken(baseUrl: string): Promise<string> {
  return getCachedToken(baseUrl) ?? acquireToken(baseUrl);
}

async function owFetch(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  const token = await getToken(baseUrl);
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401 && !retried) {
    clearCachedToken(baseUrl);
    const fresh = await acquireToken(baseUrl);
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${fresh}`,
      },
    });
  }

  return res;
}

export async function fetchModels(baseUrl: string): Promise<OWModel[]> {
  const res = await owFetch(baseUrl, '/api/models');
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.statusText}`);
  const data = await res.json() as { data?: OWModel[] };
  return data.data ?? [];
}

export async function sendChatMessage(
  baseUrl: string,
  messages: { role: string; content: string }[],
  model: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await getToken(baseUrl);
  const res = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(`Chat error: ${res.statusText}`);
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data) as {
          choices?: [{ delta?: { content?: string } }];
        };
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) onChunk(text);
      } catch {
        // ignore malformed chunks
      }
    }
  }
}

export async function listConversations(baseUrl: string): Promise<OWConversation[]> {
  try {
    const res = await owFetch(baseUrl, '/api/v1/chats');
    if (!res.ok) return [];
    const data = await res.json() as OWConversation[] | { chats?: OWConversation[] };
    return Array.isArray(data) ? data : (data as { chats?: OWConversation[] }).chats ?? [];
  } catch {
    return [];
  }
}

export async function createConversation(
  baseUrl: string,
  title: string,
  messages: { role: string; content: string }[],
): Promise<OWConversation | null> {
  try {
    const res = await owFetch(baseUrl, '/api/v1/chats/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: { title, messages } }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<OWConversation>;
  } catch {
    return null;
  }
}

export async function updateConversation(
  baseUrl: string,
  id: string,
  title: string,
  messages: { role: string; content: string }[],
): Promise<void> {
  try {
    await owFetch(baseUrl, `/api/v1/chats/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: { title, messages } }),
    });
  } catch {
    // best-effort
  }
}

export async function deleteConversation(baseUrl: string, id: string): Promise<void> {
  try {
    await owFetch(baseUrl, `/api/v1/chats/${id}`, { method: 'DELETE' });
  } catch {
    // best-effort
  }
}

export async function uploadFile(
  baseUrl: string,
  file: File,
): Promise<{ id: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await owFetch(baseUrl, '/api/v1/files', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Failed to upload file: ${res.statusText}`);
  return res.json() as Promise<{ id: string; filename: string }>;
}
