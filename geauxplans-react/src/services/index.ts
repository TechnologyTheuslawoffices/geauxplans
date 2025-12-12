/**
 * Services Index
 *
 * Centralized export for all API services.
 */

export { default as api, setAuthToken, removeAuthToken, wpAjaxRequest } from './api';
export { default as authService } from './authService';
export { default as estatePlanService, PLAN_IDS, PLAN_NAMES } from './estatePlanService';
export { default as orderService } from './orderService';
export { default as cartService } from './cartService';
export { default as businessService, BUSINESS_PRODUCT_IDS } from './businessService';
export { default as userService, US_STATES } from './userService';

// Re-export types that are commonly used with services
export type {
  User,
  AuthCredentials,
  RegisterData,
  AuthResponse,
  Product,
  EstatePlan,
  PlanDocument,
  BusinessEntity,
  BusinessDocument,
  Order,
  OrderStatus,
  Cart,
  CartItem,
  Address,
  LegalEdgePlan,
  ApiResponse,
  PaginatedResponse,
} from '../types';
