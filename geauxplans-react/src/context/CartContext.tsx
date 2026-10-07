/**
 * Cart Context
 *
 * Provides shopping cart state and methods throughout the app.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import cartService from '../services/cartService';
import { useAuth } from './AuthContext';
import type { Cart } from '../types';

interface CustomCartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  type?: string;
  metadata?: Record<string, unknown>;
}

interface CartContextType {
  cart: Cart;
  isLoading: boolean;
  error: string | null;
  addItem: (productId: number, quantity?: number, variationId?: number) => Promise<boolean>;
  addToCart: (item: CustomCartItem) => void;
  addEstatePlan: (productId: number, formType: 'solo' | '2person', withLEP: boolean) => Promise<boolean>;
  updateItem: (itemId: string, quantity: number) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  clearCart: () => Promise<boolean>;
  applyCoupon: (code: string) => Promise<boolean>;
  removeCoupon: () => Promise<boolean>;
  refreshCart: () => Promise<void>;
  clearError: () => void;
}

const emptyCart: Cart = {
  items: [],
  subtotal: 0,
  tax: 0,
  total: 0,
  itemCount: 0,
};

const CartContext = createContext<CartContextType | undefined>(undefined);

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  // Remembers the previous auth state so the effect below can tell a login
  // (false -> true) from a logout (true -> false) from a mere re-render.
  const prevAuthRef = useRef<boolean | null>(null);

  // Load cart on mount
  useEffect(() => {
    refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshCart = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await cartService.getCart();
      if (response.success && response.data) {
        setCart(response.data);
      }
    } catch (err) {
      console.error('Failed to load cart:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // React to login/logout: bind the cart to the account while signed in, and
  // cut it loose on sign-out. Gated on authLoading so we act only on a settled
  // auth state, never on the transient null during the initial session probe.
  useEffect(() => {
    if (authLoading) return;

    const prev = prevAuthRef.current;
    prevAuthRef.current = isAuthenticated;
    if (prev === isAuthenticated) return;

    let cancelled = false;

    (async () => {
      if (isAuthenticated) {
        // Logged in: fold the guest cart into the account cart, adopt the
        // merged result, then keep mirroring future changes upward.
        cartService.setServerSyncEnabled(false);
        const merged = await cartService.mergeServerCart();
        cartService.setServerSyncEnabled(true);
        if (!cancelled) setCart(merged);
      } else {
        // Logged out: stop syncing and clear this browser's cart so the next
        // user does not inherit the previous account's items.
        cartService.setServerSyncEnabled(false);
        const empty = cartService.resetLocalCart();
        if (!cancelled) setCart(empty);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading]);

  const addItem = useCallback(async (
    productId: number,
    quantity: number = 1,
    variationId?: number
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await cartService.addToCart(productId, quantity, variationId);

      if (response.success && response.data) {
        setCart(response.data);
        setIsLoading(false);
        return true;
      } else {
        setError(response.error || 'Failed to add item to cart');
        setIsLoading(false);
        return false;
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
      return false;
    }
  }, []);

  const updateItem = useCallback(async (itemId: string, quantity: number): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await cartService.updateCartItem(itemId, quantity);

      if (response.success && response.data) {
        setCart(response.data);
        setIsLoading(false);
        return true;
      } else {
        setError(response.error || 'Failed to update cart item');
        setIsLoading(false);
        return false;
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
      return false;
    }
  }, []);

  const removeItem = useCallback(async (itemId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await cartService.removeFromCart(itemId);

      if (response.success && response.data) {
        setCart(response.data);
        setIsLoading(false);
        return true;
      } else {
        setError(response.error || 'Failed to remove item from cart');
        setIsLoading(false);
        return false;
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
      return false;
    }
  }, []);

  const clearCartItems = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await cartService.clearCart();

      if (response.success) {
        setCart(emptyCart);
        setIsLoading(false);
        return true;
      } else {
        setError(response.error || 'Failed to clear cart');
        setIsLoading(false);
        return false;
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
      return false;
    }
  }, []);

  const applyCoupon = useCallback(async (code: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await cartService.applyCoupon(code);

      if (response.success && response.data) {
        setCart(response.data);
        setIsLoading(false);
        return true;
      } else {
        setError(response.error || 'Invalid coupon code');
        setIsLoading(false);
        return false;
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
      return false;
    }
  }, []);

  const removeCoupon = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await cartService.removeCoupon();

      if (response.success && response.data) {
        setCart(response.data);
        setIsLoading(false);
        return true;
      } else {
        setError(response.error || 'Failed to remove coupon');
        setIsLoading(false);
        return false;
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
      return false;
    }
  }, []);

  // Add custom item to cart (for LLC wizard and custom products).
  // Delegates to the service so the item is written to localStorage like every
  // other line; keeping it in React state alone meant it did not survive a
  // reload of the checkout page.
  const addToCart = useCallback((item: CustomCartItem): void => {
    setCart(cartService.addCustomItem(item));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Convenience: clear cart, add estate plan, optionally add Legal Edge Plan
  const addEstatePlan = useCallback(async (
    productId: number,
    formType: 'solo' | '2person',
    withLEP: boolean
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await cartService.clearCart();
      await cartService.addToCart(productId, 1, formType === '2person' ? 2 : 1);
      if (withLEP) {
        await cartService.addToCart(1367, 1, 1);
      }
      await refreshCart();
      setIsLoading(false);
      return true;
    } catch (err) {
      setError('Failed to add plan to cart');
      setIsLoading(false);
      return false;
    }
  }, [refreshCart]);

  const value: CartContextType = {
    cart,
    isLoading,
    error,
    addItem,
    addToCart,
    addEstatePlan,
    updateItem,
    removeItem,
    clearCart: clearCartItems,
    applyCoupon,
    removeCoupon,
    refreshCart,
    clearError,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartContext;
