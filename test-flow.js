// Test the full flow
const integration = require('./lib/knackly-schema/integration');

// Simulate data as it would come from /api/poa
const rawData = {
  IsGeauxAppTF: true,
  ClientAgentsFPOA: {
    AgentSelect: 'John Doe',
    TrueAgents: [
      {
        First: 'John',
        Last: 'Doe',
        NameCO: 'John Doe',
        IndividualTF: true,
        PartyParish: 'Orleans',
        PartyParishCounty: 'Parish',
        PartyState: 'Louisiana',
        SSNorEIN: '***-**-1234'
      },
      {
        EntityName: 'ABC Trust Company',
        NameCO: 'ABC Trust Company',
        IndividualTF: false,
        PartyParish: 'Jefferson',
        PartyParishCounty: 'Parish',
        PartyState: 'Louisiana',
        SSNorEIN: 'EIN: ***-**-5678',
        GeauxSigners: [
          { SignerFullName: 'Jane Smith', SignerTitle: 'Trust Officer' }
        ]
      }
    ]
  }
};

// Apply preprocessing
const processedData = integration.preprocessPOAData(rawData);

console.log('=== PROCESSED DATA ===');
console.log('ClientAgentsFPOA exists:', !!processedData.ClientAgentsFPOA);
console.log('TrueAgents exists:', !!processedData.ClientAgentsFPOA?.TrueAgents);
console.log('TrueAgents is array:', Array.isArray(processedData.ClientAgentsFPOA?.TrueAgents));
console.log('TrueAgents length:', processedData.ClientAgentsFPOA?.TrueAgents?.length);

console.log('\n=== AGENT 1 ===');
const agent1 = processedData.ClientAgentsFPOA?.TrueAgents?.[0];
console.log('NAMECO:', agent1?.NAMECO);
console.log('NameCO:', agent1?.NameCO);
console.log('IndividualTF:', agent1?.IndividualTF);
console.log('PartyParish:', agent1?.PartyParish);
console.log('PartyParishCounty:', agent1?.PartyParishCounty);
console.log('PartyState:', agent1?.PartyState);
console.log('SSNorEIN:', agent1?.SSNorEIN);

console.log('\n=== AGENT 2 (Entity) ===');
const agent2 = processedData.ClientAgentsFPOA?.TrueAgents?.[1];
console.log('NAMECO:', agent2?.NAMECO);
console.log('IndividualTF:', agent2?.IndividualTF);
console.log('GeauxSigners:', JSON.stringify(agent2?.GeauxSigners));

// Test getNestedValue
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

console.log('\n=== NESTED VALUE TEST ===');
const trueAgents = getNestedValue(processedData, 'ClientAgentsFPOA.TrueAgents');
console.log('getNestedValue result:', trueAgents);
console.log('Is array:', Array.isArray(trueAgents));
