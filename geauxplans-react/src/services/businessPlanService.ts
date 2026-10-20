/**
 * Business plan sets (My Companies).
 *
 * A set is created by the Stripe webhook when a business package is paid for;
 * its tier (formType) is one of the BusinessPlanning apps and `includes` says
 * what that purchase unlocked. See geauxplans-backend/src/routes/businessPlans.js.
 */

import api from './api';
import { ApiResponse } from '../types';

export type BusinessFormType =
  | 'LLCRegistration'
  | 'RegistrationOperating'
  | 'RegistrationOperatingEIN'
  | 'RegistrationOperatingEINLicense';

export interface BusinessIncludes {
  registration: boolean;
  operatingAgreement: boolean;
  ein: boolean;
  licenses: boolean;
  registeredAgent: boolean;
}

export interface BusinessPerson {
  type: 'Individual' | 'Entity';
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  suffix?: string;
  entity_name?: string;
  entity_state?: string;
  entity_type?: string;
  signer_name?: string;
  signer_role?: string;
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface BusinessManager {
  is_member: 'Yes' | 'No';
  member_index?: number;
  type?: 'Individual' | 'Entity';
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  entity_name?: string;
}

export interface BusinessFormData {
  company: {
    llc_name?: string;
    office_street?: string;
    office_street2?: string;
    office_city?: string;
    office_state?: string;
    office_zip?: string;
    office_parish?: string;
    phone?: string;
    email?: string;
  };
  // `kind` picks who the agent is; for 'other', the BusinessPerson fields
  // (including its own Individual/Entity `type`) describe them.
  registered_agent: {
    kind?: 'geauxplans' | 'member' | 'other';
    member_index?: number;
  } & Partial<BusinessPerson>;
  members: BusinessPerson[];
  management: {
    only_member_managers?: 'Yes' | 'No';
    member_managers?: number[];
    other_allowed?: string[];
    managers?: BusinessManager[];
    voting_type?: string;
    tax_election?: string;
    tax_matters_agent?: string;
    permitted_family_transfers?: 'Yes' | 'No';
    spouse_of_member?: 'Yes' | 'No';
    spouse_of_descendant?: 'Yes' | 'No';
  };
  ein: {
    why?: string;
    start_month?: string;
    start_year?: string;
    what_do?: string;
    other_what_do?: string;
    dba?: string;
    w2_employees?: 'Yes' | 'No';
    motor_vehicle?: 'Yes' | 'No';
    gambling?: 'Yes' | 'No';
    quarterly_excise?: 'Yes' | 'No';
    restricted_items?: 'Yes' | 'No';
  };
  licenses: {
    in_city_limits?: 'Yes' | 'No';
    licenses_notes?: string;
  };
}

export interface BusinessDocument {
  name: string;
  status?: 'pending' | 'ready';
  storedUrl?: string;
  base64?: string;
}

export interface BusinessPlan {
  id: number;
  submissionNumber?: string;
  formType: BusinessFormType;
  tierLabel: string;
  includes: BusinessIncludes;
  llcName: string;
  submissionStatus: 'inprogress' | 'completed';
  formData: Partial<BusinessFormData> & { _purchase?: Record<string, unknown> };
  documentStatus?: string | null;
  documents: BusinessDocument[];
  createdAt: string;
  updatedAt: string;
  firstSubmittedAt?: string | null;
  canEdit: boolean;
  daysRemaining: number;
  accessMessage?: string;
}

export async function listBusinessPlans(headers?: Record<string, string>): Promise<ApiResponse<BusinessPlan[]>> {
  return api.get<BusinessPlan[]>('/business-plans', headers);
}

export async function getBusinessPlan(id: number | string, headers?: Record<string, string>): Promise<ApiResponse<BusinessPlan>> {
  return api.get<BusinessPlan>(`/business-plans/${id}`, headers);
}

export async function saveBusinessPlan(
  id: number | string,
  formData: BusinessFormData,
  status: 'inprogress' | 'completed',
  headers?: Record<string, string>
): Promise<ApiResponse<BusinessPlan> & { documentError?: string }> {
  return api.put(`/business-plans/${id}`, { form_data: formData, submission_status: status }, headers);
}
