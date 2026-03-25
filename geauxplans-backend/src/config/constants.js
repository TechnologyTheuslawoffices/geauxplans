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

module.exports = {
  EDIT_GRACE_PERIOD_DAYS,
  PRODUCTS,
  FORM_TYPE_PRODUCTS,
};
