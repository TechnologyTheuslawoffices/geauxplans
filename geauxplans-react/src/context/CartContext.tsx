/**
 * Cart Context
 *
 * Provides shopping cart state and methods throughout the app.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import cartService from '../services/cartService';
import type { Cart, CartItem } from '../types';

interface CartContextType {
  cart: Cart;
  isLoading: boolean;
  error: string | null;
  addItem: (productId: number, quantity?: number, variationId?: number) => Promise<boolean>;
  updateItem: (itemId: string, quantity: number) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  clearCart: () => Promise<boolean>;
  applyCoupon: (code: string) => Promise<boolean>;
  removeCoupon: (code: string) => Promise<boolean>;
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

  // Load cart on mount
  useEffect(() => {
    refreshCart();
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

  const removeCoupon = useCallback(async (code: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await cartService.removeCoupon(code);

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

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: CartContextType = {
    cart,
    isLoading,
    error,
    addItem,
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
