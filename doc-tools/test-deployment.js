/**
 * Test the deployed doc-tools list-spanning fixes
 */

// Disable SSL verification for testing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const https = require('https');

const DOCTOOLS_URL = 'doc-tools-geaux-counsel.vercel.app';

// Test data with multiple agents (to test cross-paragraph list expansion)
const testData = {
  ClientFName: "John",
  ClientMName: "Michael",
  ClientLName: "Smith",
  ClientFPOAAgents: [
    { AgentFName: "Jane", AgentLName: "Doe", AgentRelationship: "Spouse" }
  ],
  ClientFPOASuccAgents: [
    {
      AgentFName: "Robert",
      AgentLName: "Johnson",
      AgentRelationship: "Son",
      TrueAgents: [
        { AgentFName: "Alice", AgentLName: "Williams", AgentRelationship: "Daughter" },
        { AgentFName: "Bob", AgentLName: "Brown", AgentRelationship: "Friend" }
      ]
    },
    {
      AgentFName: "Sarah",
      AgentLName: "Davis",
      AgentRelationship: "Daughter",
      TrueAgents: [
        { AgentFName: "Charlie", AgentLName: "Wilson", AgentRelationship: "Nephew" }
      ]
    }
  ],
  SpouseFName: "Mary",
  SpouseMName: "Ann",
  SpouseLName: "Smith"
};

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${method} https://${DOCTOOLS_URL}${path}`);

    const postData = data ? JSON.stringify(data) : null;

    const options = {
      hostname: DOCTOOLS_URL,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        console.log(`<<< Status: ${res.statusCode}`);

        // Check content type
        const contentType = res.headers['content-type'] || '';

        if (contentType.includes('application/json')) {
          try {
            const json = JSON.parse(body.toString());
            console.log(`<<< JSON Response:`, JSON.stringify(json, null, 2).substring(0, 500));
            resolve({ status: res.statusCode, data: json, isJson: true });
          } catch (e) {
            console.log(`<<< Parse error:`, e.message);
            resolve({ status: res.statusCode, data: body.toString(), isJson: false });
          }
        } else if (contentType.includes('application/vnd.openxmlformats')) {
          console.log(`<<< DOCX file received: ${body.length} bytes`);
          resolve({ status: res.statusCode, data: body, isDocx: true });
        } else {
          console.log(`<<< Response (${contentType}):`, body.toString().substring(0, 500));
          resolve({ status: res.statusCode, data: body.toString(), isJson: false });
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTest() {
  console.log('========================================');
  console.log('DOC-TOOLS DEPLOYMENT TEST');
  console.log('Testing list-spanning fixes');
  console.log('========================================');

  try {
    // Directly call generate endpoint with test data
    console.log('\n=== Generate Document ===');
    const generateResult = await makeRequest('POST', '/api/poa/generate', testData);

    if (generateResult.isDocx) {
      // Save the file
      const fs = require('fs');
      const outputPath = 'C:\\Users\\Arman\\Documents\\GeauxDrafterPrivate\\test-output.docx';
      fs.writeFileSync(outputPath, generateResult.data);
      console.log(`\nDocument saved to: ${outputPath}`);
      console.log('File size:', generateResult.data.length, 'bytes');
      console.log('\nSUCCESS! Open the file in Word to verify:');
      console.log('1. No "recover contents" error');
      console.log('2. Multiple agents listed correctly');
      console.log('3. Nested TrueAgents expanded for each parent');
    } else if (generateResult.status === 200 || generateResult.status === 201) {
      console.log('\nDocument generated successfully');
      console.log('Response:', JSON.stringify(generateResult.data, null, 2));
    } else {
      console.log('\nGenerate failed with status:', generateResult.status);
      console.log('Response:', generateResult.data);
    }

    console.log('\n========================================');
    console.log('TEST COMPLETE');
    console.log('========================================');

  } catch (error) {
    console.error('\nTest failed:', error.message);
  }
}

runTest();
