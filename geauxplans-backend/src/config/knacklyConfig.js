/**
 * Knackly Configuration
 * Maps form types to Knackly catalog and app names
 *
 * Based on WordPress implementation and Knackly API responses
 */

const KNACKLY_CONFIG = {
  // Catalog name (GeauxPlans)
  catalogName: process.env.KNACKLY_CATALOG_NAME || 'GeauxPlans',

  // App names for each form type (matching WordPress implementation)
  // These are used to construct API paths: /catalogs/{catalog}/apps/{appName}
  formTypeToAppName: {
    // Solo (1 person) forms
    powerOfAttorneyForm: 'Power of Attorney Supplement Solo Documents',
    trustBasedEstatePlanSolo: 'Trust-Based Estate Plan Solo Documents',
    willBasedEstatePlan: 'Will-Based Estate Plan Solo Documents',
    minorChildEstatePlan: 'Minor Child-Centered Estate Plan Solo Documents',

    // 2 Person (couple) forms
    powerOfAttorneyForm2Person: 'Power of Attorney Supplement',
    trustBasedEstatePlan2Person: 'Trust-Based Estate Plan',
    willBasedEstatePlan2Person: 'Will-Based Estate Plan',
    minorChildEstatePlan2Person: 'Minor Child-Centered Estate Plan',
  },

  // Get catalog name
  getCatalogName() {
    return this.catalogName;
  },

  // Get app name for a form type
  getAppName(formType) {
    return this.formTypeToAppName[formType] || this.formTypeToAppName.powerOfAttorneyForm;
  },

  // Get URL-encoded app name for API paths
  getEncodedAppName(formType) {
    const appName = this.getAppName(formType);
    return encodeURIComponent(appName);
  },

  // Check if Knackly is configured (always true now since we have real credentials)
  isConfigured() {
    return true;
  },

  // Get full API path for an app
  getAppPath(formType) {
    return `/catalogs/${this.catalogName}/apps/${this.getEncodedAppName(formType)}`;
  },
};

module.exports = KNACKLY_CONFIG;
