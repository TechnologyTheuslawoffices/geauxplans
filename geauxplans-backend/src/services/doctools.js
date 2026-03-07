/**
 * Doc Tools API Service
 * Document generation service
 */

// Your private DocTools deployment
const DOCTOOLS_CONFIG = {
  baseUrl: process.env.DOCTOOLS_URL || 'doc-tools-geaux-counsel.vercel.app',
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
  const defaultTemplates = ['ClientFPOA', 'ClientHPOA', 'ClientHCD', 'ClientHipaa'];

  return makeRequest('POST', '/api/poa/generate', {
    recordId,
    templates: templates || defaultTemplates,
  });
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

    // Determine which templates to generate based on form type
    const isTwoPerson = submission.form_type?.includes('2Person');
    const templates = isTwoPerson
      ? ['ClientFPOA', 'SpouseFPOA', 'ClientHPOA', 'SpouseHPOA', 'ClientHCD', 'SpouseHCD', 'ClientHipaa', 'SpouseHipaa']
      : ['ClientFPOA', 'ClientHPOA', 'ClientHCD', 'ClientHipaa'];

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
};
