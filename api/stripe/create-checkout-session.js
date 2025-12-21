import Stripe from 'stripe';
import { supabaseAdmin } from '../lib/supabase.js';
import { handleCors, verifyAuth } from '../lib/auth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Verify authentication
  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
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

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.name,
              description: product.short_description || product.description,
            },
            unit_amount: Math.round(product.price * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'https://geauxplans.com'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://geauxplans.com'}/checkout?productId=${productId}&formType=${formType || product.form_type}`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        productId: product.id.toString(),
        formType: formType || product.form_type,
      },
    });

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
