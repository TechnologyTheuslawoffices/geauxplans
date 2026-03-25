/**
 * Form Access Control Helper
 * Manages 30-day edit grace period and subscription-based access extension
 */

const { supabase } = require('../config/supabase');
const { EDIT_GRACE_PERIOD_DAYS, FORM_TYPE_PRODUCTS, PRODUCTS } = require('../config/constants');

/**
 * Check if a date is within the grace period
 * @param {string} firstSubmittedAt - ISO date string of first submission
 * @param {number} gracePeriodDays - Number of days in grace period
 * @returns {boolean}
 */
function isWithinGracePeriod(firstSubmittedAt, gracePeriodDays = EDIT_GRACE_PERIOD_DAYS) {
  if (!firstSubmittedAt) {
    return true; // No submission yet, can edit
  }

  const submissionDate = new Date(firstSubmittedAt);
  const gracePeriodEnd = new Date(submissionDate);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

  return new Date() <= gracePeriodEnd;
}

/**
 * Calculate days remaining in grace period
 * @param {string} firstSubmittedAt - ISO date string of first submission
 * @param {number} gracePeriodDays - Number of days in grace period
 * @returns {number} Days remaining (0 if expired)
 */
function getDaysRemaining(firstSubmittedAt, gracePeriodDays = EDIT_GRACE_PERIOD_DAYS) {
  if (!firstSubmittedAt) {
    return gracePeriodDays; // Full grace period available
  }

  const submissionDate = new Date(firstSubmittedAt);
  const gracePeriodEnd = new Date(submissionDate);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

  const now = new Date();
  const diffMs = gracePeriodEnd - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Check if user has an active subscription for extended access
 * @param {string} userId - User ID
 * @param {number} subscriptionProductId - Product ID for subscription
 * @returns {Promise<boolean>}
 */
async function hasActiveSubscription(userId, subscriptionProductId = PRODUCTS.SUBSCRIPTION) {
  if (!supabase || !userId) {
    return false;
  }

  try {
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('id, status, expires_at')
      .eq('user_id', userId)
      .eq('product_id', subscriptionProductId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .single();

    if (error || !subscription) {
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error checking subscription:', err);
    return false;
  }
}

/**
 * Check if user can edit a form submission
 * @param {string} userId - User ID
 * @param {string} firstSubmittedAt - ISO date string of first submission
 * @param {string} formType - Form type (e.g., 'powerOfAttorneyForm')
 * @returns {Promise<object>} { canEdit, reason, daysRemaining, hasSubscription }
 */
async function canEditForm(userId, firstSubmittedAt, formType = 'powerOfAttorneyForm') {
  const config = FORM_TYPE_PRODUCTS[formType] || {
    gracePeriodDays: EDIT_GRACE_PERIOD_DAYS,
    subscriptionProductId: PRODUCTS.SUBSCRIPTION,
  };

  const gracePeriodDays = config.gracePeriodDays;
  const subscriptionProductId = config.subscriptionProductId;

  // If no submission yet, can edit
  if (!firstSubmittedAt) {
    return {
      canEdit: true,
      reason: 'new_submission',
      daysRemaining: gracePeriodDays,
      hasSubscription: false,
    };
  }

  // Check grace period first
  const withinGrace = isWithinGracePeriod(firstSubmittedAt, gracePeriodDays);
  const daysRemaining = getDaysRemaining(firstSubmittedAt, gracePeriodDays);

  if (withinGrace) {
    return {
      canEdit: true,
      reason: 'within_grace_period',
      daysRemaining,
      hasSubscription: false,
      message: `You can edit this form for ${daysRemaining} more day${daysRemaining !== 1 ? 's' : ''}.`,
    };
  }

  // Grace period expired - check subscription
  const hasSubscription = await hasActiveSubscription(userId, subscriptionProductId);

  if (hasSubscription) {
    return {
      canEdit: true,
      reason: 'active_subscription',
      daysRemaining: 0,
      hasSubscription: true,
      message: 'You can edit this form with your active subscription.',
    };
  }

  // No access
  return {
    canEdit: false,
    reason: 'expired',
    daysRemaining: 0,
    hasSubscription: false,
    message: `Your ${gracePeriodDays}-day editing period has expired. Purchase a subscription to continue editing.`,
  };
}

/**
 * Get full form access status with additional details
 * @param {string} userId - User ID
 * @param {object} submission - Submission object with first_submitted_at, form_type
 * @returns {Promise<object>} Complete access status
 */
async function getFormAccessStatus(userId, submission) {
  const formType = submission.form_type || 'powerOfAttorneyForm';
  const firstSubmittedAt = submission.first_submitted_at;

  const accessInfo = await canEditForm(userId, firstSubmittedAt, formType);

  const config = FORM_TYPE_PRODUCTS[formType] || {
    gracePeriodDays: EDIT_GRACE_PERIOD_DAYS,
    subscriptionProductId: PRODUCTS.SUBSCRIPTION,
  };

  return {
    ...accessInfo,
    formType,
    firstSubmittedAt,
    gracePeriodDays: config.gracePeriodDays,
    subscriptionProductId: config.subscriptionProductId,
    submissionStatus: submission.submission_status,
  };
}

module.exports = {
  isWithinGracePeriod,
  getDaysRemaining,
  hasActiveSubscription,
  canEditForm,
  getFormAccessStatus,
  EDIT_GRACE_PERIOD_DAYS,
};
