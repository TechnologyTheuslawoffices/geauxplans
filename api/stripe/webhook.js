import Stripe from 'stripe';
import { supabaseAdmin } from '../lib/supabase.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const config = {
  api: {
    bodyParser: false, // Disable body parsing, need raw body for webhook verification
  },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    if (webhookSecret) {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      // For development without webhook secret
      event = JSON.parse(rawBody.toString());
      console.warn('WARNING: Webhook signature verification disabled');
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  console.log('Stripe webhook received:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutComplete(session);
        break;
      }

      case 'payment_intent.succeeded': {
        console.log('Payment succeeded:', event.data.object.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        console.log('Payment failed:', event.data.object.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

async function handleCheckoutComplete(session) {
  console.log('Processing checkout completion:', session.id);

  const { userId, productId, formType } = session.metadata || {};

  if (!userId || !productId) {
    console.error('Missing metadata in checkout session:', session.id);
    return;
  }

  try {
    // Record the purchase
    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from('purchases')
      .insert({
        user_id: userId,
        product_id: parseInt(productId),
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent,
        amount: session.amount_total / 100, // Convert from cents
        currency: session.currency,
        status: 'completed',
        customer_email: session.customer_email,
        form_type: formType,
      })
      .select()
      .single();

    if (purchaseError) {
      console.error('Failed to record purchase:', purchaseError);
      // Don't throw - still try to create submission
    } else {
      console.log('Purchase recorded:', purchase?.id);
    }

    // Check if user already has a submission for this form type
    const { data: existingSubmission } = await supabaseAdmin
      .from('poa_submissions')
      .select('id')
      .eq('user_id', userId)
      .eq('form_type', formType)
      .single();

    if (existingSubmission) {
      console.log('User already has submission for form type:', formType);
      // Update the submission to mark as paid
      await supabaseAdmin
        .from('poa_submissions')
        .update({
          paid: true,
          stripe_session_id: session.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSubmission.id);
    } else {
      // Create a new submission for the user
      const { data: newSubmission, error: submissionError } = await supabaseAdmin
        .from('poa_submissions')
        .insert({
          user_id: userId,
          form_type: formType,
          submission_status: 'inprogress',
          form_data: {},
          paid: true,
          stripe_session_id: session.id,
        })
        .select()
        .single();

      if (submissionError) {
        console.error('Failed to create submission:', submissionError);
      } else {
        console.log('Submission created:', newSubmission?.id);
      }
    }

    console.log('Checkout processing complete for user:', userId);
  } catch (error) {
    console.error('Error processing checkout:', error);
    throw error;
  }
}
