/**
 * Public lead capture — contact form and webinar registrations.
 *
 * These endpoints do not require authentication; `api.post` simply omits the
 * Authorization header when no session exists.
 */

import api from './api';

export type LeadSource = 'contact' | 'webinar_rsvp' | 'webinar_registration';

export interface LeadPayload {
  source: LeadSource;
  email: string;
  name?: string;
  phone?: string;
  /** Source-specific extras, e.g. {subject, message} or {eventDate, eventTime, zipCode}. */
  details?: Record<string, string>;
  /**
   * Honeypot. Rendered hidden and left empty by real users; bots that fill
   * every field give themselves away. Always send it so the shape is constant.
   */
  website?: string;
}

export async function submitLead(payload: LeadPayload) {
  return api.post('/leads', { website: '', ...payload });
}
