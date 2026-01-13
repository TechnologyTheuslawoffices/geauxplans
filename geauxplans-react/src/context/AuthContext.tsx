/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the app using Supabase.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, AuthCredentials, RegisterData } from '../types';
import type { Session, AuthError } from '@supabase/supabase-js';

interface RegisterResult {
  success: boolean;
  requiresVerification?: boolean;
  email?: string;
  message?: string;
  error?: string;
}

interface LoginResult {
  success: boolean;
  requiresVerification?: boolean;
  email?: string;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
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

/**
 * Convert Supabase user to our User type
 */
function mapSupabaseUser(supabaseUser: any): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    firstName: supabaseUser.user_metadata?.first_name || '',
    lastName: supabaseUser.user_metadata?.last_name || '',
    displayName: supabaseUser.user_metadata?.first_name
      ? `${supabaseUser.user_metadata.first_name} ${supabaseUser.user_metadata.last_name || ''}`
      : supabaseUser.email?.split('@')[0] || '',
    role: supabaseUser.user_metadata?.role || 'customer',
    createdAt: supabaseUser.created_at || new Date().toISOString(),
  };
}

/**
 * Get user-friendly error message from Supabase auth error
 */
function getErrorMessage(error: AuthError): string {
  const errorMessages: Record<string, string> = {
    'Invalid login credentials': 'Invalid email or password',
    'Email not confirmed': 'Please verify your email address before logging in',
    'User already registered': 'An account with this email already exists',
    'Password should be at least 6 characters': 'Password must be at least 8 characters long',
    'Signup requires a valid password': 'Please enter a valid password',
    'Unable to validate email address: invalid format': 'Please enter a valid email address',
  };

  return errorMessages[error.message] || error.message || 'An error occurred';
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!user && !!session;

  // Check for existing session on mount and listen for auth changes
  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();

        if (initialSession?.user) {
          setSession(initialSession);
          setUser(mapSupabaseUser(initialSession.user));
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (currentSession?.user) {
          setSession(currentSession);
          setUser(mapSupabaseUser(currentSession.user));
        } else {
          setSession(null);
          setUser(null);
        }
        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (credentials: AuthCredentials): Promise<LoginResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (authError) {
        const errorMsg = getErrorMessage(authError);

        // Check if email verification is required
        if (authError.message?.includes('Email not confirmed')) {
          setError('Please verify your email address.');
          setIsLoading(false);
          return {
            success: false,
            requiresVerification: true,
            email: credentials.email,
            error: 'Please verify your email address.',
          };
        }

        setError(errorMsg);
        setIsLoading(false);
        return { success: false, error: errorMsg };
      }

      if (data.user && data.session) {
        setSession(data.session);
        setUser(mapSupabaseUser(data.user));
        setIsLoading(false);
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, error: 'Login failed' };
    } catch (err) {
      const errorMsg = 'An unexpected error occurred';
      setError(errorMsg);
      setIsLoading(false);
      return { success: false, error: errorMsg };
    }
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<RegisterResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            first_name: data.firstName || '',
            last_name: data.lastName || '',
            role: 'customer',
          },
          emailRedirectTo: `${window.location.origin}/verify-email`,
        },
      });

      console.log('[AuthContext] signUp response:', {
        hasUser: !!authData.user,
        hasSession: !!authData.session,
        userId: authData.user?.id,
        userEmail: authData.user?.email,
        emailConfirmedAt: authData.user?.email_confirmed_at,
        confirmationSentAt: authData.user?.confirmation_sent_at,
        identities: authData.user?.identities?.length,
        error: authError,
      });

      if (authError) {
        const errorMsg = getErrorMessage(authError);
        setError(errorMsg);
        setIsLoading(false);
        return { success: false, error: errorMsg, message: `Supabase error: ${authError.message}` };
      }

      // Check if user already exists (identities array is empty)
      if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
        setIsLoading(false);
        return {
          success: false,
          error: 'An account with this email already exists.',
          message: 'User exists but identities empty - email already registered',
        };
      }

      // Check if email confirmation is required
      if (authData.user && !authData.session) {
        // User created but needs email verification
        setIsLoading(false);
        const confirmationSent = authData.user.confirmation_sent_at;
        return {
          success: true,
          requiresVerification: true,
          email: data.email,
          message: confirmationSent
            ? `Verification email sent at ${confirmationSent}`
            : 'User created but confirmation_sent_at is null - email may not have been sent',
        };
      }

      // User is signed in directly (email confirmation disabled in Supabase)
      if (authData.user && authData.session) {
        setSession(authData.session);
        setUser(mapSupabaseUser(authData.user));
        setIsLoading(false);
        return {
          success: true,
          message: 'User signed in directly - email confirmation is DISABLED in Supabase',
        };
      }

      setIsLoading(false);
      return { success: false, error: 'Registration failed', message: 'No user or session returned' };
    } catch (err) {
      const errorMsg = 'An unexpected error occurred. Please try again.';
      console.error('[AuthContext] signUp exception:', err);
      setError(errorMsg);
      setIsLoading(false);
      return { success: false, error: errorMsg, message: String(err) };
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setSession(null);
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.user) {
        setSession(currentSession);
        setUser(mapSupabaseUser(currentSession.user));
      }
    } catch (err) {
      console.error('Error refreshing user:', err);
    }
  }, []);

  const value: AuthContextType = {
    user,
    session,
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
