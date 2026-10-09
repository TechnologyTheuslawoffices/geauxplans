export default async function handler(req, res) {
  const key = process.env.STRIPE_SECRET_KEY;
  const frontendUrl = 'https://geauxplans.com';
  const priceId = 'price_1SpvwvHQjfjZ1dW7bH18jVZX'; // Trust-Based $399

  try {
    // Test checkout session creation
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'payment_method_types[0]': 'card',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'mode': 'payment',
        'success_url': `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': `${frontendUrl}/checkout?cancelled=true`,
        'customer_email': 'test@example.com',
      }),
    });

    const data = await response.json();

    res.json({
      status: response.status,
      ok: response.ok,
      hasUrl: !!data.url,
      url: data.url,
      error: data.error,
      id: data.id
    });
  } catch (error) {
    res.json({ error: error.message });
  }
}
