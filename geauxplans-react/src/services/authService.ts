/**
 * Authentication Service
 *
 * Handles user authentication, registration, and session management.
 * Mirrors the WordPress gpx_ajax_request 'modal' type handler.
 */

import api, { setAuthToken, removeAuthToken, wpAjaxRequest } from './api';
import type { User, AuthCredentials, RegisterData, AuthResponse, ApiResponse } from '../types';

/**
 * Login user
 */
export async function login(credentials: AuthCredentials): Promise<ApiResponse<AuthResponse>> {
  const response = await api.post<AuthResponse>('/auth/login', credentials);

  if (response.success && response.data?.token) {
    setAuthToken(response.data.token);
  }

  return response;
}

/**
 * Register new user
 */
export async function register(data: RegisterData): Promise<ApiResponse<AuthResponse>> {
  const response = await api.post<AuthResponse>('/auth/register', {
    email: data.email,
    password: data.password,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
  });

  if (response.success && response.data?.token) {
    setAuthToken(response.data.token);
  }

  return response;
}

/**
 * Logout user
 */
export async function logout(): Promise<ApiResponse<void>> {
  const response = await api.post<void>('/auth/logout');
  removeAuthToken();
  return response;
}

/**
 * Get current user profile
 */
export async function getCurrentUser(): Promise<ApiResponse<User>> {
  return api.get<User>('/auth/me');
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string): Promise<ApiResponse<{ message: string }>> {
  return api.post('/auth/forgot-password', { email });
}

/**
 * Reset password with token
 */
export async function resetPassword(
  token: string,
  password: string
): Promise<ApiResponse<{ message: string }>> {
  return api.post('/auth/reset-password', { token, password });
}

/**
 * Update user password
 */
export async function updatePassword(
  currentPassword: string,
  newPassword: string
): Promise<ApiResponse<{ message: string }>> {
  return api.post('/auth/update-password', { currentPassword, newPassword });
}

/**
 * Verify email with token
 */
export async function verifyEmail(token: string): Promise<ApiResponse<{ message: string }>> {
  return api.post('/auth/verify-email', { token });
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem('gpx_auth_token');
}

// WordPress AJAX fallback methods (for migration period)
export const wpAuth = {
  /**
   * Login via WordPress AJAX (legacy)
   */
  async login(email: string, password: string, planId?: string): Promise<ApiResponse<any>> {
    return wpAjaxRequest('modal', {
      type: 'login',
      email,
      password,
      planid: planId || '',
    });
  },

  /**
   * Register via WordPress AJAX (legacy)
   */
  async register(email: string, password: string, planId?: string): Promise<ApiResponse<any>> {
    return wpAjaxRequest('modal', {
      type: 'register',
      email,
      password,
      planid: planId || '',
    });
  },
};

export default {
  login,
  register,
  logout,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  updatePassword,
  verifyEmail,
  isAuthenticated,
  wpAuth,
};
