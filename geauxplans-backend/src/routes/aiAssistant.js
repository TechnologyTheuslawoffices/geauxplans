/**
 * GeauxPilot — the GeauxPlans AI assistant.
 *
 * A Claude-powered help assistant embedded site-wide (a floating launcher that
 * opens a slide-out chat panel). It answers questions about estate and business
 * planning, helps a visitor choose the right GeauxPlans plan, explains the
 * process and pricing, and points to the right page. For a signed-in customer it
 * can also look up their own plans via a read-only tool.
 *
 * This mirrors GeauxCounsel's "GeauxPilot" assistant, scaled to a customer-
 * facing storefront: product/navigation knowledge lives in the system prompt,
 * and the only tool is scoped to the signed-in user's own `poa_submissions`.
 *
 * Transport: Server-Sent Events. The turn is computed through a bounded tool
 * loop, then the final answer is streamed back in small chunks (type:"text"),
 * ending with type:"done" — the same compute-then-stream approach GeauxPilot
 * uses, which is robust on Vercel's serverless runtime.
 *
 * Auth is OPTIONAL: guests get product/navigation help; a valid Supabase JWT
 * unlocks the "look up my plans" tool. Mirrors the auth approach in
 * submissions-supabase.js / aiAttorney.js (Supabase JWT, not the SQLite
 * middleware, which can't run in the serverless bundle). See api/index.js.
 *
 * Logging is budgeted per CLAUDE.md — a handful of markers, never a per-turn flood.
 */

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../config/supabase');

const router = express.Router();

const MODEL = process.env.AI_ASSISTANT_MODEL || 'claude-sonnet-4-6';
const MAX_TOOL_ITERATIONS = 4;
const MAX_HISTORY_TURNS = 16; // keep the prompt bounded

/**
 * Friendly label for each stored form_type, so the plans tool can describe a
 * customer's plans in plain English. Unknown types fall back to the raw value.
 */
const FORM_TYPE_LABELS = {
  powerOfAttorneyForm: 'Power of Attorney Plan',
  powerOfAttorneyForm2Person: 'Power of Attorney Plan (for two)',
  willBasedEstatePlan: 'Will-Based Estate Plan',
  willBasedEstatePlan2Person: 'Will-Based Estate Plan (for two)',
  trustBasedEstatePlanSolo: 'Trust-Based Estate Plan',
  trustBasedEstatePlan2Person: 'Trust-Based Estate Plan (for two)',
  minorChildEstatePlan: 'Minor Child-Centered Estate Plan',
  minorChildEstatePlan2Person: 'Minor Child-Centered Estate Plan (for two)',
};

/**
 * Static product + navigation knowledge. Kept in the prompt (not a vector DB),
 * exactly as GeauxPilot injects per-app guide text. Pricing is the "starting at"
 * (one-person) figure; two-person pricing is higher and set at checkout.
 */
const PRODUCT_KNOWLEDGE = `## GeauxPlans — what we offer

GeauxPlans is an easy, affordable, self-service estate- and business-planning
platform built for Louisiana. Customers answer a guided interview online and
receive attorney-drafted Louisiana documents — no office visit required.

### Estate planning plans (prices start at the one-person price; two-person/couple pricing is higher and chosen at checkout)
- **Power of Attorney Plan** — from **$99**. Financial + healthcare powers of
  attorney and a living will / healthcare directive. Great for a college student
  or an aging parent. Page: /power-of-attorney-plan
- **Will-Based Estate Plan** — from **$199**. A Louisiana last will and testament
  plus powers of attorney and healthcare directives. To control your legacy and
  name guardians/executors. Page: /will-based-estate-plan
- **Minor Child-Centered Estate Plan** — from **$199**. Built for families with
  young children: guardianship, a children's trust, and the core documents.
  Page: /minor-child-centered-estate-plan
- **Trust-Based Estate Plan** — from **$399**. A revocable living trust to avoid
  probate and transfer assets smoothly, with a pour-over will and the full
  document set. Page: /trust-based-estate-plan
- **Legal Edge Plan** — **$9.99/month**. A premium membership that adds benefits
  and ongoing access/updates. Page: /legal-edge-plan

Not sure which plan fits? The free quiz recommends one in a couple of minutes:
Page: /estate-planning ("Take the quiz").

### Business planning
- **Start an LLC** — from **$89**. Form a brand-new Louisiana LLC (includes a
  name-availability check). Page: /start-business-llc
- **Operating Agreement for LLC** — from **$149**. Add an operating agreement to
  a company you already run. Page: /operating-agreement-llc

### How it works
1. Pick a plan (or take the quiz). 2. Create a free account. 3. Complete the
guided interview — you can also use "Talk to an Attorney (AI)" inside the
interview, which fills the form as you chat. 4. Pay securely. 5. Your Louisiana
documents are generated and available to download under your account.

### Account & navigation
- My Account home / dashboard: /my-account
- Your estate plans & document downloads: /my-account/my-estate-planning
- Your companies / business plans: /my-account/business-planning
- Order history: /my-account/orders
- Edit profile: /my-account/edit-account
- Learn / articles: /learn , estate articles: /category/estate-planning-articles ,
  business articles: /category/business-planning-articles
- Free webinar: /register-for-webinar
- Cart: /cart , Checkout: /checkout
- Contact / support: /contact

### Human support
Phone: +1 (855) 213-6300, Monday–Friday, 8am–5pm CST. For anything complex, or
to speak with a person, point the customer to /contact or that number.`;

function buildSystemPrompt({ firstName, isAuthenticated }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const who = firstName
    ? `You are talking with ${firstName}, a signed-in GeauxPlans customer.`
    : `You are talking with a visitor who may not have an account yet.`;

  const toolNote = isAuthenticated
    ? `When the customer asks about THEIR OWN plans, orders, documents, or where
things stand, use the get_my_plans tool to look up their real records, then
answer from the result. Never guess at their data.`
    : `This visitor is not signed in, so you cannot look up personal account data.
If they ask about "my plans/orders", invite them to sign in at /login (or create
an account at /register) first.`;

  return `You are **GeauxPilot**, the friendly AI assistant built into the
GeauxPlans website. You help customers understand estate and business planning,
choose the right GeauxPlans plan for their situation, understand pricing and the
process, and find their way around the site.

${who}
Today is ${today}.

## How you communicate
- Warm, clear, and concise. Plain English — explain any legal term (executor,
  trustee, probate, power of attorney, residuary, etc.) in one short sentence the
  first time you use it.
- Get to the point. Prefer a short answer plus a next step over a long lecture.
- Use Markdown: short paragraphs, bold for key terms, and bullet lists when
  comparing options.
- When you recommend a page, link it with Markdown using the EXACT paths from the
  knowledge below, e.g. [take the quiz](/estate-planning) or
  [Trust-Based Estate Plan](/trust-based-estate-plan). Never invent a URL or a
  price that is not in the knowledge below.

## Boundaries
- GeauxPlans is a self-service document platform for **Louisiana**, not a law
  firm, and you are not anyone's attorney. Give general information and help
  people choose and use a plan — do NOT give personalized legal advice or tell
  someone exactly what to put in their documents. For case-specific legal
  questions or anything complex, suggest they call +1 (855) 213-6300
  (Mon–Fri, 8am–5pm CST) or visit [Contact](/contact).
- If someone describes a situation clearly outside Louisiana, let them know our
  documents are Louisiana-specific.
- Stay on topic: estate/business planning and using GeauxPlans. If asked for
  something unrelated, decline briefly and steer back in one sentence.
- Never fabricate. If you don't know something (a navigation path, a price, or a
  detail about their account), say so and point to support — don't guess.

${toolNote}

${PRODUCT_KNOWLEDGE}

End substantive answers by offering a concrete next step (take the quiz, open a
plan page, sign in, or call support) when it's helpful.`;
}

const GET_MY_PLANS_TOOL = {
  name: 'get_my_plans',
  description:
    "Look up the signed-in customer's own estate/business plans on GeauxPlans " +
    '(their submissions). Use this whenever they ask about their own plans, ' +
    'orders, documents, status, or submission numbers. Returns a JSON list.',
  input_schema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

/**
 * Optional auth: attach req.user if a valid Supabase JWT is present, otherwise
 * continue as a guest. Never blocks the request.
 */
async function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || !supabase) {
    return next();
  }
  try {
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      req.user = { id: user.id, email: user.email };
    }
  } catch (_err) {
    // ignore — treat as guest
  }
  return next();
}

/**
 * Execute the get_my_plans tool for the signed-in user. Read-only, scoped to
 * their own user_id. Returns a compact, plain-English summary of each plan.
 */
async function runGetMyPlans(userId) {
  if (!userId || !supabase) {
    return { plans: [], note: 'Not signed in.' };
  }
  try {
    const { data, error } = await supabase
      .from('poa_submissions')
      .select('submission_number, form_type, submission_status, knackly_documents, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      return { plans: [], note: 'Could not read your plans right now.' };
    }

    const plans = (data || []).map((s) => {
      const docs = Array.isArray(s.knackly_documents)
        ? s.knackly_documents.filter((d) => d && d.name !== '__zip__')
        : [];
      return {
        submissionNumber: s.submission_number || null,
        plan: FORM_TYPE_LABELS[s.form_type] || s.form_type,
        status: s.submission_status || 'in progress',
        documentsReady: docs.length,
        lastUpdated: s.updated_at || s.created_at || null,
      };
    });

    return {
      plans,
      note: plans.length
        ? 'These are the customer\'s own plans. View/download under /my-account/my-estate-planning.'
        : 'The customer has no plans yet. Suggest the quiz at /estate-planning.',
    };
  } catch (_err) {
    return { plans: [], note: 'Could not read your plans right now.' };
  }
}

/**
 * POST /api/ai-assistant/chat
 * Body: { messages: [{ role:'user'|'assistant', content }] }
 * Streams Server-Sent Events: {type:'text',text} ... {type:'done'} (or {type:'error'}).
 */
router.post('/chat', optionalAuth, async (req, res) => {
  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'messages must be a non-empty array.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ success: false, error: 'The assistant is not configured.' });
  }

  // Set up the SSE stream.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const isAuthenticated = !!req.user?.id;

    const firstNameFromMeta = async () => {
      if (!isAuthenticated || !supabase) return '';
      try {
        const { data: { user } } = await supabase.auth.getUser(
          (req.headers.authorization || '').substring(7)
        );
        return user?.user_metadata?.first_name || '';
      } catch (_e) {
        return '';
      }
    };
    const firstName = await firstNameFromMeta();

    const system = buildSystemPrompt({ firstName, isAuthenticated });

    // Keep only well-formed conversational turns, and bound the history length.
    const convo = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.content }));

    const tools = isAuthenticated ? [GET_MY_PLANS_TOOL] : [];

    let finalText = '';

    // Bounded tool loop: Claude may call get_my_plans before its final answer.
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1200,
        system,
        tools,
        messages: convo,
      });

      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      const texts = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (texts) finalText = texts;

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        break;
      }

      convo.push({ role: 'assistant', content: response.content });
      const toolResults = [];
      for (const tu of toolUses) {
        let result = { error: 'Unknown tool.' };
        if (tu.name === 'get_my_plans') {
          result = await runGetMyPlans(req.user?.id);
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      }
      convo.push({ role: 'user', content: toolResults });
    }

    if (!finalText) {
      finalText = "I'm sorry — I couldn't put together an answer just now. Please try rephrasing, or call us at +1 (855) 213-6300.";
    }

    // Stream the answer back in small word-group chunks for a natural feel.
    const tokens = finalText.match(/\S+\s*/g) || [finalText];
    let buffer = '';
    for (let i = 0; i < tokens.length; i++) {
      buffer += tokens[i];
      // flush every ~3 tokens
      if ((i + 1) % 3 === 0 || i === tokens.length - 1) {
        send({ type: 'text', text: buffer });
        buffer = '';
        // small pace; harmless if the socket is fast
        await new Promise((r) => setTimeout(r, 12));
      }
    }

    send({ type: 'done' });
    res.end();
  } catch (error) {
    console.error('AI assistant error:', error?.message || error);
    try {
      send({ type: 'error', error: 'The assistant is unavailable right now. Please try again, or call +1 (855) 213-6300.' });
      res.end();
    } catch (_e) {
      // headers already flushed / socket closed
    }
  }
});

module.exports = router;
