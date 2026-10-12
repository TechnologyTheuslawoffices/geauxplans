/**
 * AI Attorney service.
 *
 * Wraps the /api/ai-attorney/message endpoint, which runs a Claude-powered
 * Louisiana estate-planning attorney that interviews the client and returns a
 * partial FormData `patch` the caller deep-merges into shared form state.
 * Reuses the base api client (auth/token handling) from services/api.ts.
 */

import api from './api';

export interface AttorneyMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SendAttorneyPayload {
  formType: string;
  formData: any;
  messages: AttorneyMessage[];
}

export interface AttorneyResult {
  reply: string;
  patch: any | null;
}

export async function sendAttorneyMessage(payload: SendAttorneyPayload) {
  return api.post<AttorneyResult>('/ai-attorney/message', payload);
}
