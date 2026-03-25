/**
 * Keap (Infusionsoft) Integration Service
 * Supports Personal Access Token (PAT) - simpler, no refresh needed
 */

const { supabase } = require('../config/supabase');

// Keap API Configuration
const KEAP_API_BASE = 'https://api.infusionsoft.com/crm/rest/v1';

// Product to Tag mapping (configure these with actual Keap tag IDs)
const PRODUCT_TAGS = {
  614: [], // POA - add tag IDs here
  606: [], // Minor Child Estate Plan
  673: [], // Will-Based Estate Plan
  676: [], // Trust-Based Estate Plan
  1367: [], // Subscription
};

// Form type to Tag mapping
const FORM_TYPE_TAGS = {
  powerOfAttorneyForm: [],
  powerOfAttorneyForm2Person: [],
  trustBasedEstatePlanSolo: [],
  trustBasedEstatePlan2Person: [],
  willBasedEstatePlan: [],
  willBasedEstatePlan2Person: [],
  minorChildEstatePlan: [],
  minorChildEstatePlan2Person: [],
};

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
   */
  async handleFormSubmission(formData, formType) {
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
      tags: FORM_TYPE_TAGS[formType] || [],
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
};
