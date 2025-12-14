import { supabaseAdmin } from '../lib/supabase.js';
import { handleCors } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET') {
    // Handle email verification callback from Supabase
    const { token_hash, type } = req.query;

    if (!token_hash || type !== 'email') {
      return res.status(400).json({ success: false, error: 'Invalid verification link' });
    }

    try {
      const { data, error } = await supabaseAdmin.auth.verifyOtp({
        token_hash,
        type: 'email'
      });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      // Redirect to frontend with success
      return res.redirect(302, 'https://geauxplans.com/my-account?verified=true');
    } catch (error) {
      console.error('Email verification error:', error);
      return res.status(500).json({ success: false, error: 'Verification failed' });
    }
  }

  if (req.method === 'POST') {
    // Resend verification email
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    try {
      const { error } = await supabaseAdmin.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: 'https://geauxplans.com/verify-email'
        }
      });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      res.json({
        success: true,
        message: 'Verification email sent! Please check your inbox.'
      });
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ success: false, error: 'Failed to resend verification email' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
