import { supabaseAdmin } from '../lib/supabase.js';
import { handleCors, verifyAuth } from '../lib/auth.js';

// Stripe Price IDs mapped to product IDs
const STRIPE_PRICES = {
  '606': 'price_1SpvwaHQjfjZ1dW7FrJg2qyG',  // Minor Child-Centered Estate Plan $199
  '614': 'price_1SpvvgHQjfjZ1dW79YusgiZ0',  // Power of Attorney Supplement $99
  '673': 'price_1Spvw4HQjfjZ1dW77WCMvu4X',  // Will-Based Estate Plan $199
  '676': 'price_1SpvwvHQjfjZ1dW7bH18jVZX',  // Trust-Based Estate Plan $399
  '677': 'price_1SpvxIHQjfjZ1dW7aplHc87e',  // Trust-Based Estate Plan 2 Person $599
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ success: false, error: 'Stripe not configured' });
  }

  // Verify authentication
  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ success: false, error: authError || 'Authentication required' });
  }

  const { productId, formType } = req.body;

  if (!productId) {
    return res.status(400).json({ success: false, error: 'Product ID is required' });
  }

  try {
    // Get product from database
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Get Stripe Price ID
    const priceId = STRIPE_PRICES[productId.toString()];
    if (!priceId) {
      return res.status(400).json({ success: false, error: 'Invalid product' });
    }

    // Create Stripe Checkout Session using REST API directly
    const frontendUrl = 'https://geauxplans.com';
    const successUrl = `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/checkout?cancelled=true`;

    console.log('Creating checkout with:', { priceId, email: user.email, successUrl, cancelUrl });

    // Use URLSearchParams like the working test endpoint - it properly encodes URLs
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'payment_method_types[0]': 'card',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'mode': 'payment',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'customer_email': user.email,
        'metadata[userId]': user.id,
        'metadata[productId]': product.id.toString(),
        'metadata[formType]': formType || product.form_type || '',
      }),
    });

    const session = await response.json();
    console.log('Stripe response:', JSON.stringify(session, null, 2));

    if (!response.ok) {
      console.error('Stripe API error:', session);
      return res.status(500).json({ success: false, error: session.error?.message || 'Stripe error' });
    }

    if (!session.url) {
      console.error('No URL in session:', session);
      return res.status(500).json({ success: false, error: 'Stripe did not return checkout URL' });
    }

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
}
