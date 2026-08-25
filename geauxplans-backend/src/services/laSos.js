/**
 * Louisiana Secretary of State name-availability lookup.
 *
 * This lives in services/ rather than in routes/business.js because that file
 * requires ../config/database at module load, which pulls in sql.js. Vercel runs
 * with USE_SUPABASE set, and server.js deliberately refuses to load any
 * SQLite-backed router there — so anything defined inside business.js is
 * unreachable in production. The SOS lookup needs no database at all, so keeping
 * it here lets a router mount it in both modes.
 *
 * `available` is deliberately three-valued:
 *
 *   true   the SOS answered and reported no matching entity
 *   false  the SOS answered and reported a matching entity
 *   null   we could not get an answer
 *
 * null is not a synonym for true. The caller has to be able to tell "this name
 * is free" apart from "we don't know", because treating a failed lookup as
 * success lets customers buy a registration for a name already taken.
 *
 * That distinction is not hypothetical. This API answers **HTTP 200 with an
 * empty result list** when it refuses you:
 *
 *   {"EntitySearchResults":[],"ResultCount":0,
 *    "Status":"AccessDenied","ResponseCode":"SubscriptionExpired"}
 *
 * A caller that checks only `response.ok` and then reads `EntitySearchResults`
 * sees "no matches" and reports every name as available. The legacy WordPress
 * handler did exactly that. So we inspect the status envelope before trusting
 * the list.
 */

/** Shape returned when the lookup could not be completed. */
function unknown(message) {
  return { available: null, message, similar: [], checked: false };
}

/**
 * Strip the LLC designator and case so "Bayou Supply, L.L.C." and
 * "BAYOU SUPPLY LLC" compare equal.
 */
function normalizeName(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+(L\s*L\s*C|LIMITED LIABILITY COMPANY)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} name Proposed entity name.
 * @returns {Promise<{available: boolean|null, message: string, similar: Array, checked: boolean}>}
 */
async function checkLLCAvailability(name) {
  const apiUrl = process.env.LA_SOS_API_URL;
  const token = process.env.LA_SOS_TOKEN;
  const email = process.env.LA_SOS_EMAIL;

  if (!apiUrl || !token) {
    // Local dev without credentials. Report "unknown" rather than "available":
    // a developer seeing a green tick would reasonably assume the integration
    // works, and that assumption is what hid this bug in production.
    return unknown('Name availability could not be verified (SOS lookup is not configured).');
  }

  let data;
  try {
    // GET with the token in the query string. This is the contract the SOS
    // actually implements — a POST with a Bearer header returns 404.
    const url = new URL(apiUrl);
    url.searchParams.set('token', token);
    url.searchParams.set('emailaddress', email || '');
    url.searchParams.set('entityname', name);
    url.searchParams.set('firstname', '');
    url.searchParams.set('lastname', '');

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`SOS API responded ${response.status}`);
    }

    data = await response.json();
  } catch (error) {
    console.error(`LA SOS lookup failed for "${name}": ${error.message}`);
    return unknown('We could not reach the Louisiana Secretary of State to verify this name.');
  }

  // Allowlist the good statuses instead of blocklisting the bad ones. An
  // unrecognised code then degrades to "we don't know" — visible and safe —
  // rather than to a false "available".
  const status = String(data.Status || '').toLowerCase();
  if (status && status !== 'success' && status !== 'ok') {
    console.error(
      `LA SOS refused lookup for "${name}": Status=${data.Status} ResponseCode=${data.ResponseCode}`
    );
    return unknown('We could not verify this name with the Louisiana Secretary of State right now.');
  }

  const results = Array.isArray(data.EntitySearchResults) ? data.EntitySearchResults : [];
  const target = normalizeName(name);

  // Any registered entity with the same distinguishable name is a conflict, not
  // just an LLC — Louisiana will reject the filing either way. The legacy code
  // filtered to TypeName === 'Limited Liability Company' and, worse, returned
  // "available" as soon as it saw any entity that did not match, so a real
  // conflict sitting behind one near-miss in the result list was reported free.
  const conflict = results.find((entity) => normalizeName(entity.Name) === target);

  const similar = results.slice(0, 5).map((entity) => ({
    name: entity.Name,
    type: entity.TypeName,
    status: entity.Status,
    charterNumber: entity.CharterNumber,
  }));

  return {
    available: !conflict,
    message: conflict
      ? 'This name is already registered in Louisiana.'
      : 'Name appears to be available.',
    similar,
    checked: true,
  };
}

module.exports = { checkLLCAvailability, normalizeName };
