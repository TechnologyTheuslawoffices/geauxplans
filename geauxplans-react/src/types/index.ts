/**
 * TypeScript type definitions for GeauxPlans
 */

// User types
export interface User {
  id: string | number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: 'customer' | 'admin';
  createdAt: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends AuthCredentials {
  firstName?: string;
  lastName?: string;
  planId?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// Product types
export interface Product {
  id: number;
  name: string;
  slug: string;
  price: number;
  regularPrice: number;
  salePrice?: number;
  description: string;
  shortDescription: string;
  images: ProductImage[];
  features: string[];
  type: 'simple' | 'variable';
  variations?: ProductVariation[];
}

export interface ProductImage {
  id: number;
  src: string;
  alt: string;
}

export interface ProductVariation {
  id: number;
  name: string;
  price: number;
  attributes: Record<string, string>;
}

// Plan types
export type PlanType = 'minor-child' | 'power-of-attorney' | 'will-based' | 'trust-based';

export interface EstatePlan {
  id: number;
  name: string;
  type: PlanType;
  status: 'pending' | 'in-progress' | 'completed' | 'expired';
  purchaseDate: string;
  completedDate?: string;
  documents: PlanDocument[];
  orderId: number;
}

export interface PlanDocument {
  id: number;
  name: string;
  type: string;
  downloadUrl: string;
  createdAt: string;
}

// Business/LLC types
export interface BusinessEntity {
  id: number;
  name: string;
  type: 'llc' | 'corporation' | 'partnership';
  status: 'active' | 'pending' | 'dissolved';
  formationDate: string;
  state: string;
  registeredAgent?: string;
  documents: BusinessDocument[];
}

export interface BusinessDocument {
  id: number;
  name: string;
  type: string;
  downloadUrl: string;
}

export interface LLCAvailabilityResponse {
  available: boolean;
  name: string;
  similarNames?: string[];
}

// Order types
export interface Order {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  tax: number;
  items: OrderItem[];
  createdAt: string;
  billingAddress: Address;
  shippingAddress?: Address;
  paymentMethod: string;
}

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'on-hold'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export interface OrderItem {
  id: number;
  productId: number;
  variationId?: number;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Address {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

// Cart types
export interface Cart {
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  itemCount: number;
}

export interface CartItem {
  id: string;
  productId: number;
  variationId?: number;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

// Form builder types
export interface PlanBuilderData {
  planId: string;
  state: string;
  married: boolean;
  hasMinorChildren: boolean;
  ownsRealEstate: boolean;
  probateAssetsOver125k: boolean;
  wantsTrust: boolean;
  // Additional fields based on plan type
  [key: string]: any;
}

export interface BusinessPlanBuilderData {
  llcName: string;
  whenToStart: string;
  isFirstLLC: boolean;
  businessDescription: string;
  salesLocation: string;
  hasEmployees: boolean;
  needsRegisteredAgent: boolean;
  operatingAgreementPackage: 'og_1' | 'og_2' | 'og_3';
  llcFormationPackage: 'llc_1' | 'llc_2' | 'llc_3';
}

// Legal Edge Plan types
export interface LegalEdgePlan {
  id: number;
  status: 'active' | 'inactive' | 'cancelled';
  startDate: string;
  nextBillingDate: string;
  price: number;
  benefits: string[];
  includedPlans: number[];
  excludedPlans: number[];
}

// Knackly integration types
export interface KnacklyToken {
  token: string;
  refreshToken: string;
  expiresAt: string;
}

export interface KnacklyFormUrl {
  url: string;
  planType: PlanType;
}

// API Response wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
