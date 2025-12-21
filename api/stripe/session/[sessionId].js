import Stripe from 'stripe';
import { handleCors, verifyAuth } from '../../lib/auth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Verify authentication
  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Session ID is required' });
  }

  try {
    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'payment_intent'],
    });

    // Verify this session belongs to the authenticated user
    if (session.metadata?.userId !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_email,
        amountTotal: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
        lineItems: session.line_items?.data || [],
      },
    });
  } catch (error) {
    console.error('Stripe session retrieval error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve session'
    });
  }
}
