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

module.exports = {
  EDIT_GRACE_PERIOD_DAYS,
  PRODUCTS,
  FORM_TYPE_PRODUCTS,
  SECOND_PERSON_UPGRADE,
};
