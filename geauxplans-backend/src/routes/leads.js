/**
 * Public lead capture — contact form and webinar registrations.
 *
 * These endpoints are intentionally UNAUTHENTICATED: they back marketing forms
 * that anonymous visitors fill in. Two consequences drive the design here:
 *
 *  1. Durability over delivery. The lead is written to Supabase first and
 *     pushed to Keap best-effort afterwards. A Keap outage, a revoked token or
 *     an unconfigured environment must never cost us the lead — unsynced rows
 *     stay queryable via `keap_sync_status <> 'synced'`.
 *  2. Abuse surface. A public endpoint that creates CRM contacts is a spam
 *     vector. A honeypot field filters naive bots without adding friction for
 *     real users. In-process rate limiting is deliberately omitted because each
 *     Vercel invocation may be a fresh instance, which makes it security
 *     theatre; if volume becomes a problem, use a CAPTCHA or edge rate limit.
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { keapService, LEAD_SOURCE_TAGS } = require('../services/keap');

const router = express.Router();

const SOURCES = ['contact', 'webinar_rsvp', 'webinar_registration'];

/** Human-readable opt-in reason recorded on the Keap contact. */
const SOURCE_LABELS = {
  contact: 'GeauxPlans Contact Form',
  webinar_rsvp: 'GeauxPlans Webinar RSVP',
  webinar_registration: 'GeauxPlans Webinar Registration',
};


/**
 * Keap stores given/family names separately but these forms ask for one "name".
 * Everything after the first space becomes the surname, which is the least-bad
 * split for "Mary Jo Van Der Berg" — better to over-fill family_name than to
 * drop the rest of the name.
 */
function splitName(full) {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

router.post(
  '/',
  [
    body('source').isIn(SOURCES).withMessage('Unknown lead source'),
    body('email')
      .isEmail().withMessage('Please enter a valid email address')
      // Same options as auth.js so a lead and a later account registration for
      // the same person normalize to the same string and dedupe in Keap.
      .normalizeEmail({
        gmail_remove_subaddress: false,
        outlookdotcom_remove_subaddress: false,
        yahoo_remove_subaddress: false,
      }),
    body('name').optional().trim().isLength({ max: 200 }),
    body('phone').optional().trim().isLength({ max: 50 }),
    body('details').optional().isObject(),
    // NOTE: the `website` honeypot is deliberately NOT validated here. A
    // validator would return 400 "Invalid value", telling the bot which field
    // to fix. It's handled in the body below, which returns a plain success.
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { source, email, name = '', phone = '', details = {} } = req.body;

    // Bot detected. Report success so the bot doesn't retry or probe further.
    if (req.body.website) {
      console.log(`Lead rejected (honeypot) from source=${source}`);
      return res.json({ success: true });
    }

    let leadId = null;
    if (supabase) {
      const { data, error } = await supabase
        .from('leads')
        .insert({ source, name, email, phone, details })
        .select('id')
        .single();

      if (error) {
        // Keep going: a stored-nowhere lead still has a chance of reaching Keap,
        // and the operator gets a loud log either way.
        console.error('Lead insert failed:', error);
      } else {
        leadId = data.id;
      }
    } else {
      console.warn('Supabase not configured - lead not persisted');
    }

    // Best-effort CRM sync. Never fails the request.
    let keapStatus = 'skipped';
    let keapContactId = null;
    let keapError = null;

    if (keapService.isConfigured()) {
      const { firstName, lastName } = splitName(name);
      try {
        const result = await keapService.createOrUpdateContact({
          email,
          firstName,
          lastName,
          phone,
          zip: details.zipCode || '',
          source: SOURCE_LABELS[source],
          tags: LEAD_SOURCE_TAGS[source] || [],
        });
        if (result.success) {
          keapStatus = 'synced';
          keapContactId = result.contactId;
        } else {
          keapStatus = 'failed';
          keapError = result.error;
        }
      } catch (err) {
        keapStatus = 'failed';
        keapError = err.message;
        console.error('Keap sync threw for lead:', err);
      }
    }

    if (leadId && supabase && keapStatus !== 'skipped') {
      const { error } = await supabase
        .from('leads')
        .update({
          keap_contact_id: keapContactId,
          keap_sync_status: keapStatus,
          keap_error: keapError,
        })
        .eq('id', leadId);
      if (error) console.error('Lead Keap-status update failed:', error);
    }

    if (!leadId && keapStatus !== 'synced') {
      // Nothing captured the lead anywhere — the user must be told, otherwise
      // they walk away believing they contacted us.
      return res.status(503).json({
        success: false,
        error: 'We could not record your message. Please call us at (855) 213-6300.',
      });
    }

    res.json({ success: true });
  }
);

module.exports = router;
