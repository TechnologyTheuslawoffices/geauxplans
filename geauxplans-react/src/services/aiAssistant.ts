/**
 * GeauxPilot assistant service.
 *
 * Streams a turn from POST /api/ai-assistant/chat over Server-Sent Events. The
 * backend sends {type:'text',text} chunks, then {type:'done'} (or {type:'error'}).
 * `sendAssistantMessage` invokes onToken for each chunk and resolves when done.
 *
 * Auth is optional — a signed-in customer's Supabase token is attached when
 * present (it unlocks the "look up my plans" tool), but guests work too.
 */

import { supabase } from '../lib/supabase';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SendOptions {
  messages: AssistantMessage[];
  onToken: (text: string) => void;
  signal?: AbortSignal;
}

async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Send the running transcript and stream the assistant's reply token-by-token.
 * Resolves with the full reply text, or rejects on a transport/server error.
 */
export async function sendAssistantMessage({ messages, onToken, signal }: SendOptions): Promise<string> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}/ai-assistant/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    // Non-stream error response (e.g. 400/500 JSON).
    let msg = 'The assistant is unavailable right now.';
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  // Read the SSE stream: events separated by blank lines, each line "data: {...}".
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep the trailing partial line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      let evt: any;
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.type === 'text' && typeof evt.text === 'string') {
        full += evt.text;
        onToken(evt.text);
      } else if (evt.type === 'error') {
        throw new Error(evt.error || 'The assistant ran into a problem.');
      } else if (evt.type === 'done') {
        return full;
      }
    }
  }

  return full;
}
