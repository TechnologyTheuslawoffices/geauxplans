/**
 * Knackly Document Automation Service
 * Handles API integration with Knackly for document generation
 *
 * Based on WordPress implementation from class-client.php
 */

const https = require('https');

// Knackly API configuration (matching WordPress implementation)
const KNACKLY_CONFIG = {
  baseUrl: process.env.KNACKLY_BASE_URL || 'api.knackly.io',
  workspace: process.env.KNACKLY_WORKSPACE || 'geauxplans',
  // API credentials (KeyID and Secret - matching WordPress field names)
  keyId: process.env.KNACKLY_KEY_ID || '6113e4d42bd0c544e84e4892',
  secret: process.env.KNACKLY_SECRET || '1100ac250f4bf297b5900c5aba3ddfdd29e8b9afa88f6e9d3acc5a896dcf40a22908f2ecd35bb26aa0953433b097599f2e09f1badca3510c692cfe0e949aa4f0ecc193adab7dd1c45a5dad175fd11efa474e278093754cd82278f16f8c8802d759572af3295a2eecfe36aa05cf2194f984b380c38a242f3593c7bd84026b2d9fd8f80ed4ea79c20fbf607ce23d6dd5f4ab71a97cadba5c86a4c537170d5268d4fbfbbed55b56e112959728792198c608ff9686c2e0acf9e68a7e26fa9910eadce1ae8dd4f5f2a2b6530aa3a3d78f6c5c24883a59b6614a350ecb6d2bb3c5ce7a84f2f7fd3a29fc364d8c59b5f27cf215e74919965f1ffa2513ba0239570343a6',

  // API paths (matching WordPress implementation)
  paths: {
    auth: '/auth/login',  // Note: /auth/login NOT /auth/token
    powerOfAttorneyForm: '/catalogs/GeauxPlans/apps/Power%20of%20Attorney%20Supplement%20Solo%20Documents',
    powerOfAttorneyForm2Person: '/catalogs/GeauxPlans/apps/Power%20of%20Attorney%20Supplement',
    trustBasedEstatePlanSolo: '/catalogs/GeauxPlans/apps/Trust-Based%20Estate%20Plan%20Solo%20Documents',
    trustBasedEstatePlan2Person: '/catalogs/GeauxPlans/apps/Trust-Based%20Estate%20Plan',
  },
};

// Token cache (for token-based auth)
let accessToken = null;
let tokenExpiry = null;

/**
 * Make an HTTPS request to Knackly API
 * @param {string} method - HTTP method
 * @param {string} path - API path (will be prefixed with workspace/api/v1)
 * @param {object|null} data - Request body
 * @param {string|null} token - Bearer token for authorization
 */
function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    // Build full path: /{workspace}/api/v1{path}
    const fullPath = `/${KNACKLY_CONFIG.workspace}/api/v1${path}`;

    console.log(`Knackly API Request: ${method} https://${KNACKLY_CONFIG.baseUrl}${fullPath}`);

    const options = {
      hostname: KNACKLY_CONFIG.baseUrl,
      port: 443,
      path: fullPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Add Bearer token if provided
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`Knackly Response Status: ${res.statusCode}`);
        if (res.statusCode !== 200) {
          console.log(`Knackly Response Body: ${body.substring(0, 500)}`);
        }

        try {
          const response = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject({ status: res.statusCode, error: response });
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject({ status: res.statusCode, error: body });
          }
        }
      });
    });

    req.on('error', reject);

    if (data) {
      const jsonData = JSON.stringify(data);
      req.write(jsonData);
    }
    req.end();
  });
}

/**
 * Get access token from Knackly
 * Uses /auth/login endpoint with KeyID and Secret (matching WordPress implementation)
 */
async function getAccessToken() {
  // Return cached token if still valid (tokens expire in ~7 days based on JWT)
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log('Knackly: Using cached access token');
    return accessToken;
  }

  try {
    console.log('Knackly: Requesting fresh access token...');

    // Use correct endpoint and field names (matching WordPress class-client.php)
    const response = await makeRequest('POST', KNACKLY_CONFIG.paths.auth, {
      KeyID: KNACKLY_CONFIG.keyId,
      Secret: KNACKLY_CONFIG.secret,
    });

    accessToken = response.token;

    // Token expires in ~7 days, but refresh after 6 days to be safe
    tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000);

    console.log('Knackly: Access token obtained successfully');
    return accessToken;
  } catch (error) {
    console.error('Knackly: Failed to get access token:', error);
    throw new Error('Failed to authenticate with Knackly');
  }
}

/**
 * Get available catalogs
 */
async function getCatalogs() {
  const token = await getAccessToken();
  return makeRequest('GET', '/catalogs', null, token);
}

/**
 * Get apps for a catalog
 */
async function getAppsForCatalog(catalogId) {
  const token = await getAccessToken();
  return makeRequest('GET', `/catalogs/${catalogId}/apps`, null, token);
}

/**
 * Get properties/schema for an app
 */
async function getAppProperties(catalogId, appId) {
  const token = await getAccessToken();
  return makeRequest('GET', `/catalogs/${catalogId}/apps/${encodeURIComponent(appId)}/properties`, null, token);
}

/**
 * Get the app endpoint for a form type (matching WordPress implementation)
 */
function getAppEndpoint(formType) {
  return KNACKLY_CONFIG.paths[formType] || KNACKLY_CONFIG.paths.powerOfAttorneyForm;
}

/**
 * Create a new record item in Knackly (matching WordPress create_record_item)
 */
async function createRecordItem(formData, formType = 'powerOfAttorneyForm') {
  const token = await getAccessToken();

  // Transform form data to Knackly format
  const knacklyData = transformFormDataToKnackly(formData);

  // Get the correct endpoint for this form type
  const endpoint = getAppEndpoint(formType);

  return makeRequest('POST', endpoint, knacklyData, token);
}

/**
 * Get documents for a record (matching WordPress get_documents)
 */
async function getDocuments(recordId, formType = 'powerOfAttorneyForm') {
  const token = await getAccessToken();

  // Get app name from form type
  const appNames = {
    powerOfAttorneyForm: 'Power%20of%20Attorney%20Supplement%20Solo%20Documents',
    powerOfAttorneyForm2Person: 'Power%20of%20Attorney%20Supplement',
    trustBasedEstatePlanSolo: 'Trust-Based%20Estate%20Plan%20Solo%20Documents',
    trustBasedEstatePlan2Person: 'Trust-Based%20Estate%20Plan',
  };
  const appName = appNames[formType] || appNames.powerOfAttorneyForm;

  const path = `/catalogs/GeauxPlans/items/${recordId}/apps/${appName}`;
  return makeRequest('GET', path, null, token);
}

/**
 * Get record item details using the load endpoint
 */
async function getRecordItem(recordId, formType = 'powerOfAttorneyForm') {
  const token = await getAccessToken();

  const appNames = {
    powerOfAttorneyForm: 'Power%20of%20Attorney%20Supplement%20Solo%20Documents',
    powerOfAttorneyForm2Person: 'Power%20of%20Attorney%20Supplement',
    trustBasedEstatePlanSolo: 'Trust-Based%20Estate%20Plan%20Solo%20Documents',
    trustBasedEstatePlan2Person: 'Trust-Based%20Estate%20Plan',
  };
  const appName = appNames[formType] || appNames.powerOfAttorneyForm;

  // Use the /load/ endpoint which returns id$ fields
  const path = `/collections/GeauxPlans/apps/${appName}/load/${recordId}`;
  return makeRequest('GET', path, null, token);
}

/**
 * Regenerate documents for a record
 */
async function regenerateDocuments(recordId, formType = 'powerOfAttorneyForm') {
  const token = await getAccessToken();

  const appNames = {
    powerOfAttorneyForm: 'Power%20of%20Attorney%20Supplement%20Solo%20Documents',
    powerOfAttorneyForm2Person: 'Power%20of%20Attorney%20Supplement',
    trustBasedEstatePlanSolo: 'Trust-Based%20Estate%20Plan%20Solo%20Documents',
    trustBasedEstatePlan2Person: 'Trust-Based%20Estate%20Plan',
  };
  const appName = appNames[formType] || appNames.powerOfAttorneyForm;

  const path = `/catalogs/GeauxPlans/items/${recordId}/apps/${appName}`;
  return makeRequest('POST', path, {}, token);
}

/**
 * Get status of document generation (legacy wrapper)
 */
async function getRecordStatus(catalogId, recordId, appId) {
  // Use getDocuments which returns the record status
  return getDocuments(recordId);
}

/**
 * Get generated documents for a record (legacy wrapper)
 */
async function getRecordDocuments(catalogId, recordId) {
  return getDocuments(recordId);
}

/**
 * Transform form data from our format to Knackly's expected format
 * Based on WordPress class-form-data-mapper.php implementation
 */
function transformFormDataToKnackly(formData) {
  const knacklyData = {};
  const allParties = formData.people_or_entities_who_will_serve_as_agents?.parties || [];

  // Helper to format date
  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  // Helper to get agent name for linking (first + last only for individuals, entity_name for entities)
  const getAgentName = (name) => {
    if (!name) return '';
    for (const party of allParties) {
      if ((party.type_of_party || '') === 'An entity') {
        if ((party.entity_name || '').trim() === name.trim()) {
          return party.entity_name;
        }
      } else {
        const possible = [
          `${party.first_name || ''} ${party.middle_name || ''} ${party.surname || ''}`.trim(),
          `${party.first_name || ''} ${party.surname || ''}`.trim()
        ];
        if (possible.includes(name.trim())) {
          return `${party.first_name || ''} ${party.surname || ''}`.trim();
        }
      }
    }
    return name;
  };

  // Map OtherParties (agents/parties)
  if (allParties.length > 0) {
    knacklyData.OtherParties = allParties.map(party => {
      const mappedParty = {};

      if ((party.type_of_party || '') === 'An entity') {
        mappedParty.PartyType = 'Entity';
        mappedParty.EntityName = party.entity_name || '';
        mappedParty.EIN = party.last_4_ein_digits || '';
        if (party.signers && Array.isArray(party.signers)) {
          mappedParty.GeauxSigners = party.signers.map(signer => ({
            SignerFirstName: signer.first_name || '',
            SignerMiddleName: signer.middle_name || '',
            SignerLastName: signer.surname || '',
            SignerSuffix: signer.suffix || '',
            SignerTitle: signer.title || '',
          })).filter(s => Object.values(s).some(v => v));
        }
        mappedParty['id$'] = mappedParty.EntityName;
      } else {
        mappedParty.PartyType = 'Individual';
        mappedParty.First = party.first_name || '';
        mappedParty.Middle = party.middle_name || '';
        mappedParty.Last = party.surname || '';
        mappedParty.Suffix = party.suffix || '';
        mappedParty.Gender = (party.gender || '').toLowerCase();
        mappedParty.GeauxSSN = party.last_4_ssn_digits || '';
        if (party.relationship_with_person) {
          mappedParty.RelateClient = (party.relationship_with_person || '').toLowerCase();
        }
        mappedParty['id$'] = `${mappedParty.First} ${mappedParty.Last}`.trim();
      }

      const sameAddress = party.same_address_as_person_granting_power_of_attorney;
      if (sameAddress === true || sameAddress === 'true' || sameAddress === '1' || sameAddress === 1) {
        mappedParty.SameAddressTF = true;
        if (party.parish) mappedParty.Parish = party.parish;
      } else {
        if (party.street_address) mappedParty.StreetAddress1 = party.street_address;
        if (party.street_address_2) mappedParty.StreetAddress2 = party.street_address_2;
        if (party.city) mappedParty.City = party.city;
        if (party.state) mappedParty.State = party.state;
        if (party.zip) mappedParty.Zip = party.zip;
        if (party.parish) mappedParty.Parish = party.parish;
      }

      return mappedParty;
    });
  }

  // Map Client data
  if (formData.personal_info) {
    const pi = formData.personal_info;
    const client = {
      First: pi.first_name || '',
      Middle: pi.middle_name || '',
      Last: pi.surname || '',
      Suffix: pi.suffix || '',
      Gender: (pi.gender || '').toLowerCase(),
      Birthdate: formatDate(pi.date_of_birth),
      StreetAddress1: pi.street_address || '',
      StreetAddress2: pi.street_address_2 || '',
      City: pi.city || '',
      State: pi.state || '',
      Zip: pi.zip || '',
      Parish: pi.parish || '',
      GeauxSSN: pi.last_4_ssn_digits || '',
      Phone: pi.phone || pi.phone_number || '',
    };
    // Filter out empty values
    knacklyData.Client = Object.fromEntries(
      Object.entries(client).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
    );
  }

  // Map FPOA data
  if (formData.fpoa?.fpoa_initial_agents) {
    const fpoaAgents = formData.fpoa.fpoa_initial_agents;
    knacklyData.ClientAgentsFPOA = {
      AgentSelect: getAgentName(fpoaAgents.person_to_serve || ''),
      CoAgentSelect: getAgentName(fpoaAgents.second_coagent_person_to_serve || '')
    };

    const hasSuccessors = (fpoaAgents.has_appointer_successor_agents || '') === 'Yes';
    knacklyData.ClientFPOASuccessors = hasSuccessors;

    if (hasSuccessors && fpoaAgents.successor_agents && Array.isArray(fpoaAgents.successor_agents)) {
      knacklyData.ClientFPOASuccAgents = fpoaAgents.successor_agents.map(successor => ({
        AgentSelect: getAgentName(successor.successor_agent_to_serve || ''),
        CoAgentSelect: getAgentName(successor.second_successor_coagent_to_serve || '')
      }));
    }
  }

  // Map HCPOA data
  if (formData.hcpoa) {
    const hcpoa = formData.hcpoa;

    if (hcpoa.wish_to_be_organ_donor !== undefined) {
      knacklyData.ClientOrganTF = hcpoa.wish_to_be_organ_donor === 'Yes';
    }
    if (hcpoa.wish_to_donate_body_to_science !== undefined) {
      knacklyData.ClientDonateScienceTF = hcpoa.wish_to_donate_body_to_science === 'Yes';
    }

    if (hcpoa.hcpoa_initial_agents) {
      const agents = hcpoa.hcpoa_initial_agents;
      knacklyData.ClientAgentsHPOA = {
        AgentSelect: getAgentName(agents.person_to_serve || ''),
        CoAgentSelect: getAgentName(agents.second_coagent_person_to_serve || '')
      };

      const hasSuccessors = (agents.has_appointed_successor_agents || '') === 'Yes';
      knacklyData.ClientHPOASuccessors = hasSuccessors;

      if (hasSuccessors && agents.successor_agents && Array.isArray(agents.successor_agents)) {
        knacklyData.ClientHPOASuccAgents = agents.successor_agents.map(successor => ({
          AgentSelect: getAgentName(successor.successor_agent_to_serve || ''),
          CoAgentSelect: getAgentName(successor.second_successor_coagent_to_serve || '')
        }));
      }
    }
  }

  // Map Healthcare Directive data
  if (formData.hcd) {
    const hcd = formData.hcd;
    const option = hcd.life_support_option || '';

    if (option === 'WITHDRAW - withhold and remove all life support' || option === '' || option === null) {
      knacklyData.GeauxHCDClientNone = 'None';
    } else if (option === 'Choose all that apply from the options below:' || option === 'Choose') {
      knacklyData.GeauxHCDClientNone = 'Choose';
      if (hcd.client_hcds && Array.isArray(hcd.client_hcds)) {
        knacklyData.GeauxClientHCDs = hcd.client_hcds;
      }
    }
  }

  console.log('Knackly: Transformed data:', JSON.stringify(knacklyData, null, 2));
  return knacklyData;
}

/**
 * Process a submission through Knackly
 * This is the main function called when a form is submitted
 * Matches WordPress implementation for compatibility
 */
async function processSubmission(submission, catalogId, appId) {
  try {
    console.log(`Knackly: Processing submission ${submission.id} (formType: ${submission.form_type})`);

    // Parse form data
    const formData = typeof submission.form_data === 'string'
      ? JSON.parse(submission.form_data)
      : submission.form_data;

    // Create record using form type to determine endpoint
    const result = await createRecordItem(formData, submission.form_type);
    const recordId = result.id || result._id;

    console.log(`Knackly: Record created with ID ${recordId}`);

    // Quick poll - only wait 15 seconds max (5 attempts * 3 sec) to stay under Vercel timeout
    console.log(`Knackly: Quick polling for documents...`);
    const maxAttempts = 5;
    const intervalMs = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));

      try {
        const docResult = await getDocuments(recordId, submission.form_type);
        console.log(`Knackly: Poll ${attempt + 1}/${maxAttempts} - status: ${docResult.status}, files: ${docResult.files?.length || 0}`);

        if ((docResult.status === 'Ok' || docResult.status === 'Completed') && docResult.files && docResult.files.length > 0) {
          const documents = docResult.files.map((file) => ({
            name: file.name,
            base64: null,
            publicUrl: file.publicUrl,
            url: file.url,
          }));

          console.log(`Knackly: Documents ready! Found ${documents.length} documents`);
          return {
            success: true,
            recordId: recordId,
            status: 'completed',
            documents: documents,
          };
        }
      } catch (pollError) {
        console.log(`Knackly: Poll error:`, pollError.message);
      }
    }

    // Not ready yet - return recordId so frontend can poll later
    console.log(`Knackly: Documents not ready yet, returning for later polling`);
    return {
      success: true,
      recordId: recordId,
      status: 'processing',
      documents: [],
    };
  } catch (error) {
    console.error('Knackly: Failed to process submission:', error);
    return {
      success: false,
      error: error.message || error.error || 'Unknown error',
    };
  }
}

/**
 * Poll for document completion
 */
async function pollForDocuments(recordId, formType = 'powerOfAttorneyForm', maxAttempts = 30, intervalMs = 5000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await getDocuments(recordId, formType);

      // Check if documents are available
      if (result && result.documents && result.documents.length > 0) {
        return {
          success: true,
          complete: true,
          documents: result.documents,
        };
      }

      if (result && result.status === 'complete') {
        return {
          success: true,
          complete: true,
          documents: result.documents || [],
        };
      }

      if (result && (result.error || result.status === 'error')) {
        return {
          success: false,
          complete: true,
          error: result.error || 'Document generation failed',
        };
      }

      // Not ready yet, wait and try again
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error) {
      console.error(`Knackly: Poll attempt ${attempt + 1} failed:`, error);
    }
  }

  return {
    success: false,
    complete: false,
    error: 'Timeout waiting for documents',
  };
}

/**
 * Test the API connection
 */
async function testConnection() {
  try {
    const token = await getAccessToken();
    return !!token;
  } catch (error) {
    return false;
  }
}

module.exports = {
  getAccessToken,
  getCatalogs,
  getAppsForCatalog,
  getAppProperties,
  createRecordItem,
  getDocuments,
  getRecordItem,
  regenerateDocuments,
  getRecordStatus,
  getRecordDocuments,
  processSubmission,
  pollForDocuments,
  transformFormDataToKnackly,
  testConnection,
};
