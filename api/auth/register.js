import { supabaseAdmin } from '../lib/supabase.js';
import { handleCors } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { email, password, firstName, lastName, first_name, last_name } = req.body;
  // Support both camelCase and snake_case
  const userFirstName = firstName || first_name;
  const userLastName = lastName || last_name;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    // Create user in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: userFirstName,
        last_name: userLastName
      }
    });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Sign in to get tokens
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      return res.status(400).json({ success: false, error: signInError.message });
    }

    res.status(201).json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: userFirstName,
        lastName: userLastName,
        displayName: userFirstName || email.split('@')[0]
      },
      token: signInData.session.access_token,
      refreshToken: signInData.session.refresh_token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
}
