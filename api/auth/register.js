import { supabaseAdmin } from '../lib/supabase.js';
import { handleCors } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { email, password, firstName, lastName, first_name, last_name } = req.body;
  // Support both camelCase and snake_case
  const userFirstName = firstName || first_name || '';
  const userLastName = lastName || last_name || '';

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
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

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Check if user already exists (Supabase returns user with identities: [] for existing users)
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'A user with this email address has already been registered'
      });
    }

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
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
}
