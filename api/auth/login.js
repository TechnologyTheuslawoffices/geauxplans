import { supabaseAdmin } from '../lib/supabase.js';
import { handleCors } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    // First check if user exists and their verification status
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser && !existingUser.email_confirmed_at) {
      // User exists but email not verified
      return res.status(401).json({
        success: false,
        error: 'Please verify your email address before logging in. Check your inbox for a verification link.',
        requiresVerification: true,
        email: email
      });
    }

    // Sign in with Supabase Auth
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.log('Supabase login error:', error.message);
      // Check if it's an unverified email error
      if (error.message.includes('Email not confirmed') || error.message.includes('not confirmed')) {
        return res.status(401).json({
          success: false,
          error: 'Please verify your email address before logging in.',
          requiresVerification: true,
          email: email
        });
      }
      // Return actual error for debugging
      return res.status(401).json({ success: false, error: error.message || 'Invalid email or password' });
    }

    // Check if email is verified
    if (!data.user.email_confirmed_at) {
      return res.status(401).json({
        success: false,
        error: 'Please verify your email address before logging in.',
        requiresVerification: true,
        email: email
      });
    }

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      success: true,
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
          firstName: profile?.first_name || '',
          lastName: profile?.last_name || '',
          displayName: profile?.display_name || email.split('@')[0],
          role: profile?.role || 'customer'
        },
        token: data.session.access_token,
        refreshToken: data.session.refresh_token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
}
