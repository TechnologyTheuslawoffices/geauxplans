/**
 * Doc Tools API Service
 * Document generation service
 */

// Your private DocTools deployment
const DOCTOOLS_CONFIG = {
  baseUrl: process.env.DOCTOOLS_URL || 'doc-tools-geaux-ventures.vercel.app',
  apiKey: process.env.DOCTOOLS_API_KEY || '', // Optional: add API key for security
};

/**
 * Make request to DocTools using fetch
 */
async function makeRequest(method, path, data = null) {
  const url = `https://${DOCTOOLS_CONFIG.baseUrl}${path}`;
  console.log(`DocTools API: ${method} ${url}`);
  console.log(`DocTools API: Using DOCTOOLS_URL env: ${process.env.DOCTOOLS_URL}`);

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (DOCTOOLS_CONFIG.apiKey) {
    options.headers['Authorization'] = `Bearer ${DOCTOOLS_CONFIG.apiKey}`;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const text = await response.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = text;
    }

    if (response.ok) {
      return json;
    } else {
      console.error(`DocTools API Error: Status ${response.status}, Response:`, text);
      throw { status: response.status, error: json };
    }
  } catch (error) {
    console.error('DocTools API fetch error:', error);
    throw error;
  }
}

/**
 * Create a POA record (like Knackly createRecordItem)
 */
async function createRecordItem(formData, formType = 'powerOfAttorneyForm') {
  return makeRequest('POST', '/api/poa', {
    formData,
    formType,
  });
}

/**
 * Get record status and documents
 * Normalizes response to match expected format (status: 'Completed', files: [...])
 */
async function getDocuments(recordId) {
  const response = await makeRequest('GET', `/api/poa?recordId=${recordId}`);

  // Normalize status: doc-tools returns 'completed' (lowercase), Knackly expects 'Ok' or 'Completed'
  const normalizedStatus =
    response.status === 'completed' ? 'Completed' :
    response.status === 'partial' ? 'Processing' :
    response.status;

  // Normalize documents to files format (doc-tools returns 'documents', Knackly expects 'files')
  const files = (response.documents || response.files || []).map((doc) => {
    if (typeof doc === 'string') {
      return { name: doc, publicUrl: null, url: null };
    }
    return doc;
  });

  return {
    ...response,
    status: normalizedStatus,
    files: files,
  };
}

/**
 * Generate documents for a record
 */
async function generateDocuments(recordId, templates) {
  // Default templates for POA (including HIPAA)
  const defaultTemplates = ['ClientFPOA', 'ClientHPOATemplate', 'ClientHCD', 'ClientHipaa'];

  return makeRequest('POST', '/api/poa/generate', {
    recordId,
    templates: templates || defaultTemplates,
  });
}

/**
 * form_type -> EstatePlanning catalog app name.
 *
 * Owned by `knacklyMapping` because the local engine needs it to pick an app;
 * re-exported here so the two services cannot drift into disagreeing about
 * which plan a form type means.
 */
const { FORM_TYPE_TO_APP } = require('./knacklyMapping');

/**
 * Template bundles transcribed from the `templates` field of each app in the
 * EstatePlanning catalog, which is the authoritative source.
 *
 * The catalog writes the two Act-of-Donation templates as namespaced
 * child-catalog references (`GeauxAODHome.GeauxHome`). doc-tools resolves
 * templates by filename, so the bare names are used here.
 */
const APP_TEMPLATES = {
  'Power of Attorney Supplement Solo Documents': [
    'ClientFPOA', 'ClientHPOATemplate', 'ClientHCD', 'ClientHipaa',
  ],
  'Power of Attorney Supplement': [
    'ClientFPOA', 'SpouseFPOA', 'ClientHPOATemplate', 'SpouseHPOATemplate',
    'ClientHCD', 'SpouseHCD', 'ClientHipaa', 'SpouseHipaa',
  ],
  'Minor Child-Centered Estate Plan Solo Documents': [
    'ClientSimpleWill', 'ClientWillCodicil',
    'ClientFPOA', 'ClientHPOATemplate', 'ClientHipaa', 'ClientHCD',
  ],
  'Minor Child-Centered Estate Plan': [
    'ClientSimpleWill', 'ClientWillCodicil', 'SpouseSimpleWill', 'SpouseWillCodicil',
    'ClientFPOA', 'SpouseFPOA', 'ClientHPOATemplate', 'SpouseHPOATemplate',
    'ClientHipaa', 'SpouseHipaa', 'ClientHCD', 'SpouseHCD',
  ],
  'Will-Based Estate Plan Solo Documents': [
    'GeauxSignInstructions', 'ClientSimpleWill', 'ClientWillCodicil',
    'ClientFPOA', 'ClientHPOATemplate', 'ClientHipaa', 'ClientHCD',
  ],
  'Will-Based Estate Plan': [
    'GeauxSignInstructions',
    'ClientSimpleWill', 'ClientWillCodicil', 'SpouseSimpleWill', 'SpouseWillCodicil',
    'ClientFPOA', 'SpouseFPOA', 'ClientHPOATemplate', 'SpouseHPOATemplate',
    'ClientHipaa', 'SpouseHipaa', 'ClientHCD', 'SpouseHCD',
  ],
  'Trust-Based Estate Plan Solo Documents': [
    'GeauxSignInstructions', 'GeauxSingleTrustPortfolio', 'GeauxSingleTrust',
    'CertofTrust', 'ClientPourover',
    'ClientFPOA', 'ClientHPOATemplate', 'ClientHipaa', 'ClientHCD',
    'GeauxHome', 'SingleExtractGeaux', 'GeaxTrustFundInstruct',
  ],
  'Trust-Based Estate Plan': [
    'GeauxSignInstructions', 'GeauxMarriedTrustPortfolio', 'GeauxJointTrust',
    'CertofTrust', 'ClientPourover', 'SpousePourover',
    'ClientFPOA', 'SpouseFPOA', 'ClientHPOATemplate', 'SpouseHPOATemplate',
    'ClientHipaa', 'SpouseHipaa', 'ClientHCD', 'SpouseHCD',
    'GeauxHome', 'JointExtractGeaux', 'GeaxTrustFundInstruct',
  ],
};

/**
 * Resolve the template bundle for a form type.
 */
function templatesForFormType(formType) {
  const appName = FORM_TYPE_TO_APP[formType];
  if (appName) return APP_TEMPLATES[appName];

  // Unrecognised form type: derive the closest app from the type string rather
  // than silently shipping a POA-only bundle, which previously caused
  // will-based and minor-child plans to generate no will at all.
  const twoPerson = /2person/i.test(formType || '');
  const family =
    /trust/i.test(formType || '') ? 'Trust-Based Estate Plan' :
    /will/i.test(formType || '') ? 'Will-Based Estate Plan' :
    /minorchild/i.test(formType || '') ? 'Minor Child-Centered Estate Plan' :
    'Power of Attorney Supplement';
  const resolved = twoPerson ? family : `${family} Solo Documents`;
  console.warn(`DocTools: unmapped form_type "${formType}", falling back to "${resolved}"`);
  return APP_TEMPLATES[resolved];
}

/**
 * Process a submission through DocTools
 */
async function processSubmission(submission) {
  try {
    console.log(`DocTools: Processing submission ${submission.id} (formType: ${submission.form_type})`);

    const formData = typeof submission.form_data === 'string'
      ? JSON.parse(submission.form_data)
      : submission.form_data;

    // Create record
    const result = await createRecordItem(formData, submission.form_type);
    console.log(`DocTools: Record created with ID ${result.id}`);
    // DEBUG: Log spouse address debug info from doc-tools
    if (result._debug) {
      console.log('DocTools: DEBUG spouse address info:', JSON.stringify(result._debug, null, 2));
    }

    const templates = templatesForFormType(submission.form_type);

    // Generate documents
    console.log(`DocTools: Generating documents for record ${result.id}...`);
    const genResult = await generateDocuments(result.id, templates);
    console.log(`DocTools: Generated ${genResult.documents?.length || 0} documents`);

    return {
      success: true,
      recordId: result.id,
      status: 'completed',
      documents: genResult.documents || [],
    };
  } catch (error) {
    console.error('DocTools: Failed to process submission:', error);
    console.error('DocTools: Error type:', typeof error);
    console.error('DocTools: Error stringified:', JSON.stringify(error, null, 2));
    const errorMsg = error?.message || error?.error?.error || error?.error ||
                     (typeof error === 'string' ? error : JSON.stringify(error));
    return {
      success: false,
      error: errorMsg || 'Unknown error',
    };
  }
}

/**
 * Test connection
 */
async function testConnection() {
  try {
    const response = await makeRequest('GET', '/api/docauto/catalogs');
    return response.catalogs && response.catalogs.length > 0;
  } catch (error) {
    console.error('DocTools connection test failed:', error);
    return false;
  }
}

module.exports = {
  createRecordItem,
  getDocuments,
  generateDocuments,
  processSubmission,
  testConnection,
  templatesForFormType,
  FORM_TYPE_TO_APP,
  APP_TEMPLATES,
};
