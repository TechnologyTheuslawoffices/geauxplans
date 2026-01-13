/**
 * Knackly Document Automation Service
 * Handles API integration with Knackly for document generation
 */

const KNACKLY_CONFIG = {
  baseUrl: process.env.KNACKLY_BASE_URL || 'api.knackly.io',
  workspace: process.env.KNACKLY_WORKSPACE || 'geauxplans',
  keyId: process.env.KNACKLY_KEY_ID || '6113e4d42bd0c544e84e4892',
  secret: process.env.KNACKLY_SECRET || '1100ac250f4bf297b5900c5aba3ddfdd29e8b9afa88f6e9d3acc5a896dcf40a22908f2ecd35bb26aa0953433b097599f2e09f1badca3510c692cfe0e949aa4f0ecc193adab7dd1c45a5dad175fd11efa474e278093754cd82278f16f8c8802d759572af3295a2eecfe36aa05cf2194f984b380c38a242f3593c7bd84026b2d9fd8f80ed4ea79c20fbf607ce23d6dd5f4ab71a97cadba5c86a4c537170d5268d4fbfbbed55b56e112959728792198c608ff9686c2e0acf9e68a7e26fa9910eadce1ae8dd4f5f2a2b6530aa3a3d78f6c5c24883a59b6614a350ecb6d2bb3c5ce7a84f2f7fd3a29fc364d8c59b5f27cf215e74919965f1ffa2513ba0239570343a6',
  paths: {
    auth: '/auth/login',
    powerOfAttorneyForm: '/catalogs/GeauxPlans/apps/Power%20of%20Attorney%20Supplement%20Solo%20Documents',
    powerOfAttorneyForm2Person: '/catalogs/GeauxPlans/apps/Power%20of%20Attorney%20Supplement',
    trustBasedEstatePlanSolo: '/catalogs/GeauxPlans/apps/Trust-Based%20Estate%20Plan%20Solo%20Documents',
    trustBasedEstatePlan2Person: '/catalogs/GeauxPlans/apps/Trust-Based%20Estate%20Plan',
  },
};

let accessToken = null;
let tokenExpiry = null;

/**
 * Make an HTTPS request to Knackly API
 */
async function makeRequest(method, path, data = null, token = null) {
  const fullPath = `/${KNACKLY_CONFIG.workspace}/api/v1${path}`;
  const url = `https://${KNACKLY_CONFIG.baseUrl}${fullPath}`;

  console.log(`Knackly API Request: ${method} ${url}`);

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  const text = await response.text();

  console.log(`Knackly Response Status: ${response.status}`);

  try {
    const json = JSON.parse(text);
    if (response.ok) {
      return json;
    }
    throw { status: response.status, error: json };
  } catch (e) {
    if (response.ok) {
      return text;
    }
    throw { status: response.status, error: text };
  }
}

/**
 * Get access token from Knackly
 */
export async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  console.log('Knackly: Requesting fresh access token...');

  const response = await makeRequest('POST', KNACKLY_CONFIG.paths.auth, {
    KeyID: KNACKLY_CONFIG.keyId,
    Secret: KNACKLY_CONFIG.secret,
  });

  accessToken = response.token;
  tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000); // 6 days

  console.log('Knackly: Access token obtained successfully');
  return accessToken;
}

/**
 * Get the app endpoint for a form type
 */
function getAppEndpoint(formType) {
  return KNACKLY_CONFIG.paths[formType] || KNACKLY_CONFIG.paths.powerOfAttorneyForm;
}

/**
 * Create a new record item in Knackly
 */
export async function createRecordItem(formData, formType = 'powerOfAttorneyForm') {
  const token = await getAccessToken();
  const knacklyData = transformFormDataToKnackly(formData);
  const endpoint = getAppEndpoint(formType);

  console.log('=== KNACKLY CREATE RECORD ===');
  console.log('Form Type:', formType);
  console.log('Endpoint:', endpoint);
  console.log('Original Form Data:', JSON.stringify(formData, null, 2));
  console.log('Transformed Knackly Data:', JSON.stringify(knacklyData, null, 2));
  console.log('=============================');

  return makeRequest('POST', endpoint, knacklyData, token);
}

/**
 * Get documents for a record
 */
export async function getDocuments(recordId, formType = 'powerOfAttorneyForm') {
  const token = await getAccessToken();

  const appNames = {
    powerOfAttorneyForm: 'Power%20of%20Attorney%20Supplement%20Solo%20Documents',
    powerOfAttorneyForm2Person: 'Power%20of%20Attorney%20Supplement',
    trustBasedEstatePlanSolo: 'Trust-Based%20Estate%20Plan%20Solo%20Documents',
    trustBasedEstatePlan2Person: 'Trust-Based%20Estate%20Plan',
  };
  const appName = appNames[formType] || appNames.powerOfAttorneyForm;

  const path = `/catalogs/GeauxPlans/items/${recordId}/apps/${appName}`;
  console.log('=== KNACKLY GET DOCUMENTS ===');
  console.log('Record ID:', recordId);
  console.log('Form Type:', formType);
  console.log('Path:', path);

  const result = await makeRequest('GET', path, null, token);

  console.log('Documents response:', JSON.stringify(result, null, 2));
  console.log('=============================');

  return result;
}

/**
 * Process a submission through Knackly
 */
export async function processSubmission(submission) {
  try {
    console.log(`Knackly: Processing submission ${submission.id} (formType: ${submission.form_type})`);

    const formData = typeof submission.form_data === 'string'
      ? JSON.parse(submission.form_data)
      : submission.form_data;

    console.log('Knackly: Attempting to create record item...');
    const result = await createRecordItem(formData, submission.form_type);

    console.log(`Knackly: Record created with ID ${result.id || result._id}`);

    return {
      success: true,
      recordId: result.id || result._id,
      status: result.status || 'processing',
      url: result.url,
    };
  } catch (error) {
    console.error('Knackly: Failed to process submission:', error);
    const errorMessage = error.error || error.message || JSON.stringify(error);
    console.error('Knackly: Error details:', errorMessage);
    return {
      success: false,
      error: errorMessage,
      errorStatus: error.status,
      errorDetails: typeof error === 'object' ? error : null,
    };
  }
}

/**
 * Transform form data from our format to Knackly's expected format
 */
export function transformFormDataToKnackly(formData) {
  const knacklyData = {};
  const allParties = formData.people_or_entities_who_will_serve_as_agents?.parties || [];

  // === TOP-LEVEL FIELDS (Required by Knackly) ===

  // StateLawSelect - Governing law state (use client's state as default)
  const stateLaw = formData.governing_law ||
                   formData.state_law ||
                   formData.personal_info?.state ||
                   'Louisiana';
  knacklyData.StateLawSelect = stateLaw;

  // ESignTF - Electronic signature checkbox
  const esign = formData.esign ??
                formData.electronic_signature ??
                formData.start?.esign ??
                false;
  knacklyData.ESignTF = esign === true || esign === 'true' || esign === 'Yes';

  // MarriedTF - Is principal married or have life partner?
  const married = formData.married ??
                  formData.personal_info?.married ??
                  formData.personal_info?.has_spouse ??
                  formData.start?.married ??
                  false;
  knacklyData.MarriedTF = married === true || married === 'true' || married === 'Yes';

  // ChildrenTF - Will any children serve as agents?
  const childrenAsAgents = formData.children_as_agents ??
                           formData.agents?.children_as_agents ??
                           false;
  knacklyData.ChildrenTF = childrenAsAgents === true || childrenAsAgents === 'true' || childrenAsAgents === 'Yes';

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return d.toISOString().split('T')[0];
  };

  const getAgentName = (idOrName) => {
    if (!idOrName) return '';
    for (const party of allParties) {
      // Check by party ID first (form stores party.id)
      if (party.id === idOrName) {
        if ((party.type_of_party || '') === 'An entity') {
          return party.entity_name || '';
        } else {
          return `${party.first_name || ''} ${party.surname || ''}`.trim();
        }
      }
      // Also check by name for backwards compatibility
      if ((party.type_of_party || '') === 'An entity') {
        if ((party.entity_name || '').trim() === idOrName.trim()) {
          return party.entity_name;
        }
      } else {
        const possible = [
          `${party.first_name || ''} ${party.middle_name || ''} ${party.surname || ''}`.trim(),
          `${party.first_name || ''} ${party.surname || ''}`.trim()
        ];
        if (possible.includes(idOrName.trim())) {
          return `${party.first_name || ''} ${party.surname || ''}`.trim();
        }
      }
    }
    return idOrName;
  };

  // Map OtherParties
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

      // RequireAddressTF - Whether address is required for this party
      const requireAddress = party.require_address ?? party.requireAddress ?? false;
      mappedParty.RequireAddressTF = requireAddress === true || requireAddress === 'true' || requireAddress === 'Yes';

      // DeceasedTF - Whether this person is deceased
      const deceased = party.deceased ?? party.is_deceased ?? false;
      mappedParty.DeceasedTF = deceased === true || deceased === 'true' || deceased === 'Yes';

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
