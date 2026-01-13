import { handleCors } from '../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Return empty cart - cart is managed client-side
  if (req.method === 'GET') {
    return res.json({
      success: true,
      data: {
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        coupon: null
      }
    });
  }

  if (req.method === 'DELETE') {
    return res.json({
      success: true,
      data: {
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        coupon: null
      }
    });
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
