import { supabaseAdmin } from './supabase.js';

/**
 * Verify JWT token and get user
 */
export async function verifyAuth(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No authorization token provided' };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Verify the JWT and get user
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return { user: null, error: error?.message || 'Invalid token' };
    }

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return {
      user: {
        id: user.id,
        email: user.email,
        ...profile
      },
      token,
      error: null
    };
  } catch (error) {
    return { user: null, error: error.message };
  }
}

/**
 * Middleware-style auth check for API routes
 */
export async function requireAuth(req, res) {
  const { user, error } = await verifyAuth(req);

  if (!user) {
    res.status(401).json({ success: false, error: error || 'Unauthorized' });
    return null;
  }

  return user;
}

/**
 * CORS handler for preflight requests
 */
export function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
