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
    // Sign in with Supabase Auth
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      // Check if it's an unverified email error
      if (error.message.includes('Email not confirmed')) {
        return res.status(401).json({
          success: false,
          error: 'Please verify your email address before logging in.',
          requiresVerification: true,
          email: email
        });
      }
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
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
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
}
