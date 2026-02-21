/**
 * Doc Tools API Service
 * Document generation service
 */

const https = require('https');

// Your private DocTools deployment
const DOCTOOLS_CONFIG = {
  baseUrl: process.env.DOCTOOLS_URL || 'doc-tools-95mp.vercel.app',
  apiKey: process.env.DOCTOOLS_API_KEY || '', // Optional: add API key for security
};

/**
 * Make HTTPS request to DocTools
 */
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: DOCTOOLS_CONFIG.baseUrl,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (DOCTOOLS_CONFIG.apiKey) {
      options.headers['Authorization'] = `Bearer ${DOCTOOLS_CONFIG.apiKey}`;
    }

    console.log(`DocTools API: ${method} https://${options.hostname}${path}`);

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
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
      req.write(JSON.stringify(data));
    }
    req.end();
  });
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
 */
async function getDocuments(recordId) {
  return makeRequest('GET', `/api/poa?recordId=${recordId}`);
}

/**
 * Generate documents for a record
 */
async function generateDocuments(recordId, templates) {
  // Default templates for POA
  const defaultTemplates = ['ClientFPOA', 'ClientHPOA', 'ClientHCD'];

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
      ? ['ClientFPOA', 'SpouseFPOA', 'ClientHPOA', 'SpouseHPOA', 'ClientHCD', 'SpouseHCD']
      : ['ClientFPOA', 'ClientHPOA', 'ClientHCD'];

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
    return {
      success: false,
      error: error.message || error.error || 'Unknown error',
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
