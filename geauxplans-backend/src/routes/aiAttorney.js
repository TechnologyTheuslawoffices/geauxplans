/**
 * AI Attorney Mode — conversational intake.
 *
 * A Claude-powered Louisiana estate-planning attorney interviews the client and
 * fills the SAME `formData` the manual intake form (`POAForm.tsx`) uses. Each
 * request is one turn: the frontend sends the running transcript plus the
 * current formData, Claude asks the next question and (when it has confirmed
 * something) emits an `update_form_data` tool call whose `patch` is a partial
 * FormData. The frontend deep-merges that patch into shared state.
 *
 * Auth: mirrors submissions-supabase.js — production verifies the Supabase JWT,
 * not the SQLite-based middleware in src/middleware/auth.js (that middleware
 * needs sql.js and cannot run in the serverless bundle). See the note at the top
 * of api/index.js about the two entry points.
 *
 * Logging is budgeted per CLAUDE.md — Vercel truncates at 256 log lines, so this
 * route logs a handful of markers, never a per-turn flood.
 */

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../config/supabase');

const router = express.Router();

const MODEL = process.env.AI_ATTORNEY_MODEL || 'claude-opus-4-5-20251101';
const MAX_TOOL_ITERATIONS = 4;

/**
 * Plan-type → ordered section keys. Mirrors the `pages` arrays in
 * POAForm.tsx:61-108 so the prompt only describes sections this plan uses.
 */
const FORM_TYPES = {
  powerOfAttorneyForm: ['personal_info', 'agents', 'fpoa', 'hcpoa', 'hcd'],
  powerOfAttorneyForm2Person: ['personal_info', 'spouse_info', 'agents', 'fpoa', 'hcpoa', 'hcd'],
  trustBasedEstatePlanSolo: ['personal_info', 'children', 'agents', 'executors', 'rlt', 'dor', 'fpoa', 'hcpoa', 'hcd'],
  trustBasedEstatePlan2Person: ['personal_info', 'spouse_info', 'children', 'agents', 'executors', 'rlt', 'dor', 'fpoa', 'hcpoa', 'hcd'],
  willBasedEstatePlan: ['personal_info', 'children', 'agents', 'executors', 'guardians', 'will_distribution', 'fpoa', 'hcpoa', 'hcd'],
  willBasedEstatePlan2Person: ['personal_info', 'spouse_info', 'children', 'agents', 'executors', 'guardians', 'will_distribution', 'fpoa', 'hcpoa', 'hcd'],
  minorChildEstatePlan: ['personal_info', 'children', 'guardians', 'children_trusts', 'agents', 'fpoa', 'hcpoa', 'hcd'],
  minorChildEstatePlan2Person: ['personal_info', 'spouse_info', 'children', 'guardians', 'children_trusts', 'agents', 'fpoa', 'hcpoa', 'hcd'],
};

/**
 * Section key → the exact FormData fields, enum values, and guidance the AI must
 * use when emitting a patch. Keys and enums come straight from the FormData
 * interface and initial state in POAForm.tsx, so a patch drops straight into the
 * form. Send COMPLETE arrays whenever an array changes (deepMerge replaces
 * arrays wholesale on the frontend).
 */
const SECTION_GUIDE = {
  personal_info: `personal_info (the client): {
  first_name, middle_name, surname, suffix, date_of_birth ("YYYY-MM-DD"),
  gender ("Male"|"Female"), street_address, street_address_2, city,
  state (full name, e.g. "Louisiana"), zip, parish (Louisiana parish name),
  phone_number ("(XXX) XXX-XXXX"), last_4_ssn_digits (4 digits)
}. Also set top-level "married" (boolean).`,

  spouse_info: `spouse_info (the second person / spouse): same fields as
personal_info plus same_address_as_primary (boolean). When a spouse exists set
top-level "married": true.`,

  children: `children: an array. Each child: {
  first_name, middle_name, surname, suffix, date_of_birth ("YYYY-MM-DD"),
  gender ("Male"|"Female"), parentage ("Joint"|"Client"|"Spouse", only meaningful
  on two-person plans), same_address_as_parent (boolean), street_address,
  street_address_2, city, state, zip, parish, phone_number, last_4_ssn_digits,
  deceased (boolean), disinherit (boolean)
}. Send the whole children array every time it changes.`,

  agents: `people_or_entities_who_will_serve_as_agents.parties: an array of the
people (and any entities) who may serve as financial/healthcare agents,
executors, trustees, guardians, etc. Each party: {
  id (any unique string), type_of_party ("An individual person"|"An entity"),
  first_name, middle_name, surname, suffix, date_of_birth, gender,
  is_an_agent ("Yes"|"No"), relationship_with_person (e.g. "Son","Daughter",
  "Spouse","Friend"), last_4_ssn_digits,
  entity_name, entity_type, last_4_ein_digits (entities only),
  same_address_as_person_granting_power_of_attorney (boolean),
  street_address, street_address_2, city, state, zip, parish,
  signers (entities only: array of {first_name, middle_name, surname, suffix, title})
}. Collect the full names of everyone who will hold a role, then reference them
by their full written-out name in the sections below. Send the whole parties
array every time it changes.`,

  fpoa: `fpoa (Financial Power of Attorney for the client): {
  springing_poa ("Yes"=effective on incapacity, "No"=effective immediately),
  revoke_prior_poa ("Yes"|"No"),
  fpoa_initial_agents: { person_to_serve (full name), second_coagent_person_to_serve
    (full name or ""), agents_serve_alone ("Yes"|"No") },
  has_appointer_successor_agents ("Yes"|"No"),
  successor_agents: array of { successor_agent_to_serve, second_successor_coagent_to_serve, agents_serve_alone }
}. Two-person plans have a parallel "spouse_fpoa" with the same shape.`,

  hcpoa: `hcpoa (Healthcare Power of Attorney for the client): {
  springing_poa, revoke_prior_poa,
  wish_to_be_organ_donor ("Yes"|"No"), wish_to_donate_body_to_science ("Yes"|"No"),
  no_blood_transfusion ("Yes"|"No"),
  hcpoa_initial_agents: { person_to_serve, second_coagent_person_to_serve, agents_serve_alone },
  has_appointed_successor_agents ("Yes"|"No"),
  successor_agents: array of { successor_agent_to_serve, second_successor_coagent_to_serve, agents_serve_alone }
}. Two-person plans have a parallel "spouse_hcpoa".`,

  hcd: `hcd (Healthcare Directive / living will for the client): {
  life_support_option ("WITHDRAW"=withdraw life support, "CHOOSE"=let agent decide),
  client_hcds (array of strings for chosen directives),
  extend_hcd ("Yes"|"No"), hcd_days (number), hcd_sooner_longer ("sooner"|"longer")
}. Two-person plans have a parallel "spouse_hcd" whose array field is spouse_hcds.`,

  executors: `will_info executor fields: {
  initial_executors: array of { initial_executor (full name), co_executor (full name or "") },
  has_successor_executors ("Yes"|"No"),
  successor_executors: array of { successor_agent_to_serve, second_successor_coagent_to_serve }
}. On two-person plans the spouse's pourover will uses spouse_initial_executors,
spouse_has_successor_executors, spouse_successor_executors, and the sole-executor
shortcuts name_second_principal_as_executor / name_first_principal_as_executor
("Yes"|"No"). Put executor fields under "will_info".`,

  guardians: `will_info guardians (for minor children): {
  primary_guardian (full name), backup_guardian (full name)
}. Put these under "will_info".`,

  will_distribution: `will_info residuary distribution: {
  distributions_equal (boolean — true if everything is split equally),
  residuary_distribution: array of {
    recipient (full name), share_percent (string number; all shares total 100),
    how_receive ("Outright"|"In Trust"),
    trust_until_age (age string when how_receive is "In Trust", else "")
  },
  has_specific_bequests (boolean),
  specific_bequests: array of { recipient, description, multiple_recipients ("Yes"|"No"), second_recipient }
}. Shares must total 100. Put these under "will_info".`,

  rlt: `trust_info (Revocable Living Trust): {
  settlor_as_trustee (boolean), has_successor_trustees ("Yes"|"No"),
  trustees: array of { trustee_to_serve, second_trustee_person_to_serve },
  distributions_equal (boolean),
  residuary_distribution: array of { recipient, share_percent (total 100),
    how_receive ("Outright"|"In Trust"), trust_until_age },
  has_specific_bequests (boolean),
  specific_bequests: array of { recipient, description, multiple_recipients, second_recipient },
  marital_trust_type ("NoMarital" if no marital trust; two-person plans only)
}. Shares must total 100. Put these under "trust_info".`,

  dor: `dor (Donation of Residence to the trust): {
  parish_where_home_is_located (Louisiana parish),
  have_full_legal_description_for_home ("Yes"|"No"),
  full_legal_description (string)
}.`,

  children_trusts: `trust_info fields for minor-child trusts: {
  appoint_tutor (boolean), tutor (full name), under_tutor (full name),
  has_successor_tutors ("Yes"|"No"),
  successor_tutors: array of { successor_tutor_to_serve },
  distribution / children trustee choices under residuary_distribution as above
}. Put these under "trust_info".`,
};

/**
 * Recursive deep-merge used to accumulate tool patches across the bounded loop.
 * Mirrors the frontend deepMerge (POAForm.tsx:11-33): recurse into plain
 * objects, replace arrays and scalars wholesale.
 */
function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(patch || {})) {
    const val = patch[key];
    if (val === undefined || val === null) continue;
    if (
      typeof val === 'object' &&
      !Array.isArray(val) &&
      typeof out[key] === 'object' &&
      out[key] !== null &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function buildSystemPrompt(formType, formData) {
  const sections = FORM_TYPES[formType] || [];
  const guide = sections
    .map((key) => SECTION_GUIDE[key])
    .filter(Boolean)
    .join('\n\n');

  const planTitle = formType;

  return `You are a warm, experienced Louisiana estate-planning attorney conducting
an intake interview with a client to prepare their "${planTitle}".

How you work:
- Speak in plain English. Explain any legal term the first time you use it
  (executor, agent, springing power, residuary, etc.) in one short sentence.
- Cover ONE topic at a time. Never dump a checklist. Ask a natural follow-up,
  wait for the answer, and briefly confirm what you understood before moving on.
- Never rush the client. If an answer is unclear or incomplete, gently ask again.
- Start with the client's own details, then their family, then the people who
  will hold roles, then each document's specifics.
- You already have the client's saved answers below — only ask about what is
  missing or unconfirmed. Do not re-ask for information already captured.

Filling the form:
- Whenever you have CONFIRMED a piece of information, call the update_form_data
  tool with a "patch" object containing only the fields you just confirmed.
- Use the EXACT field names and enum values from the section guide below.
- For any array field (children, parties, distributions, successor agents),
  send the COMPLETE array — the app replaces arrays wholesale, so a partial
  array would drop the other entries.
- Only include fields you have actually confirmed with the client. Do not invent
  or guess values. Leave unknown fields out of the patch.
- After calling the tool, continue the conversation naturally with your next
  question or confirmation.

Section guide for THIS plan (field names, enums, and meaning):

${guide}

The client's current saved answers (JSON). Ask only for what is missing:

${JSON.stringify(formData || {}, null, 2)}`;
}

const UPDATE_FORM_TOOL = {
  name: 'update_form_data',
  description:
    'Record confirmed intake answers into the estate-planning form. Provide a ' +
    '"patch" that is a partial FormData object using the exact field names and ' +
    'enum values from the section guide. Send complete arrays for any array ' +
    'field that changed. Only include fields you have confirmed with the client.',
  input_schema: {
    type: 'object',
    properties: {
      patch: {
        type: 'object',
        description:
          'Partial FormData object. Nested objects (personal_info, spouse_info, ' +
          'fpoa, hcpoa, hcd, trust_info, will_info, dor, ' +
          'people_or_entities_who_will_serve_as_agents) and arrays (children, ' +
          'parties, residuary_distribution, successor_agents) allowed.',
        additionalProperties: true,
      },
      note: {
        type: 'string',
        description: 'Optional short note on what was captured (not shown to client).',
      },
    },
    required: ['patch'],
  },
};

/**
 * Verify the Supabase JWT — same approach as submissions-supabase.js. Falls back
 * to a clear 401 rather than the SQLite middleware, which is not available here.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
  }
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Auth not configured.' });
  }
  const token = authHeader.substring(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      const isExpired = error?.message?.includes('expired');
      return res.status(401).json({
        success: false,
        error: isExpired ? 'Your session has expired. Please log in again.' : 'Please log in to continue.',
        code: isExpired ? 'SESSION_EXPIRED' : 'UNAUTHORIZED',
      });
    }
    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid token.' });
  }
}

/**
 * POST /api/ai-attorney/message
 * Body: { formType, formData, messages: [{ role:'user'|'assistant', content }] }
 * Returns: { success, data: { reply, patch } }
 */
router.post('/message', authenticate, async (req, res) => {
  try {
    const { formType, formData, messages } = req.body || {};

    if (!formType || !FORM_TYPES[formType]) {
      return res.status(400).json({ success: false, error: 'Unknown or missing formType.' });
    }
    if (!Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: 'messages must be an array.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ success: false, error: 'AI attorney is not configured.' });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = buildSystemPrompt(formType, formData);

    // Only keep the conversational turns; strip anything malformed.
    const convo = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content }));

    let accumulatedPatch = null;
    let replyText = '';

    // Bounded tool loop: Claude may emit one or more update_form_data calls
    // before it produces its final conversational reply.
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system,
        tools: [UPDATE_FORM_TOOL],
        messages: convo,
      });

      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      const texts = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (texts) replyText = texts;

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        break;
      }

      // Record Claude's turn, then answer each tool call so the loop can continue.
      convo.push({ role: 'assistant', content: response.content });
      const toolResults = [];
      for (const tu of toolUses) {
        if (tu.name === 'update_form_data' && tu.input && tu.input.patch) {
          accumulatedPatch = accumulatedPatch
            ? deepMerge(accumulatedPatch, tu.input.patch)
            : tu.input.patch;
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: 'Saved.',
        });
      }
      convo.push({ role: 'user', content: toolResults });
    }

    return res.json({
      success: true,
      data: { reply: replyText, patch: accumulatedPatch },
    });
  } catch (error) {
    console.error('AI attorney error:', error?.message || error);
    return res.status(500).json({ success: false, error: 'The AI attorney is unavailable right now.' });
  }
});

module.exports = router;
