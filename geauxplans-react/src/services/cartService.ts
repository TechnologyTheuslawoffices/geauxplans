/**
 * Cart & Checkout Service
 *
 * Handles shopping cart and checkout operations including:
 * - Cart management (add, remove, update items)
 * - Checkout process
 * - Payment processing
 */

import api, { wpAjaxRequest } from './api';
import type { Cart, CartItem, Order, Address, ApiResponse } from '../types';

/**
 * Get current cart
 */
export async function getCart(): Promise<ApiResponse<Cart>> {
  return api.get<Cart>('/cart');
}

/**
 * Add item to cart
 */
export async function addToCart(
  productId: number,
  quantity: number = 1,
  variationId?: number
): Promise<ApiResponse<Cart>> {
  return api.post<Cart>('/cart/add', {
    productId,
    quantity,
    variationId,
  });
}

/**
 * Update cart item quantity
 */
export async function updateCartItem(
  itemId: string,
  quantity: number
): Promise<ApiResponse<Cart>> {
  return api.put<Cart>(`/cart/items/${itemId}`, { quantity });
}

/**
 * Remove item from cart
 */
export async function removeFromCart(itemId: string): Promise<ApiResponse<Cart>> {
  return api.delete<Cart>(`/cart/items/${itemId}`);
}

/**
 * Clear entire cart
 */
export async function clearCart(): Promise<ApiResponse<Cart>> {
  return api.delete<Cart>('/cart');
}

/**
 * Apply coupon code
 */
export async function applyCoupon(code: string): Promise<ApiResponse<Cart>> {
  return api.post<Cart>('/cart/coupon', { code });
}

/**
 * Remove coupon
 */
export async function removeCoupon(code: string): Promise<ApiResponse<Cart>> {
  return api.delete<Cart>(`/cart/coupon/${code}`);
}

/**
 * Calculate cart totals
 */
export async function calculateTotals(): Promise<ApiResponse<Cart>> {
  return api.get<Cart>('/cart/totals');
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

// WordPress AJAX fallback methods
export const wpCart = {
  /**
   * Purchase estate plan (purchaseplan type)
   * Clears cart and adds specified products
   */
  async purchasePlan(productIds: number[]): Promise<ApiResponse<any>> {
    return wpAjaxRequest('purchaseplan', productIds.join(','));
  },

  /**
   * Purchase Legal Edge Plan (purchaselep type)
   * Clears cart and adds LEP product (ID: 1367)
   */
  async purchaseLegalEdgePlan(): Promise<ApiResponse<any>> {
    return wpAjaxRequest('purchaselep', '');
  },

  /**
   * Purchase business plan (purchasebp type)
   * Handles LLC formation package purchase
   */
  async purchaseBusinessPlan(formData: string): Promise<ApiResponse<any>> {
    return wpAjaxRequest('purchasebp', formData);
  },
};

/**
 * Cart utility functions
 */
export const cartUtils = {
  /**
   * Calculate item subtotal
   */
  getItemSubtotal(item: CartItem): number {
    return item.price * item.quantity;
  },

  /**
   * Format price for display
   */
  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  },

  /**
   * Check if cart is empty
   */
  isEmpty(cart: Cart): boolean {
    return cart.items.length === 0;
  },

  /**
   * Get total item count
   */
  getTotalItems(cart: Cart): number {
    return cart.items.reduce((total, item) => total + item.quantity, 0);
  },
};

const cartService = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  applyCoupon,
  removeCoupon,
  calculateTotals,
  checkout,
  validateCheckout,
  getPaymentMethods,
  getSavedPaymentMethods,
  wpCart,
  cartUtils,
};

export default cartService;
