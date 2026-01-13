import { handleCors } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Cart is managed client-side, just acknowledge the add
  const { productId, quantity = 1 } = req.body || {};

  return res.json({
    success: true,
    data: {
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      coupon: null
    },
    message: 'Item added to cart'
  });
}
