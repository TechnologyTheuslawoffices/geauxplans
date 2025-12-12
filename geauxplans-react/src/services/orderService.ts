/**
 * Order Service
 *
 * Handles order-related API calls including:
 * - Fetching order history
 * - Order details
 * - Order status tracking
 */

import api from './api';
import type { Order, OrderStatus, ApiResponse, PaginatedResponse } from '../types';

/**
 * Get all orders for the current user
 */
export async function getOrders(): Promise<ApiResponse<Order[]>> {
  return api.get<Order[]>('/orders');
}

/**
 * Get orders with pagination
 */
export async function getOrdersPaginated(
  page: number = 1,
  pageSize: number = 10,
  status?: OrderStatus
): Promise<ApiResponse<PaginatedResponse<Order>>> {
  let url = `/orders?page=${page}&pageSize=${pageSize}`;
  if (status) {
    url += `&status=${status}`;
  }
  return api.get<PaginatedResponse<Order>>(url);
}

/**
 * Get a specific order by ID
 */
export async function getOrder(orderId: number): Promise<ApiResponse<Order>> {
  return api.get<Order>(`/orders/${orderId}`);
}

/**
 * Get order by order number
 */
export async function getOrderByNumber(orderNumber: string): Promise<ApiResponse<Order>> {
  return api.get<Order>(`/orders/number/${orderNumber}`);
}

/**
 * Cancel an order (if allowed)
 */
export async function cancelOrder(orderId: number): Promise<ApiResponse<Order>> {
  return api.post<Order>(`/orders/${orderId}/cancel`);
}

/**
 * Get order status label
 */
export function getOrderStatusLabel(status: OrderStatus): string {
  const statusLabels: Record<OrderStatus, string> = {
    pending: 'Pending Payment',
    processing: 'Processing',
    'on-hold': 'On Hold',
    completed: 'Completed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
    failed: 'Failed',
  };
  return statusLabels[status] || status;
}

/**
 * Get order status color for styling
 */
export function getOrderStatusColor(status: OrderStatus): {
  backgroundColor: string;
  color: string;
} {
  const statusColors: Record<OrderStatus, { backgroundColor: string; color: string }> = {
    pending: { backgroundColor: '#fff3cd', color: '#856404' },
    processing: { backgroundColor: '#cce5ff', color: '#004085' },
    'on-hold': { backgroundColor: '#e2e3e5', color: '#383d41' },
    completed: { backgroundColor: '#d4edda', color: '#155724' },
    cancelled: { backgroundColor: '#f8d7da', color: '#721c24' },
    refunded: { backgroundColor: '#d1ecf1', color: '#0c5460' },
    failed: { backgroundColor: '#f8d7da', color: '#721c24' },
  };
  return statusColors[status] || { backgroundColor: '#e2e3e5', color: '#383d41' };
}

/**
 * Format order total
 */
export function formatOrderTotal(total: number, itemCount: number): string {
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(total);

  return `${formattedTotal} for ${itemCount} item${itemCount !== 1 ? 's' : ''}`;
}

/**
 * Format order date
 */
export function formatOrderDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default {
  getOrders,
  getOrdersPaginated,
  getOrder,
  getOrderByNumber,
  cancelOrder,
  getOrderStatusLabel,
  getOrderStatusColor,
  formatOrderTotal,
  formatOrderDate,
};
