/**
 * API Service Configuration
 *
 * This is the base API configuration for GeauxPlans React app.
 * Configure the API_BASE_URL to point to your backend server.
 */

import { supabase } from '../lib/supabase';

// API Base URL - Uses /api for Vercel serverless functions
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// WordPress AJAX endpoint (for legacy integration during migration)
const WP_AJAX_URL = process.env.REACT_APP_WP_URL || 'https://geauxplans.com/wp-admin/admin-ajax.php';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  requiresVerification?: boolean;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  useWpAjax?: boolean;
}

/**
 * Get Supabase auth token - refreshes if expired
 */
const getAuthToken = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return null;

  // Check if token is expired or about to expire (within 60 seconds)
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  const now = Date.now();
  const isExpired = expiresAt < now + 60000; // 60 second buffer

  if (isExpired) {
    // Refresh the session
    const { data: { session: refreshedSession }, error } = await supabase.auth.refreshSession();
    if (error || !refreshedSession) {
      console.error('Failed to refresh session:', error);
      return null;
    }
    return refreshedSession.access_token;
  }

  return session.access_token;
};

/**
 * Set auth token in storage
 */
export const setAuthToken = (token: string): void => {
  localStorage.setItem('gpx_auth_token', token);
};

/**
 * Remove auth token from storage
 */
export const removeAuthToken = (): void => {
  localStorage.removeItem('gpx_auth_token');
};

/**
 * Base API request function
 */
async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const {
    method = 'GET',
    headers = {},
    body,
    useWpAjax = false,
  } = options;

  const baseUrl = useWpAjax ? WP_AJAX_URL : API_BASE_URL;
  const url = useWpAjax ? baseUrl : `${baseUrl}${endpoint}`;

  const authToken = await getAuthToken();

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // Only set auth token if not already provided in headers
  if (!requestHeaders['Authorization'] && authToken && !useWpAjax) {
    requestHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
      credentials: 'include', // Include cookies for session-based auth
    };

    if (body && method !== 'GET') {
      if (useWpAjax) {
        // WordPress AJAX expects form data
        fetchOptions.headers = { ...requestHeaders };
        delete (fetchOptions.headers as Record<string, string>)['Content-Type'];
        const formData = new FormData();
        Object.entries(body).forEach(([key, value]) => {
          formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        });
        fetchOptions.body = formData;
      } else {
        fetchOptions.body = JSON.stringify(body);
      }
    }

    const response = await fetch(url, fetchOptions);
    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      // If session expired, trigger logout and redirect to login
      if (response.status === 401 && responseData.code === 'SESSION_EXPIRED') {
        console.log('Session expired - signing out and redirecting to login');
        await supabase.auth.signOut();
        window.location.href = '/login?expired=true';
        return { success: false, error: 'Session expired. Redirecting to login...' };
      }
      return {
        success: false,
        error: responseData.error || responseData.message || `HTTP Error: ${response.status}`,
      };
    }

    // Handle backend response format: { success, data, error, message, requiresVerification }
    if (responseData.success !== undefined) {
      return {
        success: responseData.success,
        data: responseData.data || responseData.user,
        error: responseData.error,
        message: responseData.message,
        requiresVerification: responseData.requiresVerification,
      };
    }

    // Fallback for non-standard responses
    return {
      success: true,
      data: responseData,
    };
  } catch (error) {
    console.error('API Request Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * WordPress AJAX request helper
 * Maps to the gpx_ajax_request handler from the WordPress backend
 */
export async function wpAjaxRequest<T = any>(
  type: string,
  content?: any
): Promise<ApiResponse<T>> {
  return apiRequest<T>('', {
    method: 'POST',
    useWpAjax: true,
    body: {
      action: 'gpx_ajax_request',
      type,
      content: typeof content === 'object' ? JSON.stringify(content) : content,
    },
  });
}

// Export individual HTTP methods for convenience
export const api = {
  get: <T = any>(endpoint: string, headers?: Record<string, string>) =>
    apiRequest<T>(endpoint, { method: 'GET', headers }),

  post: <T = any>(endpoint: string, body?: any, headers?: Record<string, string>) =>
    apiRequest<T>(endpoint, { method: 'POST', body, headers }),

  put: <T = any>(endpoint: string, body?: any, headers?: Record<string, string>) =>
    apiRequest<T>(endpoint, { method: 'PUT', body, headers }),

  patch: <T = any>(endpoint: string, body?: any, headers?: Record<string, string>) =>
    apiRequest<T>(endpoint, { method: 'PATCH', body, headers }),

  delete: <T = any>(endpoint: string, headers?: Record<string, string>) =>
    apiRequest<T>(endpoint, { method: 'DELETE', headers }),
};

export default api;
