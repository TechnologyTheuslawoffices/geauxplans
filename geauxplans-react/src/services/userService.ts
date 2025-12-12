/**
 * User Profile Service
 *
 * Handles user profile and account management including:
 * - Profile updates
 * - Address management
 * - Subscription management (Legal Edge Plan)
 */

import api from './api';
import type { User, Address, LegalEdgePlan, ApiResponse } from '../types';

/**
 * Get current user profile
 */
export async function getProfile(): Promise<ApiResponse<User>> {
  return api.get<User>('/user/profile');
}

/**
 * Update user profile
 */
export async function updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
  return api.put<User>('/user/profile', data);
}

/**
 * Update user email (requires re-verification)
 */
export async function updateEmail(
  newEmail: string,
  password: string
): Promise<ApiResponse<{ message: string }>> {
  return api.post('/user/email', { newEmail, password });
}

/**
 * Update user password
 */
export async function updatePassword(
  currentPassword: string,
  newPassword: string
): Promise<ApiResponse<{ message: string }>> {
  return api.post('/user/password', { currentPassword, newPassword });
}

/**
 * Get billing address
 */
export async function getBillingAddress(): Promise<ApiResponse<Address>> {
  return api.get<Address>('/user/addresses/billing');
}

/**
 * Update billing address
 */
export async function updateBillingAddress(address: Address): Promise<ApiResponse<Address>> {
  return api.put<Address>('/user/addresses/billing', address);
}

/**
 * Get shipping address
 */
export async function getShippingAddress(): Promise<ApiResponse<Address>> {
  return api.get<Address>('/user/addresses/shipping');
}

/**
 * Update shipping address
 */
export async function updateShippingAddress(address: Address): Promise<ApiResponse<Address>> {
  return api.put<Address>('/user/addresses/shipping', address);
}

/**
 * Delete user account
 */
export async function deleteAccount(password: string): Promise<ApiResponse<{ message: string }>> {
  return api.delete('/user/account');
}

// Legal Edge Plan (Subscription) Management

/**
 * Get Legal Edge Plan subscription status
 */
export async function getLegalEdgePlan(): Promise<ApiResponse<LegalEdgePlan | null>> {
  return api.get<LegalEdgePlan | null>('/user/legal-edge-plan');
}

/**
 * Subscribe to Legal Edge Plan
 */
export async function subscribeLegalEdgePlan(
  paymentMethodId: string
): Promise<ApiResponse<LegalEdgePlan>> {
  return api.post<LegalEdgePlan>('/user/legal-edge-plan/subscribe', { paymentMethodId });
}

/**
 * Cancel Legal Edge Plan subscription
 */
export async function cancelLegalEdgePlan(): Promise<ApiResponse<{ message: string }>> {
  return api.post('/user/legal-edge-plan/cancel');
}

/**
 * Reactivate Legal Edge Plan subscription
 */
export async function reactivateLegalEdgePlan(
  paymentMethodId: string
): Promise<ApiResponse<LegalEdgePlan>> {
  return api.post<LegalEdgePlan>('/user/legal-edge-plan/reactivate', { paymentMethodId });
}

/**
 * Update Legal Edge Plan payment method
 */
export async function updateLegalEdgePlanPayment(
  paymentMethodId: string
): Promise<ApiResponse<{ message: string }>> {
  return api.put('/user/legal-edge-plan/payment-method', { paymentMethodId });
}

/**
 * Get user's downloads
 */
export async function getDownloads(): Promise<ApiResponse<{
  id: number;
  name: string;
  url: string;
  date: string;
}[]>> {
  return api.get('/user/downloads');
}

/**
 * Get user notification preferences
 */
export async function getNotificationPreferences(): Promise<ApiResponse<{
  email: boolean;
  sms: boolean;
  marketing: boolean;
}>> {
  return api.get('/user/notifications');
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(preferences: {
  email?: boolean;
  sms?: boolean;
  marketing?: boolean;
}): Promise<ApiResponse<{ message: string }>> {
  return api.put('/user/notifications', preferences);
}

// US States for address forms
export const US_STATES = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District Of Columbia' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

export default {
  getProfile,
  updateProfile,
  updateEmail,
  updatePassword,
  getBillingAddress,
  updateBillingAddress,
  getShippingAddress,
  updateShippingAddress,
  deleteAccount,
  getLegalEdgePlan,
  subscribeLegalEdgePlan,
  cancelLegalEdgePlan,
  reactivateLegalEdgePlan,
  updateLegalEdgePlanPayment,
  getDownloads,
  getNotificationPreferences,
  updateNotificationPreferences,
  US_STATES,
};
