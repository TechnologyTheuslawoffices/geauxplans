/**
 * Which interview pages each plan is made of, and what to call them.
 *
 * This is plain data, kept out of POAForm.tsx so it can be asserted against
 * without mounting the component — see POAForm.pages.test.ts. The page list is
 * the contract between the interview and the server's generation preconditions
 * (geauxplans-backend/src/services/docPreconditions.js): a plan whose pages
 * cannot collect a residuary legatee or an executor will complete the interview
 * and then be refused, silently, at drafting time.
 */

// Page display names for progress bar
export const PAGE_NAMES: Record<string, string> = {
  start: 'Start',
  personal_info: 'Personal',
  spouse_info: 'Spouse',
  children: 'Children',
  agents: 'Agents',
  plan_contents: 'Contents',
  // POA Pages
  fpoa: 'FPOA',
  hcpoa: 'HCPOA',
  hcd: 'HCD',
  // Trust Pages
  trust_setup: 'Trust Setup',
  trustees: 'Trustees',
  distribution: 'Distribution',
  trust_info: 'Trust', // Legacy - kept for compatibility
  // Will Pages
  executors: 'Executors',
  guardians: 'Guardians',
  will_distribution: 'Distribution',
  // Minor Child Pages
  children_trusts: 'Children Trusts',
  // Review
  review: 'Review',
};

// Form type configurations - each plan has specific pages
export const FORM_TYPES: Record<string, { title: string; pages: string[]; planType: string }> = {
  // POA Plans
  powerOfAttorneyForm: {
    title: 'Power of Attorney Supplement for One Person',
    pages: ['start', 'personal_info', 'agents', 'plan_contents', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'poa',
  },
  powerOfAttorneyForm2Person: {
    title: 'Power of Attorney Supplement for Two Persons',
    pages: ['start', 'personal_info', 'agents', 'plan_contents', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'poa_couple',
  },

  // Trust-Based Plans
  trustBasedEstatePlanSolo: {
    title: 'Trust-Based Estate Plan',
    pages: ['start', 'personal_info', 'children', 'agents', 'trust_setup', 'trustees', 'distribution', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'single_trust',
  },
  trustBasedEstatePlan2Person: {
    title: 'Trust-Based Estate Plan for 2 Persons',
    pages: ['start', 'personal_info', 'spouse_info', 'children', 'agents', 'trust_setup', 'trustees', 'distribution', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'joint_trust',
  },

  // Will-Based Plans
  willBasedEstatePlan: {
    title: 'Will-Based Estate Plan',
    pages: ['start', 'personal_info', 'children', 'agents', 'executors', 'guardians', 'will_distribution', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'will_based',
  },
  willBasedEstatePlan2Person: {
    title: 'Will-Based Estate Plan for 2 Persons',
    pages: ['start', 'personal_info', 'spouse_info', 'children', 'agents', 'executors', 'guardians', 'will_distribution', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'will_based_couple',
  },

  // Minor Child-Centered Plans
  //
  // These build a will, so they need the same 'executors' and 'will_distribution'
  // pages the will-based plans use. They were missing, which left will_info
  // .primary_executor as '' and .residuary_distribution as [] with no screen
  // anywhere to fill them in — and the backend refuses to render a will with an
  // unnamed residuary legatee or no executor. Every minor-child plan therefore
  // completed the interview and produced no documents at all.
  //
  // 'agents' also moves ahead of the child pages, matching the will and trust
  // plans. Every one of these screens picks its people out of
  // people_or_entities_who_will_serve_as_agents, so collecting that list last
  // left the children's-trustee dropdown on 'children_trusts' with nothing in it.
  minorChildEstatePlan: {
    title: 'Minor Child-Centered Estate Plan',
    pages: ['start', 'personal_info', 'children', 'agents', 'guardians', 'children_trusts', 'executors', 'will_distribution', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'minor_child',
  },
  minorChildEstatePlan2Person: {
    title: 'Minor Child-Centered Estate Plan for 2 Persons',
    pages: ['start', 'personal_info', 'spouse_info', 'children', 'agents', 'guardians', 'children_trusts', 'executors', 'will_distribution', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'minor_child_couple',
  },
};
