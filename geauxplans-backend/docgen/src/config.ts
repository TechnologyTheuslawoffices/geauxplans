// Configuration for GeauxPlans v2

// doc-tools API base URL - update this for production
export const DOC_TOOLS_API = process.env.REACT_APP_DOC_TOOLS_API || 'http://localhost:3000';

// Available catalogs - comma-separated list, can be extended via env variable
// Example: REACT_APP_CATALOGS=EstatePlanning,EstateAdmin,LoanDocuments
export const AVAILABLE_CATALOGS = (process.env.REACT_APP_CATALOGS || 'EstatePlanning,EstateAdmin,BusinessPlanning').split(',').map(s => s.trim());

// Default catalog (first in the list)
export const DEFAULT_CATALOG = AVAILABLE_CATALOGS[0];

// Backward compatibility: CATALOG_ID for doc-tools service
export const CATALOG_ID = DEFAULT_CATALOG;

// Local storage keys
export const STORAGE_KEYS = {
  RECORDS: 'geauxplans_records',
  INTERVIEW_DATA: 'geauxplans_interview_',
} as const;
