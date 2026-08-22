/**
 * Keap (Infusionsoft) Integration Service
 * Supports Personal Access Token (PAT) - simpler, no refresh needed
 */

const { supabase } = require('../config/supabase');

// Keap API Configuration
const KEAP_API_BASE = 'https://api.infusionsoft.com/crm/rest/v1';

/**
 * TAG POLICY: this service applies TRIGGER tags only.
 * ---------------------------------------------------
 * The Keap account categorises every tag as Trigger, History, Status or
 * Prospect. A Trigger tag exists to start a campaign; that campaign is what
 * stamps the matching History tag (e.g. 498 "Completed Purchase") and moves
 * the Status tag (e.g. 1174 "Client - Estate Planning (POA Supplement)").
 *
 * The backend must not write History or Status tags itself. Campaigns mutate
 * that same lifecycle state, so a contact tagged from both sides can end up
 * classified as both a current and a past client with no way to tell which
 * write came last. Applying the trigger and letting the campaign own the rest
 * keeps a single writer per piece of state.
 */

/**
 * Stripe product id -> Keap trigger tags applied on a completed purchase.
 *
 * 1400 fires on every purchase; the account has a parallel 1424 "(Any Business
 * Product)", which is what tells us 1400 is meant to sit alongside a
 * product-specific trigger rather than replace it.
 */
const ANY_PURCHASE_TAG = 1400; // GeauxPlans - Completed Purchase (Any Product)

const PRODUCT_TAGS = {
  614: [ANY_PURCHASE_TAG, 380],  // POA Supplement
  606: [ANY_PURCHASE_TAG, 378],  // Minor Child-Centered Plan
  673: [ANY_PURCHASE_TAG, 382],  // Will-Based Plan
  676: [ANY_PURCHASE_TAG, 384],  // Trust-Based Plan
  1367: [ANY_PURCHASE_TAG, 885], // Legal Edge Plan (subscription)
};

/**
 * Form type -> Keap trigger tags applied when the client finishes the
 * interview.
 *
 * Every estate-planning form maps to the same tag: the account has one
 * 1354 "Completed Interview" trigger for estate planning (1458 is its
 * business-formation counterpart) and no per-plan variant. Which plan they
 * completed is already carried by the purchase tag applied at checkout.
 *
 * The map is kept keyed by form type so a per-plan tag can be dropped in later
 * without touching the call sites.
 */
const COMPLETED_INTERVIEW_TAG = 1354; // GeauxPlans - Completed Interview

const FORM_TYPE_TAGS = {
  powerOfAttorneyForm: [COMPLETED_INTERVIEW_TAG],
  powerOfAttorneyForm2Person: [COMPLETED_INTERVIEW_TAG],
  trustBasedEstatePlanSolo: [COMPLETED_INTERVIEW_TAG],
  trustBasedEstatePlan2Person: [COMPLETED_INTERVIEW_TAG],
  willBasedEstatePlan: [COMPLETED_INTERVIEW_TAG],
  willBasedEstatePlan2Person: [COMPLETED_INTERVIEW_TAG],
  minorChildEstatePlan: [COMPLETED_INTERVIEW_TAG],
  minorChildEstatePlan2Person: [COMPLETED_INTERVIEW_TAG],
};

/**
 * Applied only once the engine has actually produced the documents, which is a
 * later and separate moment from finishing the interview: a submission can be
 * marked complete and still be blocked by a precondition failure.
 */
const DOCUMENTS_COMPLETE_TAGS = [1362]; // GeauxPlans - Documents Complete

/**
 * Public marketing form source -> trigger tags. Used by routes/leads.js.
 *
 * `contact` is deliberately empty: the account has no trigger tag for the
 * contact form (386 "GeauxPlans Contact" is a History tag), and the nearest
 * triggers — 836 "Start - GeauxPlans Sales Campaign", 1128 "Prospect" — would
 * push someone who asked a support question into a sales sequence. The contact
 * is still created; it just starts no campaign.
 */
const LEAD_SOURCE_TAGS = {
  contact: [],
  webinar_rsvp: [318],          // Webinar Registrant (GeauxPlans)
  webinar_registration: [318],  // Webinar Registrant (GeauxPlans)
};

/**
 * The full set of trigger tags a completed submission should end up carrying.
 *
 * Finishing the interview and having documents are separate milestones: a
 * submission can be marked completed and still be blocked by a precondition
 * failure, and that client must not be told their documents are ready.
 */
function submissionTags(formType, { documentsGenerated = false } = {}) {
  return [
    ...(FORM_TYPE_TAGS[formType] || []),
    ...(documentsGenerated ? DOCUMENTS_COMPLETE_TAGS : []),
  ];
}

/**
 * Every tag id this service is configured to apply.
 *
 * applyTags swallows failures, so a typo'd or deleted id would silently stop a
 * campaign from ever firing with nothing but a log line to show for it. The
 * /test-keap endpoint checks this list against the live account so a bad id is
 * caught deliberately rather than discovered from missing client email.
 */
function configuredTagIds() {
  return [...new Set([
    ...Object.values(PRODUCT_TAGS).flat(),
    ...Object.values(FORM_TYPE_TAGS).flat(),
    ...DOCUMENTS_COMPLETE_TAGS,
    ...Object.values(LEAD_SOURCE_TAGS).flat(),
  ])];
}

class KeapService {
  constructor() {
    // Personal Access Token - only env var needed
    this.accessToken = process.env.KEAP_ACCESS_TOKEN;
  }

  /**
   * Check if Keap is configured
   */
  isConfigured() {
    return !!this.accessToken;
  }

  /**
   * Make authenticated API request to Keap
   */
  async apiRequest(endpoint, method = 'GET', body = null) {
    if (!this.accessToken) {
      console.log('Keap not configured - skipping API call');
      return null;
    }

    const url = `${KEAP_API_BASE}${endpoint}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (response.status === 401) {
        console.error('Keap API: Unauthorized - check your Personal Access Token');
        throw new Error('Keap authentication failed - token may be invalid or expired');
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Keap API error (${response.status}): ${error}`);
      }

      // Handle empty responses
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch (error) {
      console.error(`Keap API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Search for contact by email
   */
  async findContactByEmail(email) {
    try {
      const result = await this.apiRequest(`/contacts?email=${encodeURIComponent(email)}`);
      if (result.contacts && result.contacts.length > 0) {
        return result.contacts[0];
      }
      return null;
    } catch (error) {
      console.error('Failed to search Keap contact:', error);
      return null;
    }
  }

  /**
   * Create or update a contact in Keap
   */
  async createOrUpdateContact(contactData) {
    const {
      email,
      firstName,
      lastName,
      middleName,
      phone,
      address,
      city,
      state,
      zip,
      source,
      tags = [],
    } = contactData;

    // Build contact payload
    const payload = {
      given_name: firstName,
      family_name: lastName,
      opt_in_reason: source || 'GeauxPlans Website',
    };

    if (middleName) {
      payload.middle_name = middleName;
    }

    if (email) {
      payload.email_addresses = [{
        email: email,
        field: 'EMAIL1',
      }];
    }

    if (phone) {
      payload.phone_numbers = [{
        number: phone,
        field: 'PHONE1',
      }];
    }

    if (address || city || state || zip) {
      payload.addresses = [{
        line1: address || '',
        locality: city || '',
        region: state || '',
        postal_code: zip || '',
        country_code: 'USA',
        field: 'BILLING',
      }];
    }

    try {
      // Check for existing contact
      const existingContact = await this.findContactByEmail(email);

      let contact;
      if (existingContact) {
        // Update existing contact
        contact = await this.apiRequest(`/contacts/${existingContact.id}`, 'PATCH', payload);
        console.log(`Keap contact updated: ${existingContact.id}`);
      } else {
        // Create new contact
        contact = await this.apiRequest('/contacts', 'POST', payload);
        console.log(`Keap contact created: ${contact.id}`);
      }

      // Apply tags if provided
      if (tags.length > 0 && contact.id) {
        await this.applyTags(contact.id, tags);
      }

      return {
        success: true,
        contactId: contact.id,
        isNew: !existingContact,
      };
    } catch (error) {
      console.error('Failed to create/update Keap contact:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Apply tags to a contact
   */
  async applyTags(contactId, tagIds) {
    if (!tagIds || tagIds.length === 0) return;

    try {
      await this.apiRequest(`/contacts/${contactId}/tags`, 'POST', {
        tagIds: tagIds,
      });
      console.log(`Applied tags ${tagIds.join(', ')} to contact ${contactId}`);
      return true;
    } catch (error) {
      console.error('Failed to apply Keap tags:', error);
      return false;
    }
  }

  /**
   * Get all available tags from Keap
   */
  async getTags() {
    try {
      const result = await this.apiRequest('/tags?limit=1000');
      return result.tags || [];
    } catch (error) {
      console.error('Failed to get Keap tags:', error);
      return [];
    }
  }

  /**
   * Handle form submission - send contact to Keap
   *
   * @param {object} formData
   * @param {string} formType
   * @param {number[]|null} tags - explicit tag list, which REPLACES the
   *   form-type default. Callers that track which tags a submission has already
   *   received pass the remaining ones here so a resubmit does not re-fire a
   *   campaign. Pass null to get the default set for the form type.
   */
  async handleFormSubmission(formData, formType, tags = null) {
    const personalInfo = formData.personal_info || {};

    const contactData = {
      email: personalInfo.email || '',
      firstName: personalInfo.first_name || '',
      lastName: personalInfo.surname || '',
      middleName: personalInfo.middle_name || '',
      phone: personalInfo.phone_number || '',
      address: personalInfo.street_address || '',
      city: personalInfo.city || '',
      state: personalInfo.state || '',
      zip: personalInfo.zip || '',
      source: `GeauxPlans Form: ${formType}`,
      tags: tags === null ? submissionTags(formType) : tags,
    };

    // Only proceed if we have at least an email or name
    if (!contactData.email && !contactData.firstName) {
      console.log('Skipping Keap sync - no email or name provided');
      return { success: false, error: 'No contact data' };
    }

    return await this.createOrUpdateContact(contactData);
  }

  /**
   * Handle purchase - send contact to Keap with product tags
   */
  async handlePurchase(customerData, productId) {
    const contactData = {
      email: customerData.email || '',
      firstName: customerData.firstName || '',
      lastName: customerData.lastName || '',
      phone: customerData.phone || '',
      source: `GeauxPlans Purchase: Product ${productId}`,
      tags: PRODUCT_TAGS[productId] || [],
    };

    if (!contactData.email) {
      console.log('Skipping Keap sync - no email provided');
      return { success: false, error: 'No email' };
    }

    return await this.createOrUpdateContact(contactData);
  }

  /**
   * Log Keap interaction to database
   */
  async logInteraction(type, data, response) {
    if (!supabase) return;

    try {
      await supabase.from('keap_log').insert({
        event_type: type,
        request_data: data,
        response_data: response,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to log Keap interaction:', err);
    }
  }
}

// Export singleton instance
const keapService = new KeapService();

module.exports = {
  keapService,
  KeapService,
  PRODUCT_TAGS,
  FORM_TYPE_TAGS,
  DOCUMENTS_COMPLETE_TAGS,
  LEAD_SOURCE_TAGS,
  submissionTags,
  configuredTagIds,
};
