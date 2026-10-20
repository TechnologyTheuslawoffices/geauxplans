/**
 * Application Constants
 * Grace periods, product IDs, and access control settings
 */

// Edit grace period in days after first submission
const EDIT_GRACE_PERIOD_DAYS = 30;

// Product IDs
const PRODUCTS = {
  POA: 614,
  MINOR_CHILD: 606,
  WILL_BASED: 673,
  TRUST_BASED: 676,
  SUBSCRIPTION: 1367, // Subscription product for extended access
};

// Form type to product mapping
const FORM_TYPE_PRODUCTS = {
  powerOfAttorneyForm: {
    productId: PRODUCTS.POA,
    gracePeriodDays: EDIT_GRACE_PERIOD_DAYS,
    subscriptionProductId: PRODUCTS.SUBSCRIPTION,
  },
  powerOfAttorneyForm2Person: {
    productId: PRODUCTS.POA,
    gracePeriodDays: EDIT_GRACE_PERIOD_DAYS,
    subscriptionProductId: PRODUCTS.SUBSCRIPTION,
  },
  minorChildEstatePlanSolo: {
    productId: PRODUCTS.MINOR_CHILD,
    gracePeriodDays: EDIT_GRACE_PERIOD_DAYS,
    subscriptionProductId: PRODUCTS.SUBSCRIPTION,
  },
  minorChildEstatePlan2Person: {
    productId: PRODUCTS.MINOR_CHILD,
    gracePeriodDays: EDIT_GRACE_PERIOD_DAYS,
    subscriptionProductId: PRODUCTS.SUBSCRIPTION,
  },
  willBasedEstatePlanSolo: {
    productId: PRODUCTS.WILL_BASED,
    gracePeriodDays: EDIT_GRACE_PERIOD_DAYS,
    subscriptionProductId: PRODUCTS.SUBSCRIPTION,
  },
  willBasedEstatePlan2Person: {
    productId: PRODUCTS.WILL_BASED,
    gracePeriodDays: EDIT_GRACE_PERIOD_DAYS,
    subscriptionProductId: PRODUCTS.SUBSCRIPTION,
  },
  trustBasedEstatePlanSolo: {
    productId: PRODUCTS.TRUST_BASED,
    gracePeriodDays: EDIT_GRACE_PERIOD_DAYS,
    subscriptionProductId: PRODUCTS.SUBSCRIPTION,
  },
  trustBasedEstatePlan2Person: {
    productId: PRODUCTS.TRUST_BASED,
    gracePeriodDays: EDIT_GRACE_PERIOD_DAYS,
    subscriptionProductId: PRODUCTS.SUBSCRIPTION,
  },
};

// Second-person upgrade: the paid, in-interview add-on that turns a solo plan
// into its 2-person variant for the exact price delta.
//
// Keys are the SOLO form_type strings AS ACTUALLY STORED — i.e. the frontend
// URL values from geauxplans-react/src/pages/formTypes.ts, which is what the
// interview submits back and what lands in poa_submissions.form_type. Note this
// diverges from FORM_TYPE_PRODUCTS above, whose will/minor keys carry a `Solo`
// suffix the frontend does not use; the two exist for different lookups and are
// deliberately not merged.
//
// deltaCents is the difference between the 2-person and solo prices in stripe.js
// PRODUCTS (POA 14900-9900, Will 29900-19900, Minor 29900-19900,
// Trust 59900-39900).
const SECOND_PERSON_UPGRADE = {
  powerOfAttorneyForm: {
    twoPersonType: 'powerOfAttorneyForm2Person',
    productId: PRODUCTS.POA,
    deltaCents: 5000,
  },
  willBasedEstatePlan: {
    twoPersonType: 'willBasedEstatePlan2Person',
    productId: PRODUCTS.WILL_BASED,
    deltaCents: 10000,
  },
  minorChildEstatePlan: {
    twoPersonType: 'minorChildEstatePlan2Person',
    productId: PRODUCTS.MINOR_CHILD,
    deltaCents: 10000,
  },
  trustBasedEstatePlanSolo: {
    twoPersonType: 'trustBasedEstatePlan2Person',
    productId: PRODUCTS.TRUST_BASED,
    deltaCents: 20000,
  },
};

// Business plan access tiers. Each is an app in the BusinessPlanning catalog,
// and the app name is stored as poa_submissions.form_type for a business set,
// the same way an estate set stores its estate form_type. The catalog defines
// all four identically (one template, no screens), so the tier is decided here
// by what was bought, not by the catalog.
//
// `includes` is what the set unlocks:
//   registration        GeauxPlans files the Articles of Organization
//   operatingAgreement  the Operating Agreement is drafted (OperatingAgreementFormer)
//   ein                 GeauxPlans obtains the EIN (staff service, no document)
//   licenses            GeauxPlans handles licensing (staff service, no document)
const BUSINESS_APPS = {
  LLCRegistration: {
    label: 'Registration Only',
    includes: { operatingAgreement: false, ein: false, licenses: false },
  },
  RegistrationOperating: {
    label: 'Registration and Operating Agreement',
    includes: { operatingAgreement: true, ein: false, licenses: false },
  },
  RegistrationOperatingEIN: {
    label: 'Registration, Operating Agreement, and EIN',
    includes: { operatingAgreement: true, ein: true, licenses: false },
  },
  RegistrationOperatingEINLicense: {
    label: 'Registration, Operating Agreement, EIN, and Licensing',
    includes: { operatingAgreement: true, ein: true, licenses: true },
  },
};

const BUSINESS_FORM_TYPES = Object.keys(BUSINESS_APPS);

/**
 * The business app a cart's SKUs buy, or null when they buy no app (a
 * registered agent on its own).
 *
 * The operating package sets the tier; the LLC package alone is Registration
 * Only. A customer who already has an LLC buys an operating package without an
 * LLC package: they get the same tier, with `registration` false so the
 * interview skips the filing questions and nobody files a second LLC.
 *
 * @param {string[]} skus BUSINESS_SKUS codes from one paid cart.
 * @returns {{formType: string, includes: object}|null}
 */
function resolveBusinessApp(skus) {
  const has = (sku) => skus.includes(sku);
  const llcPackage = ['gpx_llc_3', 'gpx_llc_2', 'gpx_llc_1'].find(has) || null;
  const operatingPackage = ['gpx_og_3', 'gpx_og_2', 'gpx_og_1'].find(has) || null;

  const formType =
    operatingPackage === 'gpx_og_3' ? 'RegistrationOperatingEINLicense' :
    operatingPackage === 'gpx_og_2' ? 'RegistrationOperatingEIN' :
    operatingPackage === 'gpx_og_1' ? 'RegistrationOperating' :
    llcPackage ? 'LLCRegistration' :
    null;
  if (!formType) return null;

  return {
    formType,
    llcPackage,
    operatingPackage,
    includes: {
      ...BUSINESS_APPS[formType].includes,
      registration: Boolean(llcPackage),
      registeredAgent: has('registered-agent'),
    },
  };
}

module.exports = {
  EDIT_GRACE_PERIOD_DAYS,
  PRODUCTS,
  FORM_TYPE_PRODUCTS,
  SECOND_PERSON_UPGRADE,
  BUSINESS_APPS,
  BUSINESS_FORM_TYPES,
  resolveBusinessApp,
};
