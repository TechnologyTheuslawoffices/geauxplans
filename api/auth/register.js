import { supabaseAdmin } from '../lib/supabase.js';
import { handleCors } from '../lib/auth.js';

export default async function handler(req, res) {
  // Log incoming request for debugging
  console.log('[REGISTER] Incoming request:', {
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'],
      origin: req.headers.origin,
      host: req.headers.host,
    },
    bodyType: typeof req.body,
    hasBody: !!req.body,
  });

  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    console.log('[REGISTER] Method not allowed:', req.method);
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      debug: { method: req.method, expected: 'POST' }
    });
  }

  // Log the body for debugging
  console.log('[REGISTER] Request body:', {
    hasEmail: !!req.body?.email,
    hasPassword: !!req.body?.password,
    hasFirstName: !!(req.body?.firstName || req.body?.first_name),
    hasLastName: !!(req.body?.lastName || req.body?.last_name),
    bodyKeys: req.body ? Object.keys(req.body) : [],
  });

  const { email, password, firstName, lastName, first_name, last_name } = req.body || {};
  // Support both camelCase and snake_case
  const userFirstName = firstName || first_name || '';
  const userLastName = lastName || last_name || '';

  if (!email || !password) {
    console.log('[REGISTER] Missing required fields:', { hasEmail: !!email, hasPassword: !!password });
    return res.status(400).json({
      success: false,
      error: 'Email and password are required',
      debug: {
        receivedFields: req.body ? Object.keys(req.body) : [],
        hasEmail: !!email,
        hasPassword: !!password,
      }
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.log('[REGISTER] Invalid email format:', email);
    return res.status(400).json({
      success: false,
      error: 'Invalid email format',
      debug: { email }
    });
  }

  // Validate password length
  if (password.length < 6) {
    console.log('[REGISTER] Password too short:', password.length);
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters long',
      debug: { passwordLength: password.length }
    });
  }

  try {
    console.log('[REGISTER] Attempting Supabase signUp for:', email);

    // Check if Supabase is configured
    if (!supabaseAdmin) {
      console.error('[REGISTER] Supabase admin client not initialized');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
        debug: { issue: 'Supabase client not initialized' }
      });
    }

    // Use signUp to automatically send verification email
    const { data, error } = await supabaseAdmin.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: userFirstName,
          last_name: userLastName
        },
        emailRedirectTo: 'https://geauxplans.com/verify-email'
      }
    });

    console.log('[REGISTER] Supabase signUp response:', {
      hasData: !!data,
      hasUser: !!data?.user,
      userId: data?.user?.id,
      hasError: !!error,
      errorMessage: error?.message,
      errorCode: error?.code,
      identitiesCount: data?.user?.identities?.length,
    });

    if (error) {
      console.error('[REGISTER] Supabase error:', error);
      return res.status(400).json({
        success: false,
        error: error.message,
        debug: {
          supabaseError: error.message,
          errorCode: error.code,
          errorStatus: error.status,
        }
      });
    }

    // Check if user already exists (Supabase returns user with identities: [] for existing users)
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      console.log('[REGISTER] User already exists:', email);
      return res.status(400).json({
        success: false,
        error: 'A user with this email address has already been registered',
        debug: { existingUser: true, email }
      });
    }

    console.log('[REGISTER] Registration successful for:', email);

    // Return success - user needs to verify email
    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email to verify your account.',
      requiresVerification: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        firstName: userFirstName,
        lastName: userLastName,
        emailVerified: false
      }
    });
  } catch (error) {
    console.error('[REGISTER] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      debug: {
        errorType: error?.constructor?.name,
        errorMessage: error?.message,
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      }
    });
  }
}
