/**
 * Estate Plan Service
 *
 * Handles estate planning related API calls including:
 * - Fetching user's estate plans
 * - Plan builder operations
 * - Document downloads
 * - Knackly form integration
 */

import api, { wpAjaxRequest } from './api';
import type {
  EstatePlan,
  PlanDocument,
  PlanBuilderData,
  PlanType,
  KnacklyFormUrl,
  ApiResponse,
  PaginatedResponse,
} from '../types';

// Plan ID mapping (from WordPress)
export const PLAN_IDS = {
  POWER_OF_ATTORNEY: 614,
  MINOR_CHILD_CENTERED: 606,
  TRUST_BASED: 676,
  WILL_BASED: 673,
} as const;

export const PLAN_NAMES: Record<number, string> = {
  614: 'Power of Attorney Supplement',
  606: 'Minor Child-Centered Estate Plan',
  676: 'Trust-Based Estate Plan',
  673: 'Will-Based Estate Plan',
};

/**
 * Get all estate plans for the current user
 */
export async function getEstatePlans(): Promise<ApiResponse<EstatePlan[]>> {
  return api.get<EstatePlan[]>('/estate-plans');
}

/**
 * Get a specific estate plan by ID
 */
export async function getEstatePlan(planId: number): Promise<ApiResponse<EstatePlan>> {
  return api.get<EstatePlan>(`/estate-plans/${planId}`);
}

/**
 * Get estate plans with pagination
 */
export async function getEstatePlansPaginated(
  page: number = 1,
  pageSize: number = 10
): Promise<ApiResponse<PaginatedResponse<EstatePlan>>> {
  return api.get<PaginatedResponse<EstatePlan>>(`/estate-plans?page=${page}&pageSize=${pageSize}`);
}

/**
 * Get documents for a specific estate plan
 */
export async function getPlanDocuments(planId: number): Promise<ApiResponse<PlanDocument[]>> {
  return api.get<PlanDocument[]>(`/estate-plans/${planId}/documents`);
}

/**
 * Download a specific document
 */
export async function downloadDocument(
  planId: number,
  documentId: number
): Promise<ApiResponse<{ downloadUrl: string }>> {
  return api.get<{ downloadUrl: string }>(`/estate-plans/${planId}/documents/${documentId}/download`);
}

/**
 * Get Knackly form URL for a plan type
 * This generates a tokenized URL for the Knackly interview form
 */
export async function getKnacklyFormUrl(planType: PlanType): Promise<ApiResponse<KnacklyFormUrl>> {
  return api.get<KnacklyFormUrl>(`/estate-plans/knackly-form/${planType}`);
}

/**
 * Submit plan builder data
 */
export async function submitPlanBuilder(data: PlanBuilderData): Promise<ApiResponse<{ planId: number }>> {
  return api.post<{ planId: number }>('/estate-plans/builder', data);
}

/**
 * Get plan recommendation based on user answers
 */
export async function getPlanRecommendation(answers: Record<string, any>): Promise<ApiResponse<{
  recommendedPlan: PlanType;
  planId: number;
  planName: string;
}>> {
  return api.post('/estate-plans/recommend', answers);
}

/**
 * Request plan revision (for Legal Edge Plan members)
 */
export async function requestRevision(
  planId: number,
  revisionNotes: string
): Promise<ApiResponse<{ message: string }>> {
  return api.post(`/estate-plans/${planId}/revision`, { revisionNotes });
}

// WordPress AJAX fallback methods
export const wpEstatePlan = {
  /**
   * Get estate plan selection HTML (ep_selection type)
   */
  async getPlanSelection(planId: number): Promise<ApiResponse<{ content: string }>> {
    return wpAjaxRequest('ep_selection', planId.toString());
  },

  /**
   * Purchase estate plan (purchaseplan type)
   */
  async purchasePlan(productIds: number[]): Promise<ApiResponse<any>> {
    return wpAjaxRequest('purchaseplan', productIds.join(','));
  },

  /**
   * Get modal content for logged in user (modal_logged_in type)
   */
  async getModalLoggedIn(planId: string): Promise<ApiResponse<{ content: string }>> {
    return wpAjaxRequest('modal_logged_in', { planid: planId });
  },
};

/**
 * Plan type utilities
 */
export const planUtils = {
  /**
   * Get plan name from ID
   */
  getPlanName(planId: number): string {
    return PLAN_NAMES[planId] || 'Unknown Plan';
  },

  /**
   * Get plan type from ID
   */
  getPlanType(planId: number): PlanType | null {
    switch (planId) {
      case PLAN_IDS.POWER_OF_ATTORNEY:
        return 'power-of-attorney';
      case PLAN_IDS.MINOR_CHILD_CENTERED:
        return 'minor-child';
      case PLAN_IDS.TRUST_BASED:
        return 'trust-based';
      case PLAN_IDS.WILL_BASED:
        return 'will-based';
      default:
        return null;
    }
  },

  /**
   * Get plan ID from type
   */
  getPlanId(planType: PlanType): number {
    switch (planType) {
      case 'power-of-attorney':
        return PLAN_IDS.POWER_OF_ATTORNEY;
      case 'minor-child':
        return PLAN_IDS.MINOR_CHILD_CENTERED;
      case 'trust-based':
        return PLAN_IDS.TRUST_BASED;
      case 'will-based':
        return PLAN_IDS.WILL_BASED;
    }
  },
};

export default {
  getEstatePlans,
  getEstatePlan,
  getEstatePlansPaginated,
  getPlanDocuments,
  downloadDocument,
  getKnacklyFormUrl,
  submitPlanBuilder,
  getPlanRecommendation,
  requestRevision,
  wpEstatePlan,
  planUtils,
  PLAN_IDS,
  PLAN_NAMES,
};
