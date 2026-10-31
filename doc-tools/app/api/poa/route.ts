/**
 * Power of Attorney API
 * Accepts form data from GeauxPlans and creates records/generates documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Map form types to app names (matching Knackly config)
const APP_NAMES: Record<string, string> = {
  'powerOfAttorneyForm': 'Power of Attorney Supplement Solo Documents',
  'powerOfAttorneyForm2Person': 'Power of Attorney Supplement',
  'trustBasedEstatePlanSolo': 'Trust-Based Estate Plan Solo Documents',
  'trustBasedEstatePlan2Person': 'Trust-Based Estate Plan',
  'willBasedEstatePlan': 'Will-Based Estate Plan Solo Documents',
  'willBasedEstatePlan2Person': 'Will-Based Estate Plan',
  'minorChildEstatePlan': 'Minor Child-Centered Estate Plan Solo Documents',
  'minorChildEstatePlan2Person': 'Minor Child-Centered Estate Plan',
};

/**
 * POST /api/poa
 * Create a record and start document generation
 */
export async function POST(request: NextRequest) {
  console.log('=== POA-CREATE v82-CLIENT-SPOUSE-AGENT ===');
  try {
    const body = await request.json();
    // Support both camelCase and snake_case field names from frontend
    const formData = body.formData || body.form_data;
    const formType = body.formType || body.form_type || 'powerOfAttorneyForm';
    // Use pre-computed knackly_data from frontend if available
    const preComputedKnacklyData = body.knackly_data;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the catalog (EstatePlanning)
    const { data: catalogs } = await supabase
      .from('doc_catalogs')
      .select('id, name')
      .ilike('name', '%estate%')
      .limit(1);

    const catalog = catalogs?.[0];
    if (!catalog) {
      return NextResponse.json(
        { success: false, error: 'Catalog not found' },
        { status: 404 }
      );
    }

    // Find the app
    const appName = APP_NAMES[formType] || APP_NAMES.powerOfAttorneyForm;
    const { data: apps } = await supabase
      .from('doc_apps')
      .select('id, name')
      .eq('catalog_id', catalog.id)
      .eq('name', appName)
      .limit(1);

    const app = apps?.[0];
    if (!app) {
      return NextResponse.json(
        { success: false, error: `App not found: ${appName}` },
        { status: 404 }
      );
    }

    // Use pre-computed Knackly data from frontend if available,
    // otherwise transform form data (fallback for backward compatibility)
    const knacklyData = preComputedKnacklyData || transformFormDataToKnackly(formData);

    // v80: Debug agent addresses before saving
    if (knacklyData.SpouseAgentsFPOA?.TrueAgents) {
      console.log('>>> SpouseAgentsFPOA.TrueAgents addresses before save:');
      knacklyData.SpouseAgentsFPOA.TrueAgents.forEach((a: any, i: number) => {
        console.log(`>>>   [${i}] ${a.NameCO}: PartyBlockAddress="${a.PartyBlockAddress || 'MISSING'}", Street1="${a.StreetAddress1 || 'NONE'}"`);
      });
    }
    if (knacklyData.OtherParties) {
      console.log('>>> OtherParties addresses:');
      knacklyData.OtherParties.forEach((p: any, i: number) => {
        console.log(`>>>   [${i}] ${p.NameCO || p.EntityName}: PartyBlockAddress="${p.PartyBlockAddress || 'MISSING'}", Street1="${p.StreetAddress1 || 'NONE'}"`);
      });
    }

    // Create a record
    const { data: record, error: recordError } = await supabase
      .from('doc_records')
      .insert({
        catalog_id: catalog.id,
        app_id: app.id,
        data: knacklyData,
        status: 'processing',
      })
      .select()
      .single();

    if (recordError) {
      return NextResponse.json(
        { success: false, error: recordError.message },
        { status: 500 }
      );
    }

    // Return success with record ID (like Knackly does)
    return NextResponse.json({
      success: true,
      id: record.id,
      _id: record.id, // Knackly compatibility
      status: 'processing',
      url: `/interview/${record.id}`,
    });

  } catch (error) {
    console.error('POA API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/poa?recordId=xxx
 * Get record status and documents
 */
export async function GET(request: NextRequest) {
  const recordId = request.nextUrl.searchParams.get('recordId');

  if (!recordId) {
    return NextResponse.json(
      { success: false, error: 'recordId required' },
      { status: 400 }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: record, error } = await supabase
      .from('doc_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (error || !record) {
      return NextResponse.json(
        { success: false, error: 'Record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      id: record.id,
      status: record.status,
      data: record.data,
      documents: record.documents || [],
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });

  } catch (error) {
    console.error('POA GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Transform GeauxPlans form data to Knackly variable format
 * Based on geauxplans-backend/src/services/knackly.js transformFormDataToKnackly
 */
function transformFormDataToKnackly(formData: any): Record<string, any> {
  const knacklyData: Record<string, any> = {};
  const allParties = formData.people_or_entities_who_will_serve_as_agents?.parties || [];

  // DEBUG: Log parties data
  console.log('DEBUG allParties count:', allParties.length);
  console.log('DEBUG allParties names:', allParties.map((p: any) => p.first_name ? `${p.first_name} ${p.middle_name || ''} ${p.surname}` : p.entity_name));

  // Helper to format date
  const formatDate = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return d.toISOString().split('T')[0];
  };

  // Helper to compute NameCO (full name) from name parts
  const computeNameCO = (first: string, middle: string, last: string, suffix: string): string => {
    const parts = [first, middle, last].filter(p => p && p.trim());
    let name = parts.join(' ');
    if (suffix && suffix.trim()) {
      name += ' ' + suffix.trim();
    }
    return name;
  };

  // Helper to compute gender properties
  const computeGenderProps = (gender: string): Record<string, string> => {
    const isMale = gender?.toLowerCase() === 'male';
    const isFemale = gender?.toLowerCase() === 'female';
    return {
      HeShe: isMale ? 'he' : isFemale ? 'she' : 'he or she',
      HimHer: isMale ? 'him' : isFemale ? 'her' : 'him or her',
      HisHer: isMale ? 'his' : isFemale ? 'her' : 'his or her',
      HimselfHerself: isMale ? 'himself' : isFemale ? 'herself' : 'himself or herself',
      DoesDo: isMale || isFemale ? 'does' : 'do',
      HeSheHasHave: isMale || isFemale ? 'has' : 'have',
      HeSheStateStates: isMale || isFemale ? 'states' : 'state',
    };
  };

  // Helper to format address block
  const computeAddressBlock = (street1: string, street2: string, city: string, state: string, zip: string): string => {
    const lines = [street1, street2, `${city}, ${state} ${zip}`].filter(l => l && l.trim());
    return lines.join(', ');
  };

  // Helper to format SSN display
  const computeSSNorEIN = (ssn: string): string => {
    if (!ssn) return '';
    return `***-**-${ssn}`;
  };

  // Helper to compute party parish/county
  const computePartyParish = (parish: string): string => parish || '';
  // Returns just "Parish" or "County" (the jurisdiction type, not the full name)
  // Template uses: {[PartyParish]} {[PartyParishCounty]} → "East Baton Rouge Parish"
  const computePartyParishCounty = (parish: string, state: string): string => {
    if (!parish) return '';
    return state === 'Louisiana' ? 'Parish' : 'County';
  };
  const computePartyState = (state: string): string => state || '';

  // Helper to get agent identifier (ID or name) for linking
  // The form may send an ID (e.g., "party-123") or a name (e.g., "John Doe")
  // We just pass it through - findAgentByIdOrName will handle matching
  const getAgentIdOrName = (idOrName: string) => {
    return idOrName || '';
  };

  // Map OtherParties (agents/parties)
  if (allParties.length > 0) {
    knacklyData.OtherParties = allParties.map((party: any) => {
      const mappedParty: Record<string, any> = {};

      // Store original party ID for matching agent selections
      const originalId = party.id || '';

      if ((party.type_of_party || '') === 'An entity') {
        mappedParty.PartyType = 'Entity';
        mappedParty.IndividualTF = false; // Entity, not individual
        mappedParty.EntityName = party.entity_name || '';
        mappedParty.NameCO = party.entity_name || ''; // For entities, NameCO is the entity name
        mappedParty.EntityType = party.entity_type || ''; // Entity type from entitytypes table
        mappedParty.EIN = party.last_4_ein_digits || '';
        mappedParty.SSNorEIN = party.last_4_ein_digits ? `EIN: ***-**-${party.last_4_ein_digits}` : '';
        if (party.signers && Array.isArray(party.signers)) {
          mappedParty.GeauxSigners = party.signers.map((signer: any) => ({
            SignerFirstName: signer.first_name || '',
            SignerMiddleName: signer.middle_name || '',
            SignerLastName: signer.surname || '',
            SignerSuffix: signer.suffix || '',
            SignerTitle: signer.title || '',
            SignerFullName: computeNameCO(signer.first_name || '', signer.middle_name || '', signer.surname || '', signer.suffix || ''),
          })).filter((s: any) => Object.values(s).some(v => v));
        }
        // Use original ID if available, otherwise entity name
        mappedParty['id$'] = originalId || mappedParty.EntityName;
        mappedParty._originalId = originalId; // Store for lookup
      } else {
        mappedParty.PartyType = 'Individual';
        mappedParty.IndividualTF = true; // Individual person
        mappedParty.First = party.first_name || '';
        mappedParty.Middle = party.middle_name || '';
        mappedParty.Last = party.surname || '';
        mappedParty.Suffix = party.suffix || '';
        mappedParty.NameCO = computeNameCO(party.first_name || '', party.middle_name || '', party.surname || '', party.suffix || '');
        mappedParty.Gender = computeGenderProps(party.gender || '');
        mappedParty.GeauxSSN = party.last_4_ssn_digits || '';
        mappedParty.SSNorEIN = computeSSNorEIN(party.last_4_ssn_digits || '');
        if (party.relationship_with_person) {
          mappedParty.RelateClient = (party.relationship_with_person || '').toLowerCase();
        }
        // Use original ID if available, otherwise constructed name
        mappedParty['id$'] = originalId || `${mappedParty.First} ${mappedParty.Last}`.trim();
        mappedParty._originalId = originalId; // Store for lookup
      }

      // Handle address - either same as client or separate
      const sameAddress = party.same_address_as_person_granting_power_of_attorney;
      let street1 = '', street2 = '', city = '', state = '', zip = '', parish = '';

      if (sameAddress === true || sameAddress === 'true' || sameAddress === '1' || sameAddress === 1) {
        mappedParty.SameAddressTF = true;
        // Copy address from client (personal_info)
        const pi = formData.personal_info || {};
        street1 = pi.street_address || '';
        street2 = pi.street_address_2 || '';
        city = pi.city || '';
        state = pi.state || '';
        zip = pi.zip || '';
        parish = party.parish || pi.parish || '';
      } else {
        street1 = party.street_address || '';
        street2 = party.street_address_2 || '';
        city = party.city || '';
        state = party.state || '';
        zip = party.zip || '';
        parish = party.parish || '';
      }

      // Set address fields
      mappedParty.StreetAddress1 = street1;
      mappedParty.StreetAddress2 = street2;
      mappedParty.City = city;
      mappedParty.State = state;
      mappedParty.Zip = zip;
      mappedParty.Parish = parish;

      // Computed address properties (required by templates)
      mappedParty.PartyParish = computePartyParish(parish);
      mappedParty.PartyParishCounty = computePartyParishCounty(parish, state);
      mappedParty.PartyState = computePartyState(state);
      mappedParty.PartyBlockAddress = computeAddressBlock(street1, street2, city, state, zip);

      // DEBUG: Log party address mapping
      console.log(`>>> OtherParty mapped: ${mappedParty.NameCO || mappedParty.EntityName}, sameAddr=${mappedParty.SameAddressTF || false}, street1="${street1}", PartyBlockAddress="${mappedParty.PartyBlockAddress}"`);

      return mappedParty;
    });
  }

  // Map Client data
  if (formData.personal_info) {
    const pi = formData.personal_info;
    const genderProps = computeGenderProps(pi.gender);
    knacklyData.Client = {
      First: pi.first_name || '',
      Middle: pi.middle_name || '',
      Last: pi.surname || '',
      Suffix: pi.suffix || '',
      NameCO: computeNameCO(pi.first_name || '', pi.middle_name || '', pi.surname || '', pi.suffix || ''),
      Gender: {
        ...genderProps,
        value: (pi.gender || '').toLowerCase(),
      },
      Birthdate: formatDate(pi.date_of_birth),
      StreetAddress1: pi.street_address || '',
      StreetAddress2: pi.street_address_2 || '',
      City: pi.city || '',
      State: pi.state || '',
      Zip: pi.zip || '',
      Parish: pi.parish || '',
      GeauxSSN: pi.last_4_ssn_digits || '',
      Phone: pi.phone || pi.phone_number || '',
      // Computed properties
      PartyBlockAddress: computeAddressBlock(pi.street_address || '', pi.street_address_2 || '', pi.city || '', pi.state || '', pi.zip || ''),
      PartyParish: computePartyParish(pi.parish),
      PartyParishCounty: computePartyParishCounty(pi.parish, pi.state),
      PartyState: computePartyState(pi.state),
      SSNorEIN: computeSSNorEIN(pi.last_4_ssn_digits),
      IndividualTF: true, // Client is always an individual
      'id$': 'client', // ID for matching
    };
  }

  // Map Spouse data (for 2-person forms)
  if (formData.spouse_info) {
    const si = formData.spouse_info;
    const pi = formData.personal_info || {};
    const genderProps = computeGenderProps(si.gender);

    // Handle address - use client's address if same_address_as_primary is checked
    const useClientAddress = si.same_address_as_primary === true || si.same_address_as_primary === 'true';
    const street1 = useClientAddress ? (pi.street_address || '') : (si.street_address || '');
    const street2 = useClientAddress ? (pi.street_address_2 || '') : (si.street_address_2 || '');
    const city = useClientAddress ? (pi.city || '') : (si.city || '');
    const state = useClientAddress ? (pi.state || '') : (si.state || '');
    const zip = useClientAddress ? (pi.zip || '') : (si.zip || '');
    const parish = useClientAddress ? (pi.parish || '') : (si.parish || '');

    knacklyData.Spouse = {
      First: si.first_name || '',
      Middle: si.middle_name || '',
      Last: si.surname || '',
      Suffix: si.suffix || '',
      NameCO: computeNameCO(si.first_name || '', si.middle_name || '', si.surname || '', si.suffix || ''),
      Gender: {
        ...genderProps,
        value: (si.gender || '').toLowerCase(),
      },
      Birthdate: formatDate(si.date_of_birth),
      StreetAddress1: street1,
      StreetAddress2: street2,
      City: city,
      State: state,
      Zip: zip,
      Parish: parish,
      GeauxSSN: si.last_4_ssn_digits || '',
      Phone: si.phone || si.phone_number || '',
      // Computed properties
      PartyBlockAddress: computeAddressBlock(street1, street2, city, state, zip),
      PartyParish: computePartyParish(parish),
      PartyParishCounty: computePartyParishCounty(parish, state),
      PartyState: computePartyState(state),
      SSNorEIN: computeSSNorEIN(si.last_4_ssn_digits),
      IndividualTF: true, // Spouse is always an individual
      'id$': 'spouse', // ID for matching
    };
    knacklyData.MarriedTF = true;
  }

  // Helper to find agent object by ID or name from OtherParties
  const findAgentByIdOrName = (idOrName: string) => {
    console.log(`DEBUG findAgentByIdOrName called with: "${idOrName}"`);

    if (!idOrName) {
      console.log('DEBUG findAgentByIdOrName: idOrName is empty, returning null');
      return null;
    }

    // Handle special values - "spouse" or "client"
    if (idOrName.toLowerCase() === 'spouse' && knacklyData.Spouse) {
      console.log('DEBUG findAgentByIdOrName: matched spouse by keyword');
      return knacklyData.Spouse;
    }
    if (idOrName.toLowerCase() === 'client' && knacklyData.Client) {
      console.log('DEBUG findAgentByIdOrName: matched client by keyword');
      return knacklyData.Client;
    }

    // v82: Also check if name matches Client or Spouse by name (not just keywords)
    // The form sends actual names like "Emily Rose Johnson", not "spouse"
    const normalizedIdOrName = idOrName.toLowerCase().trim().replace(/\s+/g, ' ');

    if (knacklyData.Client) {
      const clientNameCO = knacklyData.Client.NameCO?.toLowerCase().trim().replace(/\s+/g, ' ');
      const clientNameNoSuffix = [knacklyData.Client.First, knacklyData.Client.Middle, knacklyData.Client.Last]
        .filter((p: string) => p && p.trim())
        .map((p: string) => p.trim())
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (clientNameCO === normalizedIdOrName || clientNameNoSuffix === normalizedIdOrName) {
        console.log(`DEBUG findAgentByIdOrName: matched Client by name "${idOrName}"`);
        return knacklyData.Client;
      }
    }

    if (knacklyData.Spouse) {
      const spouseNameCO = knacklyData.Spouse.NameCO?.toLowerCase().trim().replace(/\s+/g, ' ');
      const spouseNameNoSuffix = [knacklyData.Spouse.First, knacklyData.Spouse.Middle, knacklyData.Spouse.Last]
        .filter((p: string) => p && p.trim())
        .map((p: string) => p.trim())
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (spouseNameCO === normalizedIdOrName || spouseNameNoSuffix === normalizedIdOrName) {
        console.log(`DEBUG findAgentByIdOrName: matched Spouse by name "${idOrName}"`);
        return knacklyData.Spouse;
      }
    }

    console.log(`DEBUG OtherParties available: ${knacklyData.OtherParties?.length || 0}`);

    if (knacklyData.OtherParties && knacklyData.OtherParties.length > 0) {
      // Log all party names for comparison
      console.log('DEBUG OtherParties details:', knacklyData.OtherParties.map((p: any) => ({
        NameCO: p.NameCO,
        EntityName: p.EntityName,
        _originalId: p._originalId,
        'id$': p['id$'],
        IndividualTF: p.IndividualTF
      })));

      // Try exact matches first (case-sensitive for IDs, case-insensitive for names)
      const idOrNameLower = idOrName.toLowerCase().trim();
      const exactMatch = knacklyData.OtherParties.find((party: any) =>
        party._originalId === idOrName ||  // Match by original form ID first (exact)
        party['id$'] === idOrName ||        // Match by Knackly id$ (exact)
        (party.NameCO && party.NameCO.toLowerCase().trim() === idOrNameLower) ||  // Match by name (case-insensitive)
        (party.EntityName && party.EntityName.toLowerCase().trim() === idOrNameLower)  // Match by entity name (case-insensitive)
      );
      if (exactMatch) {
        console.log(`DEBUG findAgentByIdOrName: EXACT MATCH found - ${exactMatch.NameCO || exactMatch.EntityName}`);
        return exactMatch;
      }

      // Frontend getPartyDisplayName doesn't include suffix, so try matching without suffix
      // NameCO = "First Middle Last Suffix", but form sends "First Middle Last"
      // Normalize: lowercase, trim, collapse multiple spaces to single space
      const normalizedInput = idOrName.toLowerCase().trim().replace(/\s+/g, ' ');
      console.log(`DEBUG trying partial match with normalized: "${normalizedInput}"`);

      const partialMatch = knacklyData.OtherParties.find((party: any) => {
        if (party.IndividualTF) {
          // For individuals, construct name without suffix and compare
          // Normalize the same way: lowercase, trim parts, collapse spaces
          const partyNameNoSuffix = [party.First, party.Middle, party.Last]
            .filter((p: string) => p && p.trim())
            .map((p: string) => p.trim())
            .join(' ')
            .toLowerCase()
            .replace(/\s+/g, ' ');
          console.log(`DEBUG comparing "${partyNameNoSuffix}" to "${normalizedInput}"`);
          return partyNameNoSuffix === normalizedInput;
        }
        // Entity - also try case-insensitive match
        if (party.EntityName) {
          const normalizedEntity = party.EntityName.toLowerCase().trim().replace(/\s+/g, ' ');
          return normalizedEntity === normalizedInput;
        }
        return false;
      });
      if (partialMatch) {
        console.log(`DEBUG findAgentByIdOrName: PARTIAL MATCH found - ${partialMatch.NameCO || partialMatch.EntityName}`);
        return partialMatch;
      }
    }

    // Fallback: If no match found, create a minimal agent object from the name
    // This handles cases where parties aren't in OtherParties but agent is selected
    // IMPORTANT: Include all address fields so templates don't break
    console.log(`DEBUG: Agent not found for: "${idOrName}" - creating fallback with empty address`);
    return {
      NameCO: idOrName,
      'id$': idOrName,
      IndividualTF: true,
      // Address fields (empty but present to prevent template errors)
      StreetAddress1: '',
      StreetAddress2: '',
      City: '',
      State: '',
      Zip: '',
      Parish: '',
      PartyBlockAddress: '',  // Template uses this for address display
      PartyParish: '',
      PartyParishCounty: '',
      PartyState: '',
      SSNorEIN: '',
      // Gender defaults
      Gender: {
        HeShe: 'he or she',
        HimHer: 'him or her',
        HisHer: 'his or her',
        HimselfHerself: 'himself or herself',
        DoesDo: 'do',
        HeSheHasHave: 'have',
        HeSheStateStates: 'state',
      },
    };
  };

  // Helper to build TrueAgents array from selections
  const buildTrueAgents = (agentSelectIdOrName: string, coAgentSelectIdOrName: string) => {
    console.log(`DEBUG buildTrueAgents called with: agent="${agentSelectIdOrName}", coAgent="${coAgentSelectIdOrName}"`);
    const agents: any[] = [];
    const agent = findAgentByIdOrName(agentSelectIdOrName);
    console.log(`DEBUG buildTrueAgents: agent result =`, agent ? `found (${agent.NameCO || agent.EntityName})` : 'null');
    if (agent) agents.push(agent);
    const coAgent = findAgentByIdOrName(coAgentSelectIdOrName);
    console.log(`DEBUG buildTrueAgents: coAgent result =`, coAgent ? `found (${coAgent.NameCO || coAgent.EntityName})` : 'null');
    if (coAgent) agents.push(coAgent);
    console.log(`DEBUG buildTrueAgents: returning ${agents.length} agents`);
    return agents;
  };

  // Map FPOA data
  if (formData.fpoa?.fpoa_initial_agents) {
    const fpoaAgents = formData.fpoa.fpoa_initial_agents;
    const agentName = getAgentIdOrName(fpoaAgents.person_to_serve || '');
    const coAgentName = getAgentIdOrName(fpoaAgents.second_coagent_person_to_serve || '');

    console.log('DEBUG FPOA agent selections:', { agentName, coAgentName });

    const trueAgents = buildTrueAgents(agentName, coAgentName);
    console.log('DEBUG FPOA TrueAgents built:', trueAgents.length, 'agents');
    console.log('DEBUG FPOA TrueAgents NameCOs:', trueAgents.map((a: any) => a.NameCO));
    knacklyData.ClientAgentsFPOA = {
      AgentSelect: agentName,
      CoAgentSelect: coAgentName,
      TrueAgents: trueAgents,
      ImmediateAgents: [], // Default empty for GeauxPlans
      AgentServeAlone: true, // Agents can act independently
      SpouseIsTrueAgentTF: false, // Will be set below if applicable
      ShouldAgentBeImmediateTF: 'No'
    };
    // Add pre-computed agent strings for templates that can't handle list expansion
    // Format: "Agent1 and Agent2" or just "Agent1"
    const agentNames = trueAgents.map((a: any) => a.NameCO || a.EntityName || '').filter((n: string) => n);
    knacklyData.ClientAgentsFPOA.TrueAgentsNameList = agentNames.length > 1
      ? agentNames.slice(0, -1).join(', ') + ' and ' + agentNames[agentNames.length - 1]
      : agentNames[0] || '';
    knacklyData.ClientAgentsFPOA.TrueAgentsNameListOr = agentNames.length > 1
      ? agentNames.slice(0, -1).join(', ') + ' or ' + agentNames[agentNames.length - 1]
      : agentNames[0] || '';

    // First agent details (for single-agent fallback)
    if (trueAgents.length > 0) {
      const firstAgent = trueAgents[0];
      knacklyData.ClientAgentsFPOA.FirstAgent = firstAgent;
      knacklyData.ClientAgentsFPOA.FirstAgentNameCO = firstAgent.NameCO || firstAgent.EntityName || '';
    }

    console.log('DEBUG ClientAgentsFPOA created:', JSON.stringify(knacklyData.ClientAgentsFPOA, null, 2));

    // Check if spouse is one of the agents
    if (knacklyData.Spouse && trueAgents.length > 0) {
      const spouseId = knacklyData.Spouse['id$'] || knacklyData.Spouse.NameCO;
      knacklyData.ClientAgentsFPOA.SpouseIsTrueAgentTF = trueAgents.some(
        (agent: any) => agent['id$'] === spouseId || agent.NameCO === knacklyData.Spouse?.NameCO
      );
    }

    // Successor agents are at formData.fpoa level, NOT inside fpoa_initial_agents
    const hasSuccessors = (formData.fpoa.has_appointer_successor_agents || '') === 'Yes';
    knacklyData.ClientFPOASuccessors = hasSuccessors;
    console.log(`>>> ClientFPOA hasSuccessors=${hasSuccessors}, successor_agents count=${formData.fpoa.successor_agents?.length || 0}`);

    if (hasSuccessors && formData.fpoa.successor_agents && Array.isArray(formData.fpoa.successor_agents)) {
      knacklyData.ClientFPOASuccAgents = formData.fpoa.successor_agents.map((successor: any) => {
        const succAgentName = getAgentIdOrName(successor.successor_agent_to_serve || '');
        const succCoAgentName = getAgentIdOrName(successor.second_successor_coagent_to_serve || '');
        return {
          AgentSelect: succAgentName,
          CoAgentSelect: succCoAgentName,
          TrueAgents: buildTrueAgents(succAgentName, succCoAgentName)
        };
      });
    } else {
      // Always set to empty array for clean list processing
      knacklyData.ClientFPOASuccAgents = [];
    }
  }

  // Map Spouse FPOA agents (for 2-person forms)
  if (formData.spouse_fpoa?.fpoa_initial_agents) {
    const spouseFpoaAgents = formData.spouse_fpoa.fpoa_initial_agents;
    const spouseAgentName = getAgentIdOrName(spouseFpoaAgents.person_to_serve || '');
    const spouseCoAgentName = getAgentIdOrName(spouseFpoaAgents.second_coagent_person_to_serve || '');

    const spouseTrueAgents = buildTrueAgents(spouseAgentName, spouseCoAgentName);
    // DEBUG: Log spouse FPOA agent addresses
    console.log('>>> SpouseFPOA TrueAgents address debug:');
    spouseTrueAgents.forEach((agent: any, idx: number) => {
      console.log(`>>>   Agent ${idx}: ${agent.NameCO}, PartyBlockAddress="${agent.PartyBlockAddress || 'EMPTY'}", StreetAddress1="${agent.StreetAddress1 || 'EMPTY'}"`);
    });
    knacklyData.SpouseAgentsFPOA = {
      AgentSelect: spouseAgentName,
      CoAgentSelect: spouseCoAgentName,
      TrueAgents: spouseTrueAgents,
      ImmediateAgents: [],
      AgentServeAlone: true,
      SpouseIsTrueAgentTF: false,
      ShouldAgentBeImmediateTF: 'No'
    };

    // Check if client is one of spouse's agents
    if (knacklyData.Client && spouseTrueAgents.length > 0) {
      const clientId = knacklyData.Client['id$'] || knacklyData.Client.NameCO;
      knacklyData.SpouseAgentsFPOA.SpouseIsTrueAgentTF = spouseTrueAgents.some(
        (agent: any) => agent['id$'] === clientId || agent.NameCO === knacklyData.Client?.NameCO
      );
    }

    // Successor agents are at formData.spouse_fpoa level, NOT inside fpoa_initial_agents
    const hasSpouseSuccessors = (formData.spouse_fpoa.has_appointer_successor_agents || '') === 'Yes';
    knacklyData.SpouseFPOASuccessors = hasSpouseSuccessors;
    console.log(`>>> SpouseFPOA hasSuccessors=${hasSpouseSuccessors}, successor_agents count=${formData.spouse_fpoa.successor_agents?.length || 0}`);

    if (hasSpouseSuccessors && formData.spouse_fpoa.successor_agents && Array.isArray(formData.spouse_fpoa.successor_agents)) {
      knacklyData.SpouseFPOASuccAgents = formData.spouse_fpoa.successor_agents.map((successor: any, idx: number) => {
        const succAgentName = getAgentIdOrName(successor.successor_agent_to_serve || '');
        const succCoAgentName = getAgentIdOrName(successor.second_successor_coagent_to_serve || '');
        const trueAgents = buildTrueAgents(succAgentName, succCoAgentName);
        // Debug: log successor agent addresses
        console.log(`>>> SpouseFPOASuccAgent[${idx}]: agent="${succAgentName}", TrueAgents=${trueAgents.length}`);
        trueAgents.forEach((a: any, i: number) => {
          console.log(`>>>   TrueAgent[${i}]: ${a.NameCO}, addr="${a.PartyBlockAddress || 'EMPTY'}"`);
        });
        return {
          AgentSelect: succAgentName,
          CoAgentSelect: succCoAgentName,
          TrueAgents: trueAgents
        };
      });
    } else {
      // Always set to empty array for clean list processing
      knacklyData.SpouseFPOASuccAgents = [];
    }
  }

  // Map springing POA flags for section A (effective date)
  if (formData.fpoa?.springing_poa !== undefined) {
    knacklyData.ClientSpringingPOA = formData.fpoa.springing_poa === 'Yes';
  }
  if (formData.spouse_fpoa?.springing_poa !== undefined) {
    knacklyData.SpouseSpringingPOA = formData.spouse_fpoa.springing_poa === 'Yes';
  }

  // Map revoke prior POA flags for section D
  if (formData.fpoa?.revoke_prior_poa !== undefined) {
    knacklyData.ClientRevokePriorPOATF = formData.fpoa.revoke_prior_poa === 'Yes';
  }
  if (formData.spouse_fpoa?.revoke_prior_poa !== undefined) {
    knacklyData.SpouseRevokePriorPOATF = formData.spouse_fpoa.revoke_prior_poa === 'Yes';
  }

  // Map HCPOA data
  if (formData.hcpoa) {
    const hcpoa = formData.hcpoa;

    // Map springing and revoke flags for HPOA
    if (hcpoa.springing_poa !== undefined) {
      knacklyData.ClientSpringingHPOA = hcpoa.springing_poa === 'Yes';
    }
    if (hcpoa.revoke_prior_poa !== undefined) {
      knacklyData.ClientRevokePriorHPOATF = hcpoa.revoke_prior_poa === 'Yes';
    }

    // Map organ/science/blood flags
    if (hcpoa.wish_to_be_organ_donor !== undefined) {
      knacklyData.ClientOrganTF = hcpoa.wish_to_be_organ_donor === 'Yes';
      knacklyData.OrganTF = knacklyData.ClientOrganTF; // Alias for template
    }
    if (hcpoa.wish_to_donate_body_to_science !== undefined) {
      knacklyData.ClientDonateScienceTF = hcpoa.wish_to_donate_body_to_science === 'Yes';
      knacklyData.ScienceTF = knacklyData.ClientDonateScienceTF; // Alias for template
    }
    if (hcpoa.no_blood_transfusion !== undefined) {
      knacklyData.ClientBloodTF = hcpoa.no_blood_transfusion === 'Yes';
      knacklyData.BloodTF = knacklyData.ClientBloodTF; // Alias for template
    }

    console.log('DEBUG HCPOA data:', JSON.stringify(hcpoa.hcpoa_initial_agents || 'MISSING'));
    if (hcpoa.hcpoa_initial_agents) {
      const agents = hcpoa.hcpoa_initial_agents;
      console.log('DEBUG HCPOA agents.person_to_serve:', agents.person_to_serve);
      const hpoaAgentName = getAgentIdOrName(agents.person_to_serve || '');
      const hpoaCoAgentName = getAgentIdOrName(agents.second_coagent_person_to_serve || '');
      console.log('DEBUG HCPOA resolved names:', hpoaAgentName, hpoaCoAgentName);

      const hpoaTrueAgents = buildTrueAgents(hpoaAgentName, hpoaCoAgentName);
      console.log('DEBUG HPOA TrueAgents IndividualTF:', hpoaTrueAgents.map((a: any) => ({ name: a.NameCO, IndividualTF: a.IndividualTF })));
      knacklyData.ClientAgentsHPOA = {
        AgentSelect: hpoaAgentName,
        CoAgentSelect: hpoaCoAgentName,
        TrueAgents: hpoaTrueAgents,
        ImmediateAgents: [], // Default empty for GeauxPlans
        AgentServeAlone: true,
        SpouseIsTrueAgentTF: false,
        ShouldAgentBeImmediateTF: 'No'
      };

      // Check if spouse is one of the HPOA agents
      if (knacklyData.Spouse && hpoaTrueAgents.length > 0) {
        const spouseId = knacklyData.Spouse['id$'] || knacklyData.Spouse.NameCO;
        knacklyData.ClientAgentsHPOA.SpouseIsTrueAgentTF = hpoaTrueAgents.some(
          (agent: any) => agent['id$'] === spouseId || agent.NameCO === knacklyData.Spouse?.NameCO
        );
      }

      // Compute TrueAgentsNoSpouse for HPOA
      if (knacklyData.Spouse) {
        const spouseId = knacklyData.Spouse['id$'] || knacklyData.Spouse.NameCO;
        knacklyData.ClientAgentsHPOA.TrueAgentsNoSpouse = hpoaTrueAgents.filter(
          (agent: any) => agent['id$'] !== spouseId && agent.NameCO !== knacklyData.Spouse?.NameCO
        );
      } else {
        knacklyData.ClientAgentsHPOA.TrueAgentsNoSpouse = hpoaTrueAgents;
      }

      // Successor agents are at formData.hcpoa level, NOT inside hcpoa_initial_agents
      const hasSuccessors = (hcpoa.has_appointed_successor_agents || '') === 'Yes';
      knacklyData.ClientHPOASuccessors = hasSuccessors;
      console.log(`>>> ClientHCPOA hasSuccessors=${hasSuccessors}, successor_agents count=${hcpoa.successor_agents?.length || 0}`);

      if (hasSuccessors && hcpoa.successor_agents && Array.isArray(hcpoa.successor_agents)) {
        knacklyData.ClientHPOASuccAgents = hcpoa.successor_agents.map((successor: any) => {
          const succAgentName = getAgentIdOrName(successor.successor_agent_to_serve || '');
          const succCoAgentName = getAgentIdOrName(successor.second_successor_coagent_to_serve || '');
          return {
            AgentSelect: succAgentName,
            CoAgentSelect: succCoAgentName,
            TrueAgents: buildTrueAgents(succAgentName, succCoAgentName)
          };
        });
      }
    }
  }

  // Map Spouse HCPOA data (for 2-person forms)
  if (formData.spouse_hcpoa) {
    const spouseHcpoa = formData.spouse_hcpoa;

    if (spouseHcpoa.springing_poa !== undefined) {
      knacklyData.SpouseSpringingHPOA = spouseHcpoa.springing_poa === 'Yes';
    }
    if (spouseHcpoa.revoke_prior_poa !== undefined) {
      knacklyData.SpouseRevokePriorHPOATF = spouseHcpoa.revoke_prior_poa === 'Yes';
    }
    if (spouseHcpoa.wish_to_be_organ_donor !== undefined) {
      knacklyData.SpouseOrganTF = spouseHcpoa.wish_to_be_organ_donor === 'Yes';
    }
    if (spouseHcpoa.wish_to_donate_body_to_science !== undefined) {
      knacklyData.SpouseDonateScienceTF = spouseHcpoa.wish_to_donate_body_to_science === 'Yes';
    }
    if (spouseHcpoa.no_blood_transfusion !== undefined) {
      knacklyData.SpouseBloodTF = spouseHcpoa.no_blood_transfusion === 'Yes';
    }

    if (spouseHcpoa.hcpoa_initial_agents) {
      const agents = spouseHcpoa.hcpoa_initial_agents;
      const hpoaAgentName = getAgentIdOrName(agents.person_to_serve || '');
      const hpoaCoAgentName = getAgentIdOrName(agents.second_coagent_person_to_serve || '');

      const hpoaTrueAgents = buildTrueAgents(hpoaAgentName, hpoaCoAgentName);
      knacklyData.SpouseAgentsHPOA = {
        AgentSelect: hpoaAgentName,
        CoAgentSelect: hpoaCoAgentName,
        TrueAgents: hpoaTrueAgents,
        ImmediateAgents: [],
        AgentServeAlone: true,
        SpouseIsTrueAgentTF: false,
        ShouldAgentBeImmediateTF: 'No'
      };

      // Check if client is one of spouse's HPOA agents
      if (knacklyData.Client && hpoaTrueAgents.length > 0) {
        const clientId = knacklyData.Client['id$'] || knacklyData.Client.NameCO;
        knacklyData.SpouseAgentsHPOA.SpouseIsTrueAgentTF = hpoaTrueAgents.some(
          (agent: any) => agent['id$'] === clientId || agent.NameCO === knacklyData.Client?.NameCO
        );
      }

      // Successor agents are at spouseHcpoa level, NOT inside hcpoa_initial_agents
      const hasSuccessors = (spouseHcpoa.has_appointed_successor_agents || '') === 'Yes';
      knacklyData.SpouseHPOASuccessors = hasSuccessors;
      console.log(`>>> SpouseHCPOA hasSuccessors=${hasSuccessors}, successor_agents count=${spouseHcpoa.successor_agents?.length || 0}`);

      if (hasSuccessors && spouseHcpoa.successor_agents && Array.isArray(spouseHcpoa.successor_agents)) {
        knacklyData.SpouseHPOASuccAgents = spouseHcpoa.successor_agents.map((successor: any) => {
          const succAgentName = getAgentIdOrName(successor.successor_agent_to_serve || '');
          const succCoAgentName = getAgentIdOrName(successor.second_successor_coagent_to_serve || '');
          return {
            AgentSelect: succAgentName,
            CoAgentSelect: succCoAgentName,
            TrueAgents: buildTrueAgents(succAgentName, succCoAgentName)
          };
        });
      }
    }
  }

  // Map Healthcare Directive data
  if (formData.hcd) {
    const hcd = formData.hcd;
    const option = hcd.life_support_option || '';

    // Map HCD option
    if (option === 'WITHDRAW - withhold and remove all life support' || option === '' || option === null) {
      knacklyData.HCDClientNone = 'None';
      knacklyData.GeauxHCDClientNone = 'None'; // Alias
    } else if (option === 'Choose all that apply from the options below:' || option === 'Choose') {
      knacklyData.HCDClientNone = 'Choose';
      knacklyData.GeauxHCDClientNone = 'Choose'; // Alias
      if (hcd.client_hcds && Array.isArray(hcd.client_hcds)) {
        knacklyData.ClientHCDs = hcd.client_hcds;
        knacklyData.GeauxClientHCDs = hcd.client_hcds; // Alias
      }
    }

    // Map HCD extend option
    if (hcd.extend_hcd !== undefined) {
      knacklyData.ClientExtendHCDTF = hcd.extend_hcd === 'Yes';
    }

    // Map HCD sooner/longer selection
    if (hcd.hcd_sooner_longer) {
      knacklyData.ClientHCDSoonerLonger = { Name: hcd.hcd_sooner_longer };
    }

    // HCDTF - true if HCD is included
    knacklyData.HCDTF = true;
  }

  // Add StateLawSelect based on Client's state
  const clientState = formData.personal_info?.state || 'Louisiana';
  const isLouisiana = clientState === 'Louisiana';
  knacklyData.StateLawSelect = {
    Name: clientState,
    GrantorReference: isLouisiana ? 'Grantor' : 'Grantor',
    Land: isLouisiana ? 'immovable' : 'real',
    PersonalProperty: isLouisiana ? 'movable' : 'personal',
    Interdict: isLouisiana ? 'Interdict' : 'Ward',
  };

  // Add app flags for template conditionals
  knacklyData.IsGeauxAppTF = true; // GeauxPlans app
  knacklyData.EstateAppTF = false; // Simplified POA - hides alternate/successor/revocation sections
  knacklyData.ESignTF = formData.esign === true; // E-signature enabled
  knacklyData.DuplicateOriginalsTF = false; // Default - not in GeauxPlans form
  knacklyData.ExecutionDateTF = false; // No execution date set yet

  // Compute TrueAgentsNoSpouse (agents excluding spouse)
  if (knacklyData.ClientAgentsFPOA?.TrueAgents && knacklyData.Spouse) {
    const spouseId = knacklyData.Spouse['id$'] || knacklyData.Spouse.NameCO;
    knacklyData.ClientAgentsFPOA.TrueAgentsNoSpouse = knacklyData.ClientAgentsFPOA.TrueAgents.filter(
      (agent: any) => agent['id$'] !== spouseId && agent.NameCO !== knacklyData.Spouse?.NameCO
    );
  } else if (knacklyData.ClientAgentsFPOA?.TrueAgents) {
    knacklyData.ClientAgentsFPOA.TrueAgentsNoSpouse = knacklyData.ClientAgentsFPOA.TrueAgents;
  }

  // Compute TrueAgentsNoClient for SpouseAgentsFPOA (agents excluding client)
  if (knacklyData.SpouseAgentsFPOA?.TrueAgents && knacklyData.Client) {
    const clientId = knacklyData.Client['id$'] || knacklyData.Client.NameCO;
    knacklyData.SpouseAgentsFPOA.TrueAgentsNoClient = knacklyData.SpouseAgentsFPOA.TrueAgents.filter(
      (agent: any) => agent['id$'] !== clientId && agent.NameCO !== knacklyData.Client?.NameCO
    );
  } else if (knacklyData.SpouseAgentsFPOA?.TrueAgents) {
    knacklyData.SpouseAgentsFPOA.TrueAgentsNoClient = knacklyData.SpouseAgentsFPOA.TrueAgents;
  }

  // Add NotaryBlockParish for notary block
  knacklyData.NotaryBlockParish = formData.personal_info?.parish || '';

  // Add ExecutionDT (current date) - will be blank if not executing now
  // Templates use else: for blank placeholder
  knacklyData.ExecutionDT = '';

  // Add HCD days (default values)
  knacklyData.ClientHCDDays = formData.hcd?.client_hcd_days || '';
  knacklyData.SpouseHCDDays = formData.hcd?.spouse_hcd_days || '';

  return knacklyData;
}
