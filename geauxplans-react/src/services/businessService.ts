/**
 * Business Planning Service
 *
 * Handles business/LLC related API calls including:
 * - LLC name availability check (Louisiana SOS)
 * - Business entity management
 * - LLC formation process
 */

import api, { wpAjaxRequest } from './api';
import type {
  BusinessEntity,
  BusinessDocument,
  BusinessPlanBuilderData,
  LLCAvailabilityResponse,
  ApiResponse,
  PaginatedResponse,
} from '../types';

// Product IDs for business packages (from WordPress)
export const BUSINESS_PRODUCT_IDS = {
  REGISTERED_AGENT: 3041,
  OPERATING_PACKAGE_1: 3043,
  OPERATING_PACKAGE_2: 3044,
  OPERATING_PACKAGE_3: 3045,
  LLC_FORMATION_1: 3048,
  LLC_FORMATION_2: 3049,
  LLC_FORMATION_3: 3050,
} as const;

/**
 * Check LLC name availability via Louisiana SOS
 * Note: In production, this should go through your backend to protect API credentials
 */
export async function checkLLCAvailability(name: string): Promise<ApiResponse<LLCAvailabilityResponse>> {
  return api.get<LLCAvailabilityResponse>(`/business/check-llc?name=${encodeURIComponent(name)}`);
}

/**
 * Get all business entities for the current user
 */
export async function getBusinessEntities(): Promise<ApiResponse<BusinessEntity[]>> {
  return api.get<BusinessEntity[]>('/business/entities');
}

/**
 * Get business entities with pagination
 */
export async function getBusinessEntitiesPaginated(
  page: number = 1,
  pageSize: number = 10
): Promise<ApiResponse<PaginatedResponse<BusinessEntity>>> {
  return api.get<PaginatedResponse<BusinessEntity>>(`/business/entities?page=${page}&pageSize=${pageSize}`);
}

/**
 * Get a specific business entity by ID
 */
export async function getBusinessEntity(entityId: number): Promise<ApiResponse<BusinessEntity>> {
  return api.get<BusinessEntity>(`/business/entities/${entityId}`);
}

/**
 * Get documents for a business entity
 */
export async function getBusinessDocuments(entityId: number): Promise<ApiResponse<BusinessDocument[]>> {
  return api.get<BusinessDocument[]>(`/business/entities/${entityId}/documents`);
}

/**
 * Download a business document
 */
export async function downloadBusinessDocument(
  entityId: number,
  documentId: number
): Promise<ApiResponse<{ downloadUrl: string }>> {
  return api.get<{ downloadUrl: string }>(`/business/entities/${entityId}/documents/${documentId}/download`);
}

/**
 * Submit business plan builder form
 */
export async function submitBusinessPlanBuilder(
  data: BusinessPlanBuilderData
): Promise<ApiResponse<{ entityId: number; redirectUrl: string }>> {
  return api.post('/business/builder', data);
}

/**
 * Get operating agreement packages
 */
export async function getOperatingAgreementPackages(): Promise<ApiResponse<{
  id: string;
  name: string;
  price: number;
  features: string[];
}[]>> {
  return api.get('/business/packages/operating-agreement');
}

/**
 * Get LLC formation packages
 */
export async function getLLCFormationPackages(): Promise<ApiResponse<{
  id: string;
  name: string;
  price: number;
  features: string[];
}[]>> {
  return api.get('/business/packages/llc-formation');
}

// WordPress AJAX fallback methods
export const wpBusiness = {
  /**
   * Check LLC availability (check_llc type)
   */
  async checkLLC(name: string): Promise<ApiResponse<{ status: boolean }>> {
    return wpAjaxRequest('check_llc', encodeURIComponent(name));
  },

  /**
   * Submit business plan purchase (purchasebp type)
   */
  async purchaseBusinessPlan(formData: Record<string, any>): Promise<ApiResponse<any>> {
    // Convert form data to serialized string format expected by WordPress
    const serialized = Object.entries(formData)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
    return wpAjaxRequest('purchasebp', serialized);
  },

  /**
   * Check operating agreement (op_ag type)
   */
  async checkOperatingAgreement(llcName: string, variationId: number): Promise<ApiResponse<any>> {
    return wpAjaxRequest('op_ag', `${llcName},${variationId}`);
  },
};

/**
 * LLC name validation utilities
 */
export const llcUtils = {
  /**
   * Normalize LLC name for comparison
   */
  normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/,?\s*(llc|l\.l\.c\.|limited liability company)\.?$/i, '')
      .trim();
  },

  /**
   * Check if names are equivalent
   */
  namesMatch(name1: string, name2: string): boolean {
    return this.normalizeName(name1) === this.normalizeName(name2);
  },

  /**
   * Validate LLC name format
   */
  isValidLLCName(name: string): { valid: boolean; error?: string } {
    if (!name || name.trim().length < 3) {
      return { valid: false, error: 'LLC name must be at least 3 characters' };
    }

    // Check for required LLC suffix
    const hasLLCSuffix = /,?\s*(llc|l\.l\.c\.|limited liability company)\.?$/i.test(name);

    // Louisiana requires LLC designation in name
    if (!hasLLCSuffix) {
      return { valid: false, error: 'Name must include "LLC" or "Limited Liability Company"' };
    }

    return { valid: true };
  },

  /**
   * Format LLC name properly
   */
  formatLLCName(name: string): string {
    const normalized = this.normalizeName(name);
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}, LLC`;
  },
};

export default {
  checkLLCAvailability,
  getBusinessEntities,
  getBusinessEntitiesPaginated,
  getBusinessEntity,
  getBusinessDocuments,
  downloadBusinessDocument,
  submitBusinessPlanBuilder,
  getOperatingAgreementPackages,
  getLLCFormationPackages,
  wpBusiness,
  llcUtils,
  BUSINESS_PRODUCT_IDS,
};
