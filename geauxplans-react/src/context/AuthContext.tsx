/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the app.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import authService from '../services/authService';
import { removeAuthToken } from '../services/api';
import type { User, AuthCredentials, RegisterData } from '../types';

interface RegisterResult {
  success: boolean;
  requiresVerification?: boolean;
  email?: string;
  message?: string;
}

interface LoginResult {
  success: boolean;
  requiresVerification?: boolean;
  email?: string;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: AuthCredentials) => Promise<LoginResult>;
  register: (data: RegisterData) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!user;

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (authService.isAuthenticated()) {
        try {
          const response = await authService.getCurrentUser();
          if (response.success && response.data) {
            setUser(response.data);
          } else {
            // Token invalid, clear it
            removeAuthToken();
          }
        } catch {
          removeAuthToken();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = useCallback(async (credentials: AuthCredentials): Promise<LoginResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.login(credentials);

      if (response.success && response.data) {
        setUser(response.data.user);
        setIsLoading(false);
        return { success: true };
      } else {
        // Check if verification is required
        const requiresVerification = (response as any).requiresVerification;
        const errorMsg = response.error || 'Login failed';
        if (requiresVerification) {
          setError('Please verify your email address.');
          setIsLoading(false);
          return {
            success: false,
            requiresVerification: true,
            email: credentials.email,
            error: 'Please verify your email address.'
          };
        }
        setError(errorMsg);
        setIsLoading(false);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
      return { success: false };
    }
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<RegisterResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.register(data);

      if (response.success) {
        // Check if verification is required (new flow)
        const requiresVerification = (response as any).requiresVerification || (response.data as any)?.requiresVerification;
        if (requiresVerification) {
          setIsLoading(false);
          return {
            success: true,
            requiresVerification: true,
            email: data.email,
            message: (response as any).message || 'Please check your email to verify your account.'
          };
        }
        // Old flow - user is logged in directly
        if (response.data?.user) {
          setUser(response.data.user);
        }
        setIsLoading(false);
        return { success: true };
      } else {
        setError(response.error || 'Registration failed');
        setIsLoading(false);
        return { success: false };
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
      return { success: false };
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await authService.logout();
    } finally {
      setUser(null);
      removeAuthToken();
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    if (authService.isAuthenticated()) {
      const response = await authService.getCurrentUser();
      if (response.success && response.data) {
        setUser(response.data);
      }
    }
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
