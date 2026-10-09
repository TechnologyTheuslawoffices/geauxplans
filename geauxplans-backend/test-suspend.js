/**
 * Test script to verify Knackly suspend workflow
 *
 * Tests:
 * 1. Create record WITH suspend: true - does it return ID?
 * 2. Can we fetch the record data after creation?
 * 3. Can we call runAppOnRecord (regenerate) to generate docs?
 * 4. Can we download the generated docs?
 */

const https = require('https');

// Knackly config (from existing code)
const KNACKLY_CONFIG = {
  baseUrl: process.env.KNACKLY_BASE_URL || 'api.knackly.io',
  workspace: process.env.KNACKLY_WORKSPACE || 'geauxplans',
  keyId: process.env.KNACKLY_KEY_ID || '6113e4d42bd0c544e84e4892',
  secret: process.env.KNACKLY_SECRET || '1100ac250f4bf297b5900c5aba3ddfdd29e8b9afa88f6e9d3acc5a896dcf40a22908f2ecd35bb26aa0953433b097599f2e09f1badca3510c692cfe0e949aa4f0ecc193adab7dd1c45a5dad175fd11efa474e278093754cd82278f16f8c8802d759572af3295a2eecfe36aa05cf2194f984b380c38a242f3593c7bd84026b2d9fd8f80ed4ea79c20fbf607ce23d6dd5f4ab71a97cadba5c86a4c537170d5268d4fbfbbed55b56e112959728792198c608ff9686c2e0acf9e68a7e26fa9910eadce1ae8dd4f5f2a2b6530aa3a3d78f6c5c24883a59b6614a350ecb6d2bb3c5ce7a84f2f7fd3a29fc364d8c59b5f27cf215e74919965f1ffa2513ba0239570343a6',
};

const APP_NAME = 'Power%20of%20Attorney%20Supplement%20Solo%20Documents';

function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const fullPath = `/${KNACKLY_CONFIG.workspace}/api/v1${path}`;

    console.log(`\n>>> ${method} https://${KNACKLY_CONFIG.baseUrl}${fullPath}`);
    if (data) console.log('>>> Body:', JSON.stringify(data, null, 2).substring(0, 500));

    const options = {
      hostname: KNACKLY_CONFIG.baseUrl,
      port: 443,
      path: fullPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`<<< Status: ${res.statusCode}`);
        console.log(`<<< Response: ${body.substring(0, 1000)}`);

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

async function getAccessToken() {
  console.log('\n=== Step 1: Get Access Token ===');
  const response = await makeRequest('POST', '/auth/login', {
    KeyID: KNACKLY_CONFIG.keyId,
    Secret: KNACKLY_CONFIG.secret,
  });
  return response.token;
}

async function createRecordWithSuspend(token) {
  console.log('\n=== Step 2: Create Record WITH suspend: true ===');

  // Minimal test data
  const testData = {
    suspend: true,  // <-- THE KEY PART
    Client: {
      First: 'Test',
      Last: 'Suspend',
      'id$': 'Test Suspend',
    },
  };

  const path = `/catalogs/GeauxPlans/apps/${APP_NAME}`;
  const response = await makeRequest('POST', path, testData, token);

  console.log('\n>>> SUSPEND RESPONSE ANALYSIS:');
  console.log('  - Has id?', !!response.id);
  console.log('  - Has _id?', !!response._id);
  console.log('  - Has url?', !!response.url);
  console.log('  - Full response keys:', Object.keys(response));

  return response;
}

async function fetchRecordData(token, recordId) {
  console.log('\n=== Step 3: Fetch Record Data ===');

  const path = `/collections/GeauxPlans/apps/${APP_NAME}/load/${recordId}`;
  return await makeRequest('GET', path, null, token);
}

async function runAppOnRecord(token, recordId) {
  console.log('\n=== Step 4: Run App on Record (Generate Docs) ===');

  const path = `/catalogs/GeauxPlans/items/${recordId}/apps/${APP_NAME}`;
  return await makeRequest('POST', path, {}, token);
}

async function getDocuments(token, recordId) {
  console.log('\n=== Step 5: Get Documents ===');

  const path = `/catalogs/GeauxPlans/items/${recordId}/apps/${APP_NAME}`;
  return await makeRequest('GET', path, null, token);
}

async function runTest() {
  console.log('========================================');
  console.log('KNACKLY SUSPEND WORKFLOW TEST');
  console.log('========================================');

  try {
    // Step 1: Auth
    const token = await getAccessToken();
    console.log('✓ Got access token');

    // Step 2: Create with suspend
    const createResult = await createRecordWithSuspend(token);
    const recordId = createResult.id || createResult._id;
    const interviewUrl = createResult.url;

    if (!recordId) {
      console.log('\n❌ FAIL: No record ID returned from suspend create!');
      console.log('Full response:', JSON.stringify(createResult, null, 2));
      return;
    }

    console.log('\n✓ Record created with ID:', recordId);
    if (interviewUrl) {
      console.log('✓ Interview URL:', interviewUrl);
    }

    // Step 3: Fetch record data
    try {
      const recordData = await fetchRecordData(token, recordId);
      console.log('\n✓ Record data fetched');
    } catch (e) {
      console.log('\n⚠ Could not fetch record data:', e.error || e);
    }

    // Step 4: Run app on record (generate docs)
    console.log('\n--- Waiting 3 seconds before generating docs ---');
    await new Promise(r => setTimeout(r, 3000));

    try {
      const runResult = await runAppOnRecord(token, recordId);
      console.log('\n✓ App run triggered');
    } catch (e) {
      console.log('\n⚠ Error running app:', e.error || e);
    }

    // Step 5: Poll for docs
    console.log('\n--- Polling for documents (3 attempts) ---');
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const docsResult = await getDocuments(token, recordId);
        console.log(`\nPoll ${i+1}: status=${docsResult.status}, files=${docsResult.files?.length || 0}`);

        if (docsResult.files && docsResult.files.length > 0) {
          console.log('\n✓ DOCUMENTS READY!');
          console.log('Files:', docsResult.files.map(f => f.name));
          break;
        }
      } catch (e) {
        console.log(`\nPoll ${i+1} error:`, e.error || e);
      }
    }

    console.log('\n========================================');
    console.log('TEST COMPLETE');
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
  }
}

// Run the test
runTest();
