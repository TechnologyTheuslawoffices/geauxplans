/**
 * Cart & Checkout Service
 *
 * Handles shopping cart and checkout operations including:
 * - Cart management (add, remove, update items) — localStorage-backed
 * - Checkout process
 * - Payment processing
 *
 * NOTE: The backend `/api/cart/*` routes are not mounted on Vercel.
 * Cart state is therefore persisted client-side via localStorage,
 * matching the WordPress session-bound behavior.
 */

import api, { wpAjaxRequest } from './api';
import type {
  Cart,
  CartItem,
  Order,
  Address,
  ApiResponse,
  AppliedCoupon,
  CouponValidationResponse,
  AppliedReferral,
  ReferralValidationResponse,
} from '../types';

// ---------------------------------------------------------------------------
// Product catalog (front-end source of truth — must match backend stripe.js)
// ---------------------------------------------------------------------------

interface ProductDef {
  id: number;
  name: string;
  price: number;        // solo price (USD)
  price2person: number; // 2-person price (USD)
  type?: 'one_time' | 'subscription';
  description?: string;
}

const PRODUCTS: Record<number, ProductDef> = {
  606: {
    id: 606,
    name: 'Minor Child-Centered Estate Plan',
    price: 199,
    price2person: 299,
    type: 'one_time',
    description: 'Create a will-based plan to appoint a Tutor for minor children.',
  },
  614: {
    id: 614,
    name: 'Power of Attorney Supplement',
    price: 99,
    price2person: 149,
    type: 'one_time',
    description: 'Financial and Healthcare Power of Attorney documents.',
  },
  673: {
    id: 673,
    name: 'Will-Based Estate Plan',
    price: 199,
    price2person: 299,
    type: 'one_time',
    description: 'Control your legacy with a comprehensive will-based estate plan.',
  },
  676: {
    id: 676,
    name: 'Trust-Based Estate Plan',
    price: 399,
    price2person: 599,
    type: 'one_time',
    description: 'Avoid probate and transfer assets smoothly with a trust.',
  },
  1367: {
    id: 1367,
    name: 'Legal Edge Plan',
    price: 9.99,
    price2person: 9.99,
    type: 'subscription',
    description: 'Forever revisions and Advanced Estate Plan upgrade credit. Cancel anytime.',
  },
};

const STORAGE_KEY = 'gpx_cart';

const emptyCart: Cart = {
  items: [],
  subtotal: 0,
  tax: 0,
  total: 0,
  itemCount: 0,
};

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadCart(): Cart {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return { ...emptyCart, items: [] };
    const parsed = JSON.parse(raw) as Cart;
    if (!parsed || !Array.isArray(parsed.items)) return { ...emptyCart, items: [] };
    return recalc(parsed.items, parsed.coupon, parsed.referral);
  } catch {
    return { ...emptyCart, items: [] };
  }
}

function saveCart(cart: Cart): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    }
  } catch {
    // ignore storage failures
  }
}

/**
 * Recompute the cart totals, re-deriving any coupon discount from the current
 * subtotal.
 *
 * The discount is recalculated rather than carried forward because the cart can
 * change after a code is applied — a percentage is worth more once another plan
 * is added, and a $50 fixed discount has to shrink if the customer removes
 * items until the cart is worth less than that. Only the coupon's *terms*
 * (type and amount, as returned by the backend) are remembered.
 *
 * This figure is for display. The backend validates the code again and computes
 * its own discount when it creates the Stripe session, so a tampered
 * localStorage cart changes the number on screen and nothing that is charged.
 */
function recalc(items: CartItem[], coupon?: AppliedCoupon, referral?: AppliedReferral): Cart {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tax = 0;
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  if (items.length === 0 || (!coupon && !referral)) {
    return { items, subtotal, tax, total: subtotal + tax, itemCount };
  }

  const subtotalCents = Math.round(subtotal * 100);

  // A referral and a coupon are mutually exclusive; if somehow both are set the
  // referral wins (it also earns the referring member a commission). The
  // backend enforces the same precedence when it prices the Stripe session.
  if (referral) {
    const rawCents = Math.round((subtotalCents * referral.refereeDiscountPercent) / 100);
    const discountCents = Math.min(rawCents, subtotalCents);
    const discount = discountCents / 100;
    return {
      items,
      subtotal,
      tax,
      total: Math.max(0, subtotal - discount) + tax,
      itemCount,
      referral,
      discount,
    };
  }

  const rawCents =
    coupon!.discountType === 'percent'
      ? Math.round((subtotalCents * coupon!.amount) / 100)
      : Math.round(coupon!.amount * 100);
  const discountCents = Math.min(rawCents, subtotalCents);
  const discount = discountCents / 100;

  return {
    items,
    subtotal,
    tax,
    total: Math.max(0, subtotal - discount) + tax,
    itemCount,
    coupon: { ...coupon!, discountCents },
    discount,
  };
}

// Module-level cache, initialized once
let _cart: Cart = loadCart();

// ---------------------------------------------------------------------------
// Server sync
//
// While a user is logged in, the cart is mirrored to a per-account `carts` row
// (/api/cart) so it follows them across devices. The switch is off by default:
// guests, and the first paint before auth resolves, use localStorage only.
// CartContext flips it on after login (and off on logout). Every server call is
// best-effort — a failure (offline, table not migrated yet, 401) is swallowed
// and the localStorage copy remains the working cart.
// ---------------------------------------------------------------------------

let _serverSync = false;

export function setServerSyncEnabled(enabled: boolean): void {
  _serverSync = enabled;
}

function pushServerCart(cart: Cart): void {
  if (!_serverSync) return;
  // Fire-and-forget; never block a cart mutation on the network.
  void api
    .put('/cart', { items: cart.items, coupon: cart.coupon ?? null })
    .catch(() => {
      /* non-fatal: localStorage stays authoritative */
    });
}

function setCart(cart: Cart, pushServer: boolean = true): Cart {
  _cart = cart;
  saveCart(cart);
  if (pushServer) pushServerCart(cart);
  return cart;
}

/**
 * Pull the account cart from the server and make it the local cart, without
 * echoing it straight back up. Used once right after login/merge.
 */
export async function loadServerCart(): Promise<Cart> {
  try {
    const response = await api.get<{ items: CartItem[]; coupon?: AppliedCoupon | null }>('/cart');
    if (response.success && response.data) {
      return setCart(recalc(response.data.items || [], response.data.coupon || undefined), false);
    }
  } catch {
    /* non-fatal */
  }
  return _cart;
}

/**
 * On login, reconcile the guest localStorage cart into the account cart and
 * adopt the merged result. Union-by-id on the server keeps this idempotent, so
 * it is safe if the login effect re-runs.
 */
export async function mergeServerCart(): Promise<Cart> {
  try {
    const response = await api.post<{ items: CartItem[]; coupon?: AppliedCoupon | null }>(
      '/cart/merge',
      { items: _cart.items, coupon: _cart.coupon ?? null }
    );
    if (response.success && response.data) {
      return setCart(recalc(response.data.items || [], response.data.coupon || undefined), false);
    }
  } catch {
    /* non-fatal */
  }
  return _cart;
}

/**
 * Empty the local cart without touching the server. Used on logout so the next
 * user does not inherit the previous account's cart from this browser.
 */
export function resetLocalCart(): Cart {
  return setCart(recalc([]), false);
}

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get current cart
 */
export async function getCart(): Promise<ApiResponse<Cart>> {
  return ok(_cart);
}

/**
 * Add item to cart
 *
 * `variationId` is repurposed to encode form type: 1 = solo, 2 = 2-person.
 */
export async function addToCart(
  productId: number,
  quantity: number = 1,
  variationId?: number
): Promise<ApiResponse<Cart>> {
  const product = PRODUCTS[productId];
  if (!product) {
    return { success: false, error: `Unknown product: ${productId}` };
  }

  const variation = variationId === 2 ? 2 : 1;
  const price = variation === 2 ? product.price2person : product.price;
  const itemId = `p${productId}-v${variation}`;

  const items = [..._cart.items];
  const existingIndex = items.findIndex(i => i.id === itemId);

  if (existingIndex >= 0) {
    items[existingIndex] = {
      ...items[existingIndex],
      quantity: items[existingIndex].quantity + quantity,
    };
  } else {
    const newItem: CartItem = {
      id: itemId,
      productId,
      variationId: variation,
      name: product.name,
      price,
      quantity,
      type: product.type,
      metadata: {
        formType: variation === 2 ? '2person' : 'solo',
      },
    };
    items.push(newItem);
  }

  return ok(setCart(recalc(items, _cart.coupon, _cart.referral)));
}

/**
 * Add an item that is not in the PRODUCTS catalog.
 *
 * The LLC wizard prices its packages itself (formation tier + state filing fee +
 * registered agent + operating agreement), so those lines carry an explicit
 * price rather than a product ID. They still have to go through here: the cart
 * context used to keep custom items in React state only, so reloading the
 * checkout page dropped them and bounced the customer back to the shop with an
 * empty cart, mid-purchase.
 *
 * Synchronous, unlike its catalog sibling, so the wizard can add several lines
 * in a row and have each one see the previous one.
 */
export function addCustomItem(item: {
  id: string;
  name: string;
  price: number;
  quantity: number;
  type?: string;
  metadata?: Record<string, unknown>;
}): Cart {
  const items = [..._cart.items];
  const existingIndex = items.findIndex(i => i.id === item.id);

  if (existingIndex >= 0) {
    items[existingIndex] = {
      ...items[existingIndex],
      quantity: items[existingIndex].quantity + item.quantity,
    };
  } else {
    items.push({
      id: item.id,
      productId: 0,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      type: item.type,
      metadata: item.metadata,
    });
  }

  return setCart(recalc(items, _cart.coupon, _cart.referral));
}

/**
 * Update cart item quantity
 */
export async function updateCartItem(
  itemId: string,
  quantity: number
): Promise<ApiResponse<Cart>> {
  const items = _cart.items
    .map(i => (i.id === itemId ? { ...i, quantity } : i))
    .filter(i => i.quantity > 0);
  return ok(setCart(recalc(items, _cart.coupon, _cart.referral)));
}

/**
 * Remove item from cart
 */
export async function removeFromCart(itemId: string): Promise<ApiResponse<Cart>> {
  const items = _cart.items.filter(i => i.id !== itemId);
  return ok(setCart(recalc(items, _cart.coupon, _cart.referral)));
}

/**
 * Clear entire cart
 */
export async function clearCart(): Promise<ApiResponse<Cart>> {
  return ok(setCart(recalc([])));
}

/**
 * Apply a coupon code.
 *
 * This used to return success for any string, so the cart accepted "asdf" as
 * readily as a real code — and then charged full price, because nothing
 * downstream ever looked at it. The code is now checked against the backend,
 * which owns the coupon table and decides what a code is worth.
 *
 * A rejected code leaves the cart untouched.
 */
export async function applyCoupon(code: string): Promise<ApiResponse<Cart>> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { success: false, error: 'Enter a coupon code.' };
  }
  if (_cart.items.length === 0) {
    return { success: false, error: 'Add something to your cart first.' };
  }

  const subtotalCents = Math.round(_cart.subtotal * 100);
  const response = await api.post<CouponValidationResponse>('/coupons/validate', {
    code: trimmed,
    subtotalCents,
  });

  if (!response.success || !response.data) {
    return { success: false, error: response.error || 'Could not check that coupon. Try again.' };
  }

  const result = response.data;
  if (!result.valid) {
    return { success: false, error: result.message };
  }

  const applied: AppliedCoupon = {
    code: result.code || trimmed.toLowerCase(),
    discountType: result.discountType || 'fixed_cart',
    amount: result.amount || 0,
    discountCents: result.discountCents,
  };

  return ok(setCart(recalc(_cart.items, applied)));
}

/**
 * Remove the applied coupon.
 */
export async function removeCoupon(): Promise<ApiResponse<Cart>> {
  return ok(setCart(recalc(_cart.items, undefined)));
}

/**
 * Apply a GeauxCounsel referral code.
 *
 * Validated against the backend (which owns the referral_codes table). On
 * success the referee sees the discount; the backend re-validates it and records
 * the referring member's commission when the Stripe session completes. A
 * referral and a coupon are mutually exclusive, so applying one clears the
 * other. Display-only, like the coupon — the charge is decided server-side.
 */
export async function applyReferral(code: string): Promise<ApiResponse<Cart>> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { success: false, error: 'Enter a referral code.' };
  }
  if (_cart.items.length === 0) {
    return { success: false, error: 'Add something to your cart first.' };
  }

  const subtotalCents = Math.round(_cart.subtotal * 100);
  const response = await api.post<ReferralValidationResponse>('/referrals/validate', {
    code: trimmed,
    subtotalCents,
  });

  if (!response.success || !response.data) {
    return { success: false, error: response.error || 'Could not check that referral code. Try again.' };
  }

  const result = response.data;
  if (!result.valid) {
    return { success: false, error: result.message };
  }

  const applied: AppliedReferral = {
    code: result.code || trimmed.toLowerCase(),
    refereeDiscountPercent: result.refereeDiscountPercent || 0,
    commissionPercent: result.commissionPercent || 0,
  };

  // recalc with no coupon clears any applied coupon (mutually exclusive).
  return ok(setCart(recalc(_cart.items, undefined, applied)));
}

/**
 * Remove the applied referral code.
 */
export async function removeReferral(): Promise<ApiResponse<Cart>> {
  return ok(setCart(recalc(_cart.items, undefined, undefined)));
}

/**
 * Calculate cart totals (already recomputed on every mutation)
 */
export async function calculateTotals(): Promise<ApiResponse<Cart>> {
  return ok(_cart);
}

// Checkout types
export interface CheckoutData {
  billingAddress: Address;
  shippingAddress?: Address;
  paymentMethod: string;
  paymentData?: Record<string, any>;
  orderNotes?: string;
  agreeToTerms: boolean;
  legalEdgePlanAgreement?: boolean; // Required for LEP product
}

/**
 * Process checkout
 */
export async function checkout(data: CheckoutData): Promise<ApiResponse<Order>> {
  return api.post<Order>('/checkout', data);
}

/**
 * Validate checkout data before processing
 */
export async function validateCheckout(data: Partial<CheckoutData>): Promise<ApiResponse<{
  valid: boolean;
  errors?: Record<string, string>;
}>> {
  return api.post('/checkout/validate', data);
}

/**
 * Get available payment methods
 */
export async function getPaymentMethods(): Promise<ApiResponse<{
  id: string;
  name: string;
  description: string;
  icon?: string;
}[]>> {
  return api.get('/checkout/payment-methods');
}

/**
 * Get saved payment methods for user
 */
export async function getSavedPaymentMethods(): Promise<ApiResponse<{
  id: string;
  type: string;
  last4: string;
  expiry?: string;
  isDefault: boolean;
}[]>> {
  return api.get('/checkout/saved-payment-methods');
}

/**
 * Start a Stripe Checkout session for the in-interview "add a second person"
 * add-on, charging the exact price delta between the solo and 2-person plans.
 *
 * The backend derives the price and the target 2-person form_type from the
 * submission's stored solo form_type — `productId` is advisory. On success it
 * returns a Stripe URL to redirect to; the success_url returns the client to
 * the interview already upgraded to the 2-person variant.
 */
export async function createSecondPersonSession(
  submissionId: number | string,
  productId: number
): Promise<ApiResponse<{ sessionId: string; url: string }>> {
  return api.post<{ sessionId: string; url: string }>(
    '/stripe/create-second-person-session',
    { submissionId, productId }
  );
}

// WordPress AJAX fallback methods (legacy — unused)
export const wpCart = {
  async purchasePlan(productIds: number[]): Promise<ApiResponse<any>> {
    return wpAjaxRequest('purchaseplan', productIds.join(','));
  },
  async purchaseLegalEdgePlan(): Promise<ApiResponse<any>> {
    return wpAjaxRequest('purchaselep', '');
  },
  async purchaseBusinessPlan(formData: string): Promise<ApiResponse<any>> {
    return wpAjaxRequest('purchasebp', formData);
  },
};

/**
 * Cart utility functions
 */
export const cartUtils = {
  getItemSubtotal(item: CartItem): number {
    return item.price * item.quantity;
  },
  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  },
  isEmpty(cart: Cart): boolean {
    return cart.items.length === 0;
  },
  getTotalItems(cart: Cart): number {
    return cart.items.reduce((total, item) => total + item.quantity, 0);
  },
};

const cartService = {
  getCart,
  addToCart,
  addCustomItem,
  updateCartItem,
  removeFromCart,
  clearCart,
  applyCoupon,
  removeCoupon,
  applyReferral,
  removeReferral,
  calculateTotals,
  setServerSyncEnabled,
  loadServerCart,
  mergeServerCart,
  resetLocalCart,
  createSecondPersonSession,
  checkout,
  validateCheckout,
  getPaymentMethods,
  getSavedPaymentMethods,
  wpCart,
  cartUtils,
};

export default cartService;
