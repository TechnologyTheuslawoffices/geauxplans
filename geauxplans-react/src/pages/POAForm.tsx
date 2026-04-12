import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/poa-form.css';

/**
 * Deep merge two objects, ensuring all fields from defaults exist
 * Arrays from saved data replace defaults (not merged)
 */
function deepMerge<T extends Record<string, any>>(defaults: T, saved: Partial<T>): T {
  const result = { ...defaults };

  for (const key in saved) {
    const savedValue = saved[key];
    if (savedValue !== undefined && savedValue !== null) {
      if (
        typeof savedValue === 'object' &&
        !Array.isArray(savedValue) &&
        typeof defaults[key] === 'object' &&
        !Array.isArray(defaults[key])
      ) {
        // Recursively merge objects
        result[key] = deepMerge(defaults[key], savedValue as any);
      } else {
        // Use saved value (including arrays)
        (result as any)[key] = savedValue;
      }
    }
  }

  return result;
}

// Page display names for progress bar
const PAGE_NAMES: Record<string, string> = {
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
const FORM_TYPES: Record<string, { title: string; pages: string[]; planType: string }> = {
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
  minorChildEstatePlan: {
    title: 'Minor Child-Centered Estate Plan',
    pages: ['start', 'personal_info', 'children', 'guardians', 'children_trusts', 'agents', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'minor_child',
  },
  minorChildEstatePlan2Person: {
    title: 'Minor Child-Centered Estate Plan for 2 Persons',
    pages: ['start', 'personal_info', 'spouse_info', 'children', 'guardians', 'children_trusts', 'agents', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'minor_child_couple',
  },
};

// Suffix options (from Knackly suffixes table)
const SUFFIX_OPTIONS = [
  'Jr.',
  'Sr.',
  'II',
  'III',
  'Esq.',
  'M.D.',
  'O.D.',
  'Ph.D.',
];

// Relationship options for agent dropdown
const RELATIONSHIP_OPTIONS = [
  'Self',
  'Spouse',
  'Son',
  'Daughter',
  'Step-Son',
  'Step-Daughter',
  'Son-in-Law',
  'Daughter-in-Law',
  'Grandson',
  'Granddaughter',
  'Brother',
  'Sister',
  'Brother-in-Law',
  'Sister-in-Law',
  'Father',
  'Mother',
  'Father-in-Law',
  'Mother-in-Law',
  'Uncle',
  'Aunt',
  'Nephew',
  'Niece',
  'Cousin',
  'Friend',
];

// Entity type options (from Knackly entitytypes table)
const ENTITY_TYPE_OPTIONS = [
  { value: 'limited liability company', label: 'Limited Liability Company (LLC)' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'limited partnership', label: 'Limited Partnership' },
  { value: 'general partnership', label: 'General Partnership' },
  { value: 'sole proprietorship', label: 'Sole Proprietorship' },
  { value: 'trust', label: 'Trust' },
];

// Entity role options for signer title (from Knackly entityroles table)
const ENTITY_ROLE_OPTIONS = [
  'President',
  'CEO',
  'Secretary',
  'Member',
  'Manager',
  'Sole Proprietor',
  'Shareholder',
  'Partner',
  'Authorized Signatory',
  'Trustee',
  'Director',
  'Vice President',
  'Treasurer',
  'Trust Officer',
];

// US States (from Knackly states table)
const US_STATES = [
  { value: 'Alabama', abbrev: 'AL' },
  { value: 'Alaska', abbrev: 'AK' },
  { value: 'Arizona', abbrev: 'AZ' },
  { value: 'Arkansas', abbrev: 'AR' },
  { value: 'California', abbrev: 'CA' },
  { value: 'Colorado', abbrev: 'CO' },
  { value: 'Connecticut', abbrev: 'CT' },
  { value: 'Delaware', abbrev: 'DE' },
  { value: 'District of Columbia', abbrev: 'DC' },
  { value: 'Florida', abbrev: 'FL' },
  { value: 'Georgia', abbrev: 'GA' },
  { value: 'Hawaii', abbrev: 'HI' },
  { value: 'Idaho', abbrev: 'ID' },
  { value: 'Illinois', abbrev: 'IL' },
  { value: 'Indiana', abbrev: 'IN' },
  { value: 'Iowa', abbrev: 'IA' },
  { value: 'Kansas', abbrev: 'KS' },
  { value: 'Kentucky', abbrev: 'KY' },
  { value: 'Louisiana', abbrev: 'LA' },
  { value: 'Maine', abbrev: 'ME' },
  { value: 'Maryland', abbrev: 'MD' },
  { value: 'Massachusetts', abbrev: 'MA' },
  { value: 'Michigan', abbrev: 'MI' },
  { value: 'Minnesota', abbrev: 'MN' },
  { value: 'Mississippi', abbrev: 'MS' },
  { value: 'Missouri', abbrev: 'MO' },
  { value: 'Montana', abbrev: 'MT' },
  { value: 'Nebraska', abbrev: 'NE' },
  { value: 'Nevada', abbrev: 'NV' },
  { value: 'New Hampshire', abbrev: 'NH' },
  { value: 'New Jersey', abbrev: 'NJ' },
  { value: 'New Mexico', abbrev: 'NM' },
  { value: 'New York', abbrev: 'NY' },
  { value: 'North Carolina', abbrev: 'NC' },
  { value: 'North Dakota', abbrev: 'ND' },
  { value: 'Ohio', abbrev: 'OH' },
  { value: 'Oklahoma', abbrev: 'OK' },
  { value: 'Oregon', abbrev: 'OR' },
  { value: 'Pennsylvania', abbrev: 'PA' },
  { value: 'Rhode Island', abbrev: 'RI' },
  { value: 'South Carolina', abbrev: 'SC' },
  { value: 'South Dakota', abbrev: 'SD' },
  { value: 'Tennessee', abbrev: 'TN' },
  { value: 'Texas', abbrev: 'TX' },
  { value: 'Utah', abbrev: 'UT' },
  { value: 'Vermont', abbrev: 'VT' },
  { value: 'Virginia', abbrev: 'VA' },
  { value: 'Washington', abbrev: 'WA' },
  { value: 'West Virginia', abbrev: 'WV' },
  { value: 'Wisconsin', abbrev: 'WI' },
  { value: 'Wyoming', abbrev: 'WY' },
];

// Louisiana Parishes (from Knackly parishes table)
const LOUISIANA_PARISHES = [
  'Acadia', 'Allen', 'Ascension', 'Assumption', 'Avoyelles',
  'Beauregard', 'Bienville', 'Bossier',
  'Caddo', 'Calcasieu', 'Caldwell', 'Cameron', 'Catahoula', 'Claiborne', 'Concordia',
  'De Soto',
  'East Baton Rouge', 'East Carroll', 'East Feliciana', 'Evangeline',
  'Franklin',
  'Grant',
  'Iberia', 'Iberville',
  'Jackson', 'Jefferson', 'Jefferson Davis',
  'Lafayette', 'Lafourche', 'La Salle', 'Lincoln', 'Livingston',
  'Madison', 'Morehouse',
  'Natchitoches',
  'Orleans', 'Ouachita',
  'Plaquemines', 'Pointe Coupee',
  'Rapides', 'Red River', 'Richland',
  'Sabine', 'St. Bernard', 'St. Charles', 'St. Helena', 'St. James', 'St. John the Baptist',
  'St. Landry', 'St. Martin', 'St. Mary', 'St. Tammany',
  'Tangipahoa', 'Tensas', 'Terrebonne',
  'Union',
  'Vermilion', 'Vernon',
  'Washington', 'Webster', 'West Baton Rouge', 'West Carroll', 'West Feliciana', 'Winn',
];

// US Counties by state (common counties for major states)
const US_COUNTIES: Record<string, string[]> = {
  'Alabama': ['Jefferson', 'Mobile', 'Madison', 'Montgomery', 'Shelby', 'Baldwin', 'Tuscaloosa', 'Lee', 'Morgan', 'Calhoun'],
  'Alaska': ['Anchorage', 'Fairbanks North Star', 'Matanuska-Susitna', 'Kenai Peninsula', 'Juneau'],
  'Arizona': ['Maricopa', 'Pima', 'Pinal', 'Yavapai', 'Yuma', 'Mohave', 'Coconino', 'Cochise', 'Navajo', 'Apache'],
  'Arkansas': ['Pulaski', 'Benton', 'Washington', 'Sebastian', 'Faulkner', 'Saline', 'Craighead', 'Garland', 'White', 'Lonoke'],
  'California': ['Los Angeles', 'San Diego', 'Orange', 'Riverside', 'San Bernardino', 'Santa Clara', 'Alameda', 'Sacramento', 'Contra Costa', 'Fresno'],
  'Colorado': ['Denver', 'El Paso', 'Arapahoe', 'Jefferson', 'Adams', 'Larimer', 'Douglas', 'Boulder', 'Weld', 'Pueblo'],
  'Connecticut': ['Fairfield', 'Hartford', 'New Haven', 'Litchfield', 'Middlesex', 'New London', 'Tolland', 'Windham'],
  'Delaware': ['New Castle', 'Sussex', 'Kent'],
  'Florida': ['Miami-Dade', 'Broward', 'Palm Beach', 'Hillsborough', 'Orange', 'Pinellas', 'Duval', 'Lee', 'Polk', 'Brevard'],
  'Georgia': ['Fulton', 'Gwinnett', 'Cobb', 'DeKalb', 'Chatham', 'Clayton', 'Cherokee', 'Forsyth', 'Henry', 'Richmond'],
  'Hawaii': ['Honolulu', 'Hawaii', 'Maui', 'Kauai'],
  'Idaho': ['Ada', 'Canyon', 'Kootenai', 'Bonneville', 'Bannock', 'Twin Falls', 'Bingham', 'Madison', 'Nez Perce', 'Elmore'],
  'Illinois': ['Cook', 'DuPage', 'Lake', 'Will', 'Kane', 'McHenry', 'Winnebago', 'Madison', 'St. Clair', 'Sangamon'],
  'Indiana': ['Marion', 'Lake', 'Allen', 'Hamilton', 'St. Joseph', 'Elkhart', 'Tippecanoe', 'Vanderburgh', 'Porter', 'Hendricks'],
  'Iowa': ['Polk', 'Linn', 'Scott', 'Johnson', 'Black Hawk', 'Woodbury', 'Dubuque', 'Story', 'Dallas', 'Pottawattamie'],
  'Kansas': ['Johnson', 'Sedgwick', 'Shawnee', 'Wyandotte', 'Douglas', 'Leavenworth', 'Riley', 'Butler', 'Reno', 'Saline'],
  'Kentucky': ['Jefferson', 'Fayette', 'Kenton', 'Boone', 'Warren', 'Hardin', 'Daviess', 'Campbell', 'Madison', 'Bullitt'],
  'Maine': ['Cumberland', 'York', 'Penobscot', 'Kennebec', 'Androscoggin', 'Aroostook', 'Oxford', 'Somerset', 'Hancock', 'Knox'],
  'Maryland': ['Montgomery', 'Prince George\'s', 'Baltimore', 'Anne Arundel', 'Howard', 'Baltimore City', 'Frederick', 'Harford', 'Carroll', 'Charles'],
  'Massachusetts': ['Middlesex', 'Worcester', 'Suffolk', 'Essex', 'Norfolk', 'Bristol', 'Plymouth', 'Hampden', 'Barnstable', 'Hampshire'],
  'Michigan': ['Wayne', 'Oakland', 'Macomb', 'Kent', 'Genesee', 'Washtenaw', 'Ingham', 'Ottawa', 'Kalamazoo', 'Livingston'],
  'Minnesota': ['Hennepin', 'Ramsey', 'Dakota', 'Anoka', 'Washington', 'Scott', 'Olmsted', 'St. Louis', 'Wright', 'Stearns'],
  'Mississippi': ['Hinds', 'Harrison', 'DeSoto', 'Rankin', 'Jackson', 'Madison', 'Lee', 'Forrest', 'Lauderdale', 'Jones'],
  'Missouri': ['St. Louis', 'Jackson', 'St. Charles', 'St. Louis City', 'Greene', 'Clay', 'Jefferson', 'Boone', 'Jasper', 'Cass'],
  'Montana': ['Yellowstone', 'Missoula', 'Gallatin', 'Flathead', 'Cascade', 'Lewis and Clark', 'Ravalli', 'Silver Bow', 'Lake', 'Lincoln'],
  'Nebraska': ['Douglas', 'Lancaster', 'Sarpy', 'Hall', 'Buffalo', 'Scotts Bluff', 'Lincoln', 'Dodge', 'Madison', 'Platte'],
  'Nevada': ['Clark', 'Washoe', 'Carson City', 'Douglas', 'Elko', 'Lyon', 'Nye', 'Churchill', 'Humboldt', 'White Pine'],
  'New Hampshire': ['Hillsborough', 'Rockingham', 'Merrimack', 'Strafford', 'Grafton', 'Cheshire', 'Belknap', 'Carroll', 'Sullivan', 'Coos'],
  'New Jersey': ['Bergen', 'Middlesex', 'Essex', 'Hudson', 'Monmouth', 'Ocean', 'Union', 'Passaic', 'Camden', 'Morris'],
  'New Mexico': ['Bernalillo', 'Doña Ana', 'Santa Fe', 'Sandoval', 'San Juan', 'McKinley', 'Lea', 'Chaves', 'Valencia', 'Otero'],
  'New York': ['Kings', 'Queens', 'New York', 'Suffolk', 'Bronx', 'Nassau', 'Westchester', 'Erie', 'Monroe', 'Richmond'],
  'North Carolina': ['Mecklenburg', 'Wake', 'Guilford', 'Forsyth', 'Cumberland', 'Durham', 'Buncombe', 'Gaston', 'New Hanover', 'Union'],
  'North Dakota': ['Cass', 'Burleigh', 'Grand Forks', 'Ward', 'Williams', 'Stark', 'Morton', 'Stutsman', 'Richland', 'Rolette'],
  'Ohio': ['Franklin', 'Cuyahoga', 'Hamilton', 'Summit', 'Montgomery', 'Lucas', 'Butler', 'Stark', 'Lorain', 'Warren'],
  'Oklahoma': ['Oklahoma', 'Tulsa', 'Cleveland', 'Canadian', 'Comanche', 'Rogers', 'Payne', 'Wagoner', 'Garfield', 'Pottawatomie'],
  'Oregon': ['Multnomah', 'Washington', 'Clackamas', 'Lane', 'Marion', 'Jackson', 'Deschutes', 'Linn', 'Douglas', 'Yamhill'],
  'Pennsylvania': ['Philadelphia', 'Allegheny', 'Montgomery', 'Bucks', 'Delaware', 'Lancaster', 'Chester', 'York', 'Berks', 'Lehigh'],
  'Rhode Island': ['Providence', 'Kent', 'Washington', 'Newport', 'Bristol'],
  'South Carolina': ['Greenville', 'Richland', 'Charleston', 'Horry', 'Spartanburg', 'Lexington', 'York', 'Berkeley', 'Anderson', 'Beaufort'],
  'South Dakota': ['Minnehaha', 'Pennington', 'Lincoln', 'Brown', 'Brookings', 'Codington', 'Meade', 'Lawrence', 'Davison', 'Yankton'],
  'Tennessee': ['Shelby', 'Davidson', 'Knox', 'Hamilton', 'Rutherford', 'Williamson', 'Sumner', 'Montgomery', 'Wilson', 'Sullivan'],
  'Texas': ['Harris', 'Dallas', 'Tarrant', 'Bexar', 'Travis', 'Collin', 'Denton', 'Hidalgo', 'Fort Bend', 'El Paso'],
  'Utah': ['Salt Lake', 'Utah', 'Davis', 'Weber', 'Washington', 'Cache', 'Tooele', 'Box Elder', 'Iron', 'Summit'],
  'Vermont': ['Chittenden', 'Rutland', 'Washington', 'Windsor', 'Windham', 'Franklin', 'Bennington', 'Addison', 'Caledonia', 'Orange'],
  'Virginia': ['Fairfax', 'Prince William', 'Virginia Beach', 'Loudoun', 'Chesterfield', 'Henrico', 'Norfolk', 'Chesapeake', 'Arlington', 'Newport News'],
  'Washington': ['King', 'Pierce', 'Snohomish', 'Spokane', 'Clark', 'Thurston', 'Kitsap', 'Yakima', 'Whatcom', 'Benton'],
  'West Virginia': ['Kanawha', 'Berkeley', 'Cabell', 'Wood', 'Monongalia', 'Raleigh', 'Putnam', 'Harrison', 'Marion', 'Mercer'],
  'Wisconsin': ['Milwaukee', 'Dane', 'Waukesha', 'Brown', 'Racine', 'Outagamie', 'Winnebago', 'Kenosha', 'Rock', 'Marathon'],
  'Wyoming': ['Laramie', 'Natrona', 'Campbell', 'Sweetwater', 'Fremont', 'Albany', 'Sheridan', 'Park', 'Teton', 'Uinta'],
};

// Get counties for a state (or parishes for Louisiana)
const getCountiesForState = (state: string): string[] => {
  if (state === 'Louisiana') {
    return LOUISIANA_PARISHES;
  }
  return US_COUNTIES[state] || [];
};

// Format phone number as (XXX) XXX-XXXX
const formatPhoneNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

// Handle phone input change
const handlePhoneChange = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  return formatPhoneNumber(digits.slice(0, 10));
};

interface Party {
  id: string;
  type_of_party: 'An individual person' | 'An entity' | '';
  first_name: string;
  middle_name: string;
  surname: string;
  suffix: string;
  date_of_birth: string;
  gender: string;
  relationship_with_person: string;
  last_4_ssn_digits: string;
  entity_name: string;
  entity_type: string;
  last_4_ein_digits: string;
  same_address_as_person_granting_power_of_attorney: boolean;
  street_address: string;
  street_address_2: string;
  city: string;
  state: string;
  zip: string;
  parish: string;
  signers: Array<{
    first_name: string;
    middle_name: string;
    surname: string;
    suffix: string;
    title: string;
  }>;
}

interface FormData {
  // Top-level Knackly fields
  esign: boolean;
  married: boolean;
  children_as_agents: boolean;
  governing_law: string;
  personal_info: {
    first_name: string;
    middle_name: string;
    surname: string;
    suffix: string;
    date_of_birth: string;
    gender: string;
    street_address: string;
    street_address_2: string;
    city: string;
    state: string;
    zip: string;
    parish: string;
    phone_number: string;
    last_4_ssn_digits: string;
  };
  spouse_info: {
    first_name: string;
    middle_name: string;
    surname: string;
    suffix: string;
    date_of_birth: string;
    gender: string;
    phone_number: string;
    last_4_ssn_digits: string;
    same_address_as_primary: boolean;
    street_address: string;
    street_address_2: string;
    city: string;
    state: string;
    zip: string;
    parish: string;
  };
  people_or_entities_who_will_serve_as_agents: {
    parties: Party[];
  };
  fpoa: {
    springing_poa: string;  // 'Yes' = springing (on incapacity), 'No' = immediate
    revoke_prior_poa: string;  // 'Yes' or 'No'
    fpoa_initial_agents: {
      person_to_serve: string;
      second_coagent_person_to_serve: string;
      agents_serve_alone: string;  // 'Yes' or 'No' - can each agent act independently
    };
    has_appointer_successor_agents: string;
    successor_agents: Array<{
      successor_agent_to_serve: string;
      second_successor_coagent_to_serve: string;
      agents_serve_alone: string;
    }>;
  };
  // Spouse FPOA (for 2-person forms)
  spouse_fpoa: {
    springing_poa: string;
    revoke_prior_poa: string;
    fpoa_initial_agents: {
      person_to_serve: string;
      second_coagent_person_to_serve: string;
      agents_serve_alone: string;
    };
    has_appointer_successor_agents: string;
    successor_agents: Array<{
      successor_agent_to_serve: string;
      second_successor_coagent_to_serve: string;
      agents_serve_alone: string;
    }>;
  };
  hcpoa: {
    springing_poa: string;  // 'Yes' = springing (on incapacity), 'No' = immediate
    revoke_prior_poa: string;  // 'Yes' or 'No'
    wish_to_be_organ_donor: string;
    wish_to_donate_body_to_science: string;
    no_blood_transfusion: string;  // 'Yes' or 'No'
    hcpoa_initial_agents: {
      person_to_serve: string;
      second_coagent_person_to_serve: string;
      agents_serve_alone: string;
    };
    has_appointed_successor_agents: string;
    successor_agents: Array<{
      successor_agent_to_serve: string;
      second_successor_coagent_to_serve: string;
      agents_serve_alone: string;
    }>;
  };
  // Spouse HCPOA (for 2-person forms)
  spouse_hcpoa: {
    springing_poa: string;
    revoke_prior_poa: string;
    wish_to_be_organ_donor: string;
    wish_to_donate_body_to_science: string;
    no_blood_transfusion: string;
    hcpoa_initial_agents: {
      person_to_serve: string;
      second_coagent_person_to_serve: string;
      agents_serve_alone: string;
    };
    has_appointed_successor_agents: string;
    successor_agents: Array<{
      successor_agent_to_serve: string;
      second_successor_coagent_to_serve: string;
      agents_serve_alone: string;
    }>;
  };
  hcd: {
    life_support_option: string;
    client_hcds: string[];
    extend_hcd: string;  // 'Yes' or 'No' - extend beyond default period
    hcd_days: number;  // Number of days if extended
    hcd_sooner_longer: string;  // 'sooner' or 'longer'
  };
  // Spouse HCD (for 2-person forms)
  spouse_hcd: {
    life_support_option: string;
    spouse_hcds: string[];
    extend_hcd: string;
    hcd_days: number;
    hcd_sooner_longer: string;
  };
  trust_info: {
    trust_name: string;
    trust_type: string;
    is_amendment: boolean;
    settlor_as_trustee: boolean;
    successor_trustee: string;
    marital_trust_type: string;
    primary_beneficiaries: string[];
    contingent_beneficiaries: string[];
    successor_trustees: string[];
    specific_bequests: string;
    residuary_distribution: string;
    special_instructions: string;
  };
  will_info: {
    primary_executor: string;
    successor_executor: string;
    primary_guardian: string;
    backup_guardian: string;
    has_specific_bequests: boolean;
    specific_bequests: string;
    residuary_distribution: string;
    distribution_age: string;
    children_trustee: string;
    allow_education_distributions: boolean;
  };
}

const initialFormData: FormData = {
  // Top-level Knackly fields
  esign: false,
  married: false,
  children_as_agents: false,
  governing_law: 'Louisiana',
  personal_info: {
    first_name: '',
    middle_name: '',
    surname: '',
    suffix: '',
    date_of_birth: '',
    gender: '',
    street_address: '',
    street_address_2: '',
    city: '',
    state: 'Louisiana',
    zip: '',
    parish: '',
    phone_number: '',
    last_4_ssn_digits: '',
  },
  spouse_info: {
    first_name: '',
    middle_name: '',
    surname: '',
    suffix: '',
    date_of_birth: '',
    gender: '',
    phone_number: '',
    last_4_ssn_digits: '',
    same_address_as_primary: true,
    street_address: '',
    street_address_2: '',
    city: '',
    state: 'Louisiana',
    zip: '',
    parish: '',
  },
  people_or_entities_who_will_serve_as_agents: {
    parties: [],
  },
  fpoa: {
    springing_poa: 'No',  // Default to immediate POA
    revoke_prior_poa: 'No',
    fpoa_initial_agents: {
      person_to_serve: '',
      second_coagent_person_to_serve: '',
      agents_serve_alone: 'Yes',  // Default to agents can act independently
    },
    has_appointer_successor_agents: '',
    successor_agents: [],
  },
  spouse_fpoa: {
    springing_poa: 'No',
    revoke_prior_poa: 'No',
    fpoa_initial_agents: {
      person_to_serve: '',
      second_coagent_person_to_serve: '',
      agents_serve_alone: 'Yes',
    },
    has_appointer_successor_agents: '',
    successor_agents: [],
  },
  hcpoa: {
    springing_poa: 'No',
    revoke_prior_poa: 'No',
    wish_to_be_organ_donor: '',
    wish_to_donate_body_to_science: '',
    no_blood_transfusion: 'No',
    hcpoa_initial_agents: {
      person_to_serve: '',
      second_coagent_person_to_serve: '',
      agents_serve_alone: 'Yes',
    },
    has_appointed_successor_agents: '',
    successor_agents: [],
  },
  spouse_hcpoa: {
    springing_poa: 'No',
    revoke_prior_poa: 'No',
    wish_to_be_organ_donor: '',
    wish_to_donate_body_to_science: '',
    no_blood_transfusion: 'No',
    hcpoa_initial_agents: {
      person_to_serve: '',
      second_coagent_person_to_serve: '',
      agents_serve_alone: 'Yes',
    },
    has_appointed_successor_agents: '',
    successor_agents: [],
  },
  hcd: {
    life_support_option: '',
    client_hcds: [],
    extend_hcd: 'No',
    hcd_days: 7,
    hcd_sooner_longer: '',
  },
  spouse_hcd: {
    life_support_option: '',
    spouse_hcds: [],
    extend_hcd: 'No',
    hcd_days: 7,
    hcd_sooner_longer: '',
  },
  trust_info: {
    trust_name: '',
    trust_type: 'revocable',
    is_amendment: false,
    settlor_as_trustee: true,
    successor_trustee: '',
    marital_trust_type: '',
    primary_beneficiaries: [],
    contingent_beneficiaries: [],
    successor_trustees: [],
    specific_bequests: '',
    residuary_distribution: '',
    special_instructions: '',
  },
  will_info: {
    primary_executor: '',
    successor_executor: '',
    primary_guardian: '',
    backup_guardian: '',
    has_specific_bequests: false,
    specific_bequests: '',
    residuary_distribution: '',
    distribution_age: '25',
    children_trustee: '',
    allow_education_distributions: true,
  },
};

const createEmptyParty = (): Party => ({
  id: `party_${Date.now()}`,
  type_of_party: '',
  first_name: '',
  middle_name: '',
  surname: '',
  suffix: '',
  date_of_birth: '',
  gender: '',
  relationship_with_person: '',
  last_4_ssn_digits: '',
  entity_name: '',
  entity_type: '',
  last_4_ein_digits: '',
  same_address_as_person_granting_power_of_attorney: false,
  street_address: '',
  street_address_2: '',
  city: '',
  state: '',
  zip: '',
  parish: '',
  signers: [],
});

// ============================================================================
// TEST DATA FOR PREFILL - Covers all scenarios for POA 2-Person
// ============================================================================
const TEST_PREFILL_DATA: FormData = {
  esign: true,
  married: true,
  children_as_agents: true,
  governing_law: 'Louisiana',
  personal_info: {
    first_name: 'John',
    middle_name: 'Michael',
    surname: 'Smith',
    suffix: 'Jr.',
    date_of_birth: '1975-06-15',
    gender: 'Male',
    street_address: '123 Main Street',
    street_address_2: 'Suite 100',
    city: 'Baton Rouge',
    state: 'Louisiana',
    zip: '70801',
    parish: 'East Baton Rouge',
    phone_number: '(225) 555-1234',
    last_4_ssn_digits: '1234',
  },
  spouse_info: {
    first_name: 'Jane',
    middle_name: 'Marie',
    surname: 'Smith',
    suffix: '',
    date_of_birth: '1978-03-22',
    gender: 'Female',
    phone_number: '(225) 555-5678',
    last_4_ssn_digits: '5678',
    same_address_as_primary: true,
    street_address: '',
    street_address_2: '',
    city: '',
    state: 'Louisiana',
    zip: '',
    parish: '',
  },
  people_or_entities_who_will_serve_as_agents: {
    parties: [
      // Agent 1: Individual (child)
      {
        id: 'party_1',
        type_of_party: 'An individual person',
        first_name: 'Robert',
        middle_name: 'James',
        surname: 'Smith',
        suffix: '',
        date_of_birth: '1998-09-10',
        gender: 'Male',
        relationship_with_person: 'Son',
        last_4_ssn_digits: '9876',
        entity_name: '',
        entity_type: '',
        last_4_ein_digits: '',
        same_address_as_person_granting_power_of_attorney: false,
        street_address: '456 Oak Avenue',
        street_address_2: '',
        city: 'New Orleans',
        state: 'Louisiana',
        zip: '70112',
        parish: 'Orleans',
        signers: [],
      },
      // Agent 2: Individual (child)
      {
        id: 'party_2',
        type_of_party: 'An individual person',
        first_name: 'Emily',
        middle_name: 'Rose',
        surname: 'Johnson',
        suffix: '',
        date_of_birth: '2000-12-05',
        gender: 'Female',
        relationship_with_person: 'Daughter',
        last_4_ssn_digits: '5432',
        entity_name: '',
        entity_type: '',
        last_4_ein_digits: '',
        same_address_as_person_granting_power_of_attorney: false,
        street_address: '789 Pine Road',
        street_address_2: 'Apt 3B',
        city: 'Lafayette',
        state: 'Louisiana',
        zip: '70501',
        parish: 'Lafayette',
        signers: [],
      },
      // Agent 3: Entity (bank/trust company)
      {
        id: 'party_3',
        type_of_party: 'An entity',
        first_name: '',
        middle_name: '',
        surname: '',
        suffix: '',
        date_of_birth: '',
        gender: '',
        relationship_with_person: '',
        last_4_ssn_digits: '',
        entity_name: 'First National Trust Company',
        entity_type: 'trust',
        last_4_ein_digits: '4321',
        same_address_as_person_granting_power_of_attorney: false,
        street_address: '100 Financial Plaza',
        street_address_2: 'Floor 25',
        city: 'Baton Rouge',
        state: 'Louisiana',
        zip: '70802',
        parish: 'East Baton Rouge',
        signers: [
          {
            first_name: 'William',
            middle_name: 'T.',
            surname: 'Davis',
            suffix: '',
            title: 'Trust Officer',
          },
        ],
      },
      // Agent 4: Another individual (friend/trusted person)
      {
        id: 'party_4',
        type_of_party: 'An individual person',
        first_name: 'Michael',
        middle_name: 'Andrew',
        surname: 'Williams',
        suffix: 'III',
        date_of_birth: '1970-04-18',
        gender: 'Male',
        relationship_with_person: 'Friend',
        last_4_ssn_digits: '7890',
        entity_name: '',
        entity_type: '',
        last_4_ein_digits: '',
        same_address_as_person_granting_power_of_attorney: false,
        street_address: '555 Elm Street',
        street_address_2: '',
        city: 'Shreveport',
        state: 'Louisiana',
        zip: '71101',
        parish: 'Caddo',
        signers: [],
      },
    ],
  },
  // Client FPOA - Simplified (hidden fields use defaults)
  fpoa: {
    springing_poa: 'No',  // HIDDEN: defaults to No (immediate)
    revoke_prior_poa: 'No',  // HIDDEN: defaults to No
    fpoa_initial_agents: {
      person_to_serve: 'spouse',  // Spouse as primary agent
      second_coagent_person_to_serve: '',  // HIDDEN: defaults to none
      agents_serve_alone: 'Yes',  // HIDDEN: defaults to Yes
    },
    has_appointer_successor_agents: 'No',  // HIDDEN: defaults to No
    successor_agents: [],  // HIDDEN: no successors
  },
  // Spouse FPOA - Simplified (hidden fields use defaults)
  spouse_fpoa: {
    springing_poa: 'No',  // HIDDEN: defaults to No (immediate)
    revoke_prior_poa: 'No',  // HIDDEN: defaults to No
    fpoa_initial_agents: {
      person_to_serve: 'Emily Rose Johnson',
      second_coagent_person_to_serve: '',  // HIDDEN: defaults to none
      agents_serve_alone: 'Yes',  // HIDDEN: defaults to Yes
    },
    has_appointer_successor_agents: 'No',  // HIDDEN: defaults to No
    successor_agents: [],  // HIDDEN: no successors
  },
  // Client HCPOA - Simplified (hidden fields use defaults)
  hcpoa: {
    springing_poa: 'No',  // HIDDEN: defaults to No
    revoke_prior_poa: 'No',  // HIDDEN: defaults to No
    wish_to_be_organ_donor: 'Yes',
    wish_to_donate_body_to_science: 'No',
    no_blood_transfusion: 'No',  // HIDDEN: defaults to No (allow transfusions)
    hcpoa_initial_agents: {
      person_to_serve: 'spouse',  // Use 'spouse' to select spouse from dropdown
      second_coagent_person_to_serve: '',  // HIDDEN: defaults to none
      agents_serve_alone: 'Yes',  // HIDDEN: defaults to Yes
    },
    has_appointed_successor_agents: 'No',  // HIDDEN: defaults to No
    successor_agents: [],  // HIDDEN: no successors
  },
  // Spouse HCPOA - Simplified (hidden fields use defaults)
  spouse_hcpoa: {
    springing_poa: 'No',  // HIDDEN: defaults to No
    revoke_prior_poa: 'No',  // HIDDEN: defaults to No
    wish_to_be_organ_donor: 'No',
    wish_to_donate_body_to_science: 'Yes',
    no_blood_transfusion: 'No',  // HIDDEN: defaults to No (allow transfusions)
    hcpoa_initial_agents: {
      person_to_serve: 'client',  // Use 'client' to select client (my spouse) from dropdown
      second_coagent_person_to_serve: '',  // HIDDEN: defaults to none
      agents_serve_alone: 'Yes',  // HIDDEN: defaults to Yes
    },
    has_appointed_successor_agents: 'No',  // HIDDEN: defaults to No
    successor_agents: [],  // HIDDEN: no successors
  },
  // Client HCD - Simplified (hidden fields use defaults)
  hcd: {
    life_support_option: 'CHOOSE',  // 'WITHDRAW' or 'CHOOSE'
    client_hcds: ['Nutr', 'Hydr', 'CPR'],  // Options: 'Nutr', 'Hydr', 'Vent', 'CPR'
    extend_hcd: 'No',  // HIDDEN: defaults to No (standard period)
    hcd_days: 7,  // HIDDEN: defaults to 7
    hcd_sooner_longer: '',  // HIDDEN: defaults to empty
  },
  // Spouse HCD - Simplified (hidden fields use defaults)
  spouse_hcd: {
    life_support_option: 'WITHDRAW',  // 'WITHDRAW' or 'CHOOSE'
    spouse_hcds: [],  // No specific options when WITHDRAW
    extend_hcd: 'No',  // HIDDEN: defaults to No
    hcd_days: 7,  // HIDDEN: defaults to 7
    hcd_sooner_longer: '',  // HIDDEN: defaults to empty
  },
  // Trust info (for trust-based plans)
  trust_info: {
    trust_name: 'Smith Family Living Trust',
    trust_type: 'revocable',
    is_amendment: false,
    settlor_as_trustee: true,
    successor_trustee: 'Robert James Smith',
    marital_trust_type: 'NoMarital',
    primary_beneficiaries: ['Robert James Smith', 'Emily Rose Johnson'],
    contingent_beneficiaries: ['Grandchildren per stirpes'],
    successor_trustees: ['First National Trust Company'],
    specific_bequests: 'Family home to children equally; Jewelry collection to daughter Emily.',
    residuary_distribution: 'Equally among my children',
    special_instructions: 'Distribute trust assets to children at ages 25, 30, and 35 in equal portions.',
  },
  // Will info (for will-based plans)
  will_info: {
    primary_executor: 'Robert James Smith',
    successor_executor: 'Emily Rose Johnson',
    primary_guardian: 'Michael Andrew Williams III',
    backup_guardian: 'Emily Rose Johnson',
    has_specific_bequests: true,
    specific_bequests: 'My jewelry collection to my daughter Emily.',
    residuary_distribution: 'Equally among my children per stirpes.',
    distribution_age: '25',
    children_trustee: 'First National Trust Company',
    allow_education_distributions: true,
  },
};

const POAForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const formType = searchParams.get('type') || 'powerOfAttorneyForm';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const submissionId = searchParams.get('submission');

  const [currentPage, setCurrentPage] = useState(0);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [existingSubmissionId, setExistingSubmissionId] = useState<number | null>(null);
  const [hasOtherParties, setHasOtherParties] = useState<string>('');

  const formConfig = FORM_TYPES[formType] || FORM_TYPES.powerOfAttorneyForm;
  const pages = formConfig.pages;

  // Load existing submission
  useEffect(() => {
    const loadSubmission = async () => {
      try {
        const response = await api.get(`/submissions/by-type/${formType}`);
        if (response.success && response.data && response.data.formData) {
          // Deep merge saved data with initial data to ensure all required fields exist
          const savedData = response.data.formData;
          const mergedData = deepMerge(initialFormData, savedData);
          setFormData(mergedData);
          setExistingSubmissionId(response.data.id);
        }
      } catch (error) {
        console.error('Failed to load submission:', error);
      }
    };

    if (isAuthenticated) {
      loadSubmission();
    }
  }, [formType, isAuthenticated]);

  // Set married flag based on form type
  // For POA forms: always false (matching WordPress behavior)
  // For Trust/Will forms: true for 2-person plans
  useEffect(() => {
    const isTwoPerson = formType.includes('2Person');
    const isPOA = formType.includes('powerOfAttorney');

    // POA forms always have married = false per WordPress
    // Trust/Will forms set married based on 2-person status
    const marriedValue = isPOA ? false : isTwoPerson;

    setFormData(prev => ({
      ...prev,
      married: marriedValue,
    }));
  }, [formType]);

  const updateFormData = useCallback((section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev as any)[section],
        [field]: value,
      },
    }));
    // Clear error for this field
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`${section}.${field}`];
      return newErrors;
    });
  }, []);

  const updateNestedFormData = useCallback((path: string, value: any) => {
    setFormData(prev => {
      const newData = { ...prev };
      const parts = path.split('.');
      let current: any = newData;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return newData;
    });
  }, []);

  const addParty = () => {
    setFormData(prev => ({
      ...prev,
      people_or_entities_who_will_serve_as_agents: {
        parties: [...(prev.people_or_entities_who_will_serve_as_agents?.parties || []), createEmptyParty()],
      },
    }));
  };

  const removeParty = (index: number) => {
    setFormData(prev => ({
      ...prev,
      people_or_entities_who_will_serve_as_agents: {
        parties: (prev.people_or_entities_who_will_serve_as_agents?.parties || []).filter((_, i) => i !== index),
      },
    }));
  };

  // Successor agent helper functions
  const addSuccessorAgent = (poaType: 'fpoa' | 'hcpoa' | 'spouse_fpoa' | 'spouse_hcpoa') => {
    setFormData(prev => ({
      ...prev,
      [poaType]: {
        ...prev[poaType],
        successor_agents: [
          ...(prev[poaType].successor_agents || []),
          { successor_agent_to_serve: '', second_successor_coagent_to_serve: '', agents_serve_alone: '' }
        ],
      },
    }));
  };

  const removeSuccessorAgent = (poaType: 'fpoa' | 'hcpoa' | 'spouse_fpoa' | 'spouse_hcpoa', index: number) => {
    setFormData(prev => ({
      ...prev,
      [poaType]: {
        ...prev[poaType],
        successor_agents: (prev[poaType].successor_agents || []).filter((_, i) => i !== index),
      },
    }));
  };

  const updateSuccessorAgent = (poaType: 'fpoa' | 'hcpoa' | 'spouse_fpoa' | 'spouse_hcpoa', index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [poaType]: {
        ...prev[poaType],
        successor_agents: (prev[poaType].successor_agents || []).map((agent, i) =>
          i === index ? { ...agent, [field]: value } : agent
        ),
      },
    }));
  };

  const getOrdinalLabel = (index: number): string => {
    const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
    return ordinals[index] || `${index + 1}th`;
  };

  // Easter egg: Prefill form with test data (Ctrl+Shift+T)
  const prefillTestData = useCallback(() => {
    const isTwoPerson = formType.includes('2Person');

    // Clone test data and adjust agent selections based on form type
    const testData = JSON.parse(JSON.stringify(TEST_PREFILL_DATA));

    if (!isTwoPerson) {
      // For 1-person forms, use actual party names instead of 'spouse'
      // Compute the name exactly as getPartyDisplayName does
      const firstParty = testData.people_or_entities_who_will_serve_as_agents.parties[0];
      const firstPartyName = [firstParty.first_name, firstParty.middle_name, firstParty.surname]
        .filter(Boolean).join(' ');
      testData.fpoa.fpoa_initial_agents.person_to_serve = firstPartyName;
      testData.hcpoa.hcpoa_initial_agents.person_to_serve = firstPartyName;
    }

    setFormData(testData);
    setHasOtherParties('Yes');
    setSaveMessage('🥚 Test data loaded!');
    setTimeout(() => setSaveMessage(''), 3000);
  }, [formType]);

  // Easter egg: Click title 5 times rapidly to prefill
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [easterEggClicks, setEasterEggClicks] = useState(0);
  const easterEggTimeout = React.useRef<NodeJS.Timeout | null>(null);

  const handleTitleClick = useCallback(() => {
    setEasterEggClicks(prev => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        prefillTestData();
        return 0;
      }
      // Reset after 2 seconds of no clicks
      if (easterEggTimeout.current) clearTimeout(easterEggTimeout.current);
      easterEggTimeout.current = setTimeout(() => setEasterEggClicks(0), 2000);
      return newCount;
    });
  }, [prefillTestData]);

  const updateParty = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      people_or_entities_who_will_serve_as_agents: {
        parties: (prev.people_or_entities_who_will_serve_as_agents?.parties || []).map((party, i) =>
          i === index ? { ...party, [field]: value } : party
        ),
      },
    }));
  };

  // Signer management for entity parties
  const addSigner = (partyIndex: number) => {
    setFormData(prev => ({
      ...prev,
      people_or_entities_who_will_serve_as_agents: {
        parties: (prev.people_or_entities_who_will_serve_as_agents?.parties || []).map((party, i) =>
          i === partyIndex
            ? {
                ...party,
                signers: [
                  ...(party.signers || []),
                  { first_name: '', middle_name: '', surname: '', suffix: '', title: '' },
                ],
              }
            : party
        ),
      },
    }));
  };

  const updateSigner = (partyIndex: number, signerIndex: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      people_or_entities_who_will_serve_as_agents: {
        parties: (prev.people_or_entities_who_will_serve_as_agents?.parties || []).map((party, i) =>
          i === partyIndex
            ? {
                ...party,
                signers: (party.signers || []).map((signer, si) =>
                  si === signerIndex ? { ...signer, [field]: value } : signer
                ),
              }
            : party
        ),
      },
    }));
  };

  const removeSigner = (partyIndex: number, signerIndex: number) => {
    setFormData(prev => ({
      ...prev,
      people_or_entities_who_will_serve_as_agents: {
        parties: (prev.people_or_entities_who_will_serve_as_agents?.parties || []).map((party, i) =>
          i === partyIndex
            ? {
                ...party,
                signers: (party.signers || []).filter((_, si) => si !== signerIndex),
              }
            : party
        ),
      },
    }));
  };

  const getPartyDisplayName = (party: Party): string => {
    if (party.type_of_party === 'An entity') {
      return party.entity_name || 'Unnamed Entity';
    }
    const name = [party.first_name, party.middle_name, party.surname].filter(Boolean).join(' ');
    return name || 'Unnamed Person';
  };

  const validatePage = (pageIndex: number): { valid: boolean; errors: Record<string, string> } => {
    const newErrors: Record<string, string> = {};
    const pageName = pages[pageIndex];

    if (pageName === 'personal_info') {
      const pi = formData.personal_info;
      if (!pi.first_name) newErrors['personal_info.first_name'] = 'First name is required';
      if (!pi.surname) newErrors['personal_info.surname'] = 'Last name is required';
      if (!pi.date_of_birth) newErrors['personal_info.date_of_birth'] = 'Date of birth is required';
      if (!pi.gender) newErrors['personal_info.gender'] = 'Gender is required';
      if (!pi.street_address) newErrors['personal_info.street_address'] = 'Street address is required';
      if (!pi.city) newErrors['personal_info.city'] = 'City is required';
      if (!pi.state) newErrors['personal_info.state'] = 'State is required';
      if (!pi.zip) newErrors['personal_info.zip'] = 'ZIP code is required';
      if (pi.zip && (!/^\d{5}$/.test(pi.zip))) newErrors['personal_info.zip'] = 'ZIP must be 5 digits';
      if (!pi.parish) newErrors['personal_info.parish'] = 'Parish is required';
      if (!pi.phone_number) newErrors['personal_info.phone_number'] = 'Phone number is required';
      if (!pi.last_4_ssn_digits) newErrors['personal_info.last_4_ssn_digits'] = 'Last 4 SSN digits required';
      if (pi.last_4_ssn_digits && !/^\d{4}$/.test(pi.last_4_ssn_digits)) {
        newErrors['personal_info.last_4_ssn_digits'] = 'Must be exactly 4 digits';
      }
    }

    // Other Parties page - no strict validation, user can skip if they select "No"
    if (pageName === 'spouse_info') {
      // Validation is optional - if user selects "Yes" but adds no parties, we allow it
      // The parties will be used in later steps
    }

    if (pageName === 'agents') {
      if ((formData.people_or_entities_who_will_serve_as_agents?.parties || []).length === 0) {
        newErrors['agents'] = 'You must add at least one agent';
      }
    }

    if (pageName === 'trust_info') {
      const ti = formData.trust_info;
      if (!ti.trust_type) newErrors['trust_info.trust_type'] = 'Trust type is required';
    }

    return { valid: Object.keys(newErrors).length === 0, errors: newErrors };
  };

  const validateCurrentPage = (): boolean => {
    const result = validatePage(currentPage);
    setErrors(result.errors);
    return result.valid;
  };

  const handleSave = async (status: 'inprogress' | 'completed' = 'inprogress') => {
    if (!isAuthenticated) {
      setSaveMessage('Please log in to save your progress');
      return;
    }

    setIsSaving(true);
    setSaveMessage('');

    try {
      const payload = {
        form_data: formData,
        form_type: formType,
        submission_status: status,
      };

      console.log('Saving submission:', { status, existingSubmissionId, payload });

      let response;
      if (existingSubmissionId) {
        response = await api.put(`/submissions/${existingSubmissionId}`, payload);
      } else {
        response = await api.post('/submissions', payload);
      }

      console.log('Save response:', response);

      if (response.success) {
        if (!existingSubmissionId && response.data?.id) {
          setExistingSubmissionId(response.data.id);
        }

        if (status === 'completed') {
          setSaveMessage('You Successfully Saved Your Changes. You will now be redirected to your dashboard.');
          setTimeout(() => {
            navigate('/my-account/my-estate-planning');
          }, 3000);
        } else {
          setSaveMessage('Progress saved!');
          setTimeout(() => setSaveMessage(''), 5000);
        }
      } else {
        console.error('Save failed:', response.error);
        setSaveMessage(response.error || 'Failed to save. Please try again.');
        setTimeout(() => setSaveMessage(''), 5000);
      }
    } catch (error) {
      console.error('Save error:', error);
      setSaveMessage('Failed to save. Please try again.');
      setTimeout(() => setSaveMessage(''), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    console.log('Submit clicked - validating all pages...');

    // Validate all pages
    let firstInvalidPage = -1;
    let allErrors: Record<string, string> = {};

    for (let i = 0; i < pages.length; i++) {
      const result = validatePage(i);
      console.log(`Page ${i} (${pages[i]}): valid=${result.valid}`, result.errors);
      if (!result.valid) {
        if (firstInvalidPage === -1) {
          firstInvalidPage = i;
          allErrors = result.errors;
        }
      }
    }

    if (firstInvalidPage !== -1) {
      console.log('Validation failed on page', firstInvalidPage, allErrors);
      setCurrentPage(firstInvalidPage);
      setErrors(allErrors);
      setSaveMessage(`Please complete all required fields on the "${pages[firstInvalidPage]}" page`);
      return;
    }

    console.log('Validation passed - submitting form...');
    setIsSubmitting(true);
    try {
      await handleSave('completed');
    } catch (error) {
      console.error('Submit error:', error);
      setSaveMessage('An error occurred while submitting. Please try again.');
    }
    setIsSubmitting(false);
  };

  const nextPage = () => {
    if (validateCurrentPage()) {
      handleSave('inprogress');
      setCurrentPage(prev => Math.min(prev + 1, pages.length - 1));
    }
  };

  const prevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 0));
  };

  const getPrincipalFullName = () => {
    const pi = formData.personal_info;
    return [pi.first_name, pi.middle_name, pi.surname].filter(Boolean).join(' ') || 'Principal';
  };

  // Get page display name based on form type (POA uses "Principal 2" instead of "Spouse")
  const getPageDisplayName = (page: string): string => {
    const isPOA = formType.includes('powerOfAttorney');
    if (page === 'spouse_info') {
      return isPOA ? 'Principal 2' : 'Spouse';
    }
    return PAGE_NAMES[page] || page;
  };

  const renderStartPage = () => (
    <div className="poa-page">
      <p className="text-muted"><em>Estate Plan Document Selection</em></p>
      <h2>1. {formConfig.title}</h2>
      <p>
        The Power of Attorney (POA) Supplement to your estate plan is well suited for families with a young adult child or student who is over the age of eighteen (18), or families with an agent parent, or any other person who needs to authorize someone to act for them legally. The Power of Attorney Supplement includes a Financial Power of Attorney, a Medical Power of Attorney, and an Advanced Healthcare Directive (a/k/a "Living Will") for one person. These documents would authorize someone to make legal or financial decisions for yourself, an adult child, an aging parent, or any other person, as well as access protected health information, consent to medical procedures, or make care arrangements if the person granting the power is unable to do so.
      </p>
    </div>
  );

  const renderPersonalInfoPage = () => {
    const isPOA2Person = formType === 'powerOfAttorneyForm2Person';

    return (
      <div className="poa-page">
        <h2>2. Personal Information</h2>
        <p className="text-muted">
          {isPOA2Person
            ? 'Enter the personal information for both persons granting powers of attorney.'
            : 'Enter your personal information below.'}
        </p>

        {/* First Principal Section */}
        {isPOA2Person && (
          <h4 className="mt-4 mb-3 text-primary">First Principal</h4>
        )}

        <div className="row mb-3">
          <div className="col-md-3">
            <label className="form-label">First Name <span className="text-danger">*</span></label>
            <input
              type="text"
              className={`form-control ${errors['personal_info.first_name'] ? 'is-invalid' : ''}`}
              value={formData.personal_info.first_name}
              onChange={(e) => updateFormData('personal_info', 'first_name', e.target.value)}
            />
            {errors['personal_info.first_name'] && <div className="invalid-feedback">{errors['personal_info.first_name']}</div>}
          </div>
          <div className="col-md-3">
            <label className="form-label">Middle Name</label>
            <input
              type="text"
              className="form-control"
              value={formData.personal_info.middle_name}
              onChange={(e) => updateFormData('personal_info', 'middle_name', e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Last Name <span className="text-danger">*</span></label>
            <input
              type="text"
              className={`form-control ${errors['personal_info.surname'] ? 'is-invalid' : ''}`}
              value={formData.personal_info.surname}
              onChange={(e) => updateFormData('personal_info', 'surname', e.target.value)}
            />
            {errors['personal_info.surname'] && <div className="invalid-feedback">{errors['personal_info.surname']}</div>}
          </div>
          <div className="col-md-3">
            <label className="form-label">Suffix</label>
            <select
              className="form-select"
              value={formData.personal_info.suffix}
              onChange={(e) => updateFormData('personal_info', 'suffix', e.target.value)}
            >
              <option value="">None</option>
              {SUFFIX_OPTIONS.map((sfx) => (
                <option key={sfx} value={sfx}>{sfx}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">Date of Birth <span className="text-danger">*</span></label>
            <input
              type="date"
              className={`form-control ${errors['personal_info.date_of_birth'] ? 'is-invalid' : ''}`}
              value={formData.personal_info.date_of_birth}
              onChange={(e) => updateFormData('personal_info', 'date_of_birth', e.target.value)}
            />
            {errors['personal_info.date_of_birth'] && <div className="invalid-feedback">{errors['personal_info.date_of_birth']}</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label">Gender <span className="text-danger">*</span></label>
            <select
              className={`form-select ${errors['personal_info.gender'] ? 'is-invalid' : ''}`}
              value={formData.personal_info.gender}
              onChange={(e) => updateFormData('personal_info', 'gender', e.target.value)}
            >
              <option value="">Select...</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            {errors['personal_info.gender'] && <div className="invalid-feedback">{errors['personal_info.gender']}</div>}
          </div>
        </div>

        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">Street Address <span className="text-danger">*</span></label>
            <input
              type="text"
              className={`form-control ${errors['personal_info.street_address'] ? 'is-invalid' : ''}`}
              value={formData.personal_info.street_address}
              onChange={(e) => updateFormData('personal_info', 'street_address', e.target.value)}
            />
            {errors['personal_info.street_address'] && <div className="invalid-feedback">{errors['personal_info.street_address']}</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label">Street Address 2</label>
            <input
              type="text"
              className="form-control"
              value={formData.personal_info.street_address_2}
              onChange={(e) => updateFormData('personal_info', 'street_address_2', e.target.value)}
              placeholder="Apt, Suite, Unit, etc."
            />
          </div>
        </div>

        <div className="row mb-3">
          <div className="col-md-3">
            <label className="form-label">City <span className="text-danger">*</span></label>
            <input
              type="text"
              className={`form-control ${errors['personal_info.city'] ? 'is-invalid' : ''}`}
              value={formData.personal_info.city}
              onChange={(e) => updateFormData('personal_info', 'city', e.target.value)}
            />
            {errors['personal_info.city'] && <div className="invalid-feedback">{errors['personal_info.city']}</div>}
          </div>
          <div className="col-md-3">
            <label className="form-label">State <span className="text-danger">*</span></label>
            <select
              className={`form-select ${errors['personal_info.state'] ? 'is-invalid' : ''}`}
              value={formData.personal_info.state}
              onChange={(e) => updateFormData('personal_info', 'state', e.target.value)}
            >
              <option value="">Select State...</option>
              {US_STATES.map((st) => (
                <option key={st.abbrev} value={st.value}>{st.value}</option>
              ))}
            </select>
            {errors['personal_info.state'] && <div className="invalid-feedback">{errors['personal_info.state']}</div>}
          </div>
          <div className="col-md-3">
            <label className="form-label">ZIP Code <span className="text-danger">*</span></label>
            <input
              type="text"
              className={`form-control ${errors['personal_info.zip'] ? 'is-invalid' : ''}`}
              value={formData.personal_info.zip}
              onChange={(e) => updateFormData('personal_info', 'zip', e.target.value)}
              maxLength={5}
            />
            {errors['personal_info.zip'] && <div className="invalid-feedback">{errors['personal_info.zip']}</div>}
          </div>
          <div className="col-md-3">
            <label className="form-label">
              {formData.personal_info.state === 'Louisiana' ? 'Parish' : 'County'} <span className="text-danger">*</span>
            </label>
            {getCountiesForState(formData.personal_info.state).length > 0 ? (
              <select
                className={`form-select ${errors['personal_info.parish'] ? 'is-invalid' : ''}`}
                value={formData.personal_info.parish}
                onChange={(e) => updateFormData('personal_info', 'parish', e.target.value)}
              >
                <option value="">Select {formData.personal_info.state === 'Louisiana' ? 'Parish' : 'County'}...</option>
                {getCountiesForState(formData.personal_info.state).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className={`form-control ${errors['personal_info.parish'] ? 'is-invalid' : ''}`}
                value={formData.personal_info.parish}
                onChange={(e) => updateFormData('personal_info', 'parish', e.target.value)}
                placeholder={formData.personal_info.state ? 'Enter county' : 'Select state first'}
              />
            )}
            {errors['personal_info.parish'] && <div className="invalid-feedback">{errors['personal_info.parish']}</div>}
          </div>
        </div>

        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">Phone Number <span className="text-danger">*</span></label>
            <input
              type="tel"
              className={`form-control ${errors['personal_info.phone_number'] ? 'is-invalid' : ''}`}
              value={formData.personal_info.phone_number}
              onChange={(e) => updateFormData('personal_info', 'phone_number', handlePhoneChange(e.target.value))}
              placeholder="(504) 555-1234"
            />
            {errors['personal_info.phone_number'] && <div className="invalid-feedback">{errors['personal_info.phone_number']}</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label">Last 4 Digits of SSN <span className="text-danger">*</span></label>
            <input
              type="text"
              className={`form-control ${errors['personal_info.last_4_ssn_digits'] ? 'is-invalid' : ''}`}
              value={formData.personal_info.last_4_ssn_digits}
              onChange={(e) => updateFormData('personal_info', 'last_4_ssn_digits', e.target.value.replace(/\D/g, ''))}
              maxLength={4}
              placeholder="XXXX"
            />
            {errors['personal_info.last_4_ssn_digits'] && <div className="invalid-feedback">{errors['personal_info.last_4_ssn_digits']}</div>}
          </div>
        </div>

        {/* Second Principal Section (only for POA 2-person) */}
        {isPOA2Person && (
          <>
            <hr className="my-4" />
            <h4 className="mb-3 text-primary">Second Principal</h4>

            <div className="row mb-3">
              <div className="col-md-3">
                <label className="form-label">First Name <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${errors['spouse_info.first_name'] ? 'is-invalid' : ''}`}
                  value={formData.spouse_info.first_name}
                  onChange={(e) => updateFormData('spouse_info', 'first_name', e.target.value)}
                />
                {errors['spouse_info.first_name'] && <div className="invalid-feedback">{errors['spouse_info.first_name']}</div>}
              </div>
              <div className="col-md-3">
                <label className="form-label">Middle Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.spouse_info.middle_name}
                  onChange={(e) => updateFormData('spouse_info', 'middle_name', e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Last Name <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${errors['spouse_info.surname'] ? 'is-invalid' : ''}`}
                  value={formData.spouse_info.surname}
                  onChange={(e) => updateFormData('spouse_info', 'surname', e.target.value)}
                />
                {errors['spouse_info.surname'] && <div className="invalid-feedback">{errors['spouse_info.surname']}</div>}
              </div>
              <div className="col-md-3">
                <label className="form-label">Suffix</label>
                <select
                  className="form-select"
                  value={formData.spouse_info.suffix}
                  onChange={(e) => updateFormData('spouse_info', 'suffix', e.target.value)}
                >
                  <option value="">None</option>
                  {SUFFIX_OPTIONS.map((sfx) => (
                    <option key={sfx} value={sfx}>{sfx}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row mb-3">
              <div className="col-md-6">
                <label className="form-label">Date of Birth <span className="text-danger">*</span></label>
                <input
                  type="date"
                  className={`form-control ${errors['spouse_info.date_of_birth'] ? 'is-invalid' : ''}`}
                  value={formData.spouse_info.date_of_birth}
                  onChange={(e) => updateFormData('spouse_info', 'date_of_birth', e.target.value)}
                />
                {errors['spouse_info.date_of_birth'] && <div className="invalid-feedback">{errors['spouse_info.date_of_birth']}</div>}
              </div>
              <div className="col-md-6">
                <label className="form-label">Gender <span className="text-danger">*</span></label>
                <select
                  className={`form-select ${errors['spouse_info.gender'] ? 'is-invalid' : ''}`}
                  value={formData.spouse_info.gender}
                  onChange={(e) => updateFormData('spouse_info', 'gender', e.target.value)}
                >
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                {errors['spouse_info.gender'] && <div className="invalid-feedback">{errors['spouse_info.gender']}</div>}
              </div>
            </div>

            <div className="row mb-3">
              <div className="col-md-6">
                <label className="form-label">Phone Number <span className="text-danger">*</span></label>
                <input
                  type="tel"
                  className={`form-control ${errors['spouse_info.phone_number'] ? 'is-invalid' : ''}`}
                  value={formData.spouse_info.phone_number}
                  onChange={(e) => updateFormData('spouse_info', 'phone_number', handlePhoneChange(e.target.value))}
                  placeholder="(504) 555-1234"
                />
                {errors['spouse_info.phone_number'] && <div className="invalid-feedback">{errors['spouse_info.phone_number']}</div>}
              </div>
              <div className="col-md-6">
                <label className="form-label">Last 4 Digits of SSN <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${errors['spouse_info.last_4_ssn_digits'] ? 'is-invalid' : ''}`}
                  value={formData.spouse_info.last_4_ssn_digits}
                  onChange={(e) => updateFormData('spouse_info', 'last_4_ssn_digits', e.target.value.replace(/\D/g, ''))}
                  maxLength={4}
                  placeholder="XXXX"
                />
                {errors['spouse_info.last_4_ssn_digits'] && <div className="invalid-feedback">{errors['spouse_info.last_4_ssn_digits']}</div>}
              </div>
            </div>

            {/* Same Address Checkbox */}
            <div className="mb-3">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="same_address_as_primary"
                  checked={formData.spouse_info.same_address_as_primary}
                  onChange={(e) => updateFormData('spouse_info', 'same_address_as_primary', e.target.checked)}
                />
                <label className="form-check-label" htmlFor="same_address_as_primary">
                  Same address as first principal
                </label>
              </div>
            </div>

            {/* Address fields (shown only if different address) */}
            {!formData.spouse_info.same_address_as_primary && (
              <>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Street Address <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className={`form-control ${errors['spouse_info.street_address'] ? 'is-invalid' : ''}`}
                      value={formData.spouse_info.street_address}
                      onChange={(e) => updateFormData('spouse_info', 'street_address', e.target.value)}
                    />
                    {errors['spouse_info.street_address'] && <div className="invalid-feedback">{errors['spouse_info.street_address']}</div>}
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Street Address 2</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.spouse_info.street_address_2}
                      onChange={(e) => updateFormData('spouse_info', 'street_address_2', e.target.value)}
                      placeholder="Apt, Suite, Unit, etc."
                    />
                  </div>
                </div>

                <div className="row mb-3">
                  <div className="col-md-3">
                    <label className="form-label">City <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className={`form-control ${errors['spouse_info.city'] ? 'is-invalid' : ''}`}
                      value={formData.spouse_info.city}
                      onChange={(e) => updateFormData('spouse_info', 'city', e.target.value)}
                    />
                    {errors['spouse_info.city'] && <div className="invalid-feedback">{errors['spouse_info.city']}</div>}
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">State <span className="text-danger">*</span></label>
                    <select
                      className={`form-select ${errors['spouse_info.state'] ? 'is-invalid' : ''}`}
                      value={formData.spouse_info.state}
                      onChange={(e) => updateFormData('spouse_info', 'state', e.target.value)}
                    >
                      <option value="">Select State...</option>
                      {US_STATES.map((st) => (
                        <option key={st.abbrev} value={st.value}>{st.value}</option>
                      ))}
                    </select>
                    {errors['spouse_info.state'] && <div className="invalid-feedback">{errors['spouse_info.state']}</div>}
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">ZIP Code <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className={`form-control ${errors['spouse_info.zip'] ? 'is-invalid' : ''}`}
                      value={formData.spouse_info.zip}
                      onChange={(e) => updateFormData('spouse_info', 'zip', e.target.value)}
                      maxLength={5}
                    />
                    {errors['spouse_info.zip'] && <div className="invalid-feedback">{errors['spouse_info.zip']}</div>}
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">
                      {formData.spouse_info.state === 'Louisiana' ? 'Parish' : 'County'} <span className="text-danger">*</span>
                    </label>
                    {getCountiesForState(formData.spouse_info.state).length > 0 ? (
                      <select
                        className={`form-select ${errors['spouse_info.parish'] ? 'is-invalid' : ''}`}
                        value={formData.spouse_info.parish}
                        onChange={(e) => updateFormData('spouse_info', 'parish', e.target.value)}
                      >
                        <option value="">Select {formData.spouse_info.state === 'Louisiana' ? 'Parish' : 'County'}...</option>
                        {getCountiesForState(formData.spouse_info.state).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className={`form-control ${errors['spouse_info.parish'] ? 'is-invalid' : ''}`}
                        value={formData.spouse_info.parish}
                        onChange={(e) => updateFormData('spouse_info', 'parish', e.target.value)}
                        placeholder={formData.spouse_info.state ? 'Enter county' : 'Select state first'}
                      />
                    )}
                    {errors['spouse_info.parish'] && <div className="invalid-feedback">{errors['spouse_info.parish']}</div>}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  // For POA 2-person forms: Second Principal's Personal Information
  const renderSecondPrincipalPage = () => {
    const isPOA = formType.includes('powerOfAttorney');
    const pageTitle = isPOA ? '3. Personal Information for Second Principal' : '3. Spouse Information';
    const pageDescription = isPOA
      ? 'Enter the personal information about the second person granting powers of attorney (e.g., an adult child, aging parent, or other person):'
      : 'Enter your spouse\'s personal information below.';

    return (
      <div className="poa-page">
        <h2>{pageTitle}</h2>
        <p className="text-muted">{pageDescription}</p>

        <div className="row mb-3">
          <div className="col-md-3">
            <label className="form-label">First Name <span className="text-danger">*</span></label>
            <input
              type="text"
              className={`form-control ${errors['spouse_info.first_name'] ? 'is-invalid' : ''}`}
              value={formData.spouse_info.first_name}
              onChange={(e) => updateFormData('spouse_info', 'first_name', e.target.value)}
            />
            {errors['spouse_info.first_name'] && <div className="invalid-feedback">{errors['spouse_info.first_name']}</div>}
          </div>
          <div className="col-md-3">
            <label className="form-label">Middle Name</label>
            <input
              type="text"
              className="form-control"
              value={formData.spouse_info.middle_name}
              onChange={(e) => updateFormData('spouse_info', 'middle_name', e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Last Name <span className="text-danger">*</span></label>
            <input
              type="text"
              className={`form-control ${errors['spouse_info.surname'] ? 'is-invalid' : ''}`}
              value={formData.spouse_info.surname}
              onChange={(e) => updateFormData('spouse_info', 'surname', e.target.value)}
            />
            {errors['spouse_info.surname'] && <div className="invalid-feedback">{errors['spouse_info.surname']}</div>}
          </div>
          <div className="col-md-3">
            <label className="form-label">Suffix</label>
            <select
              className="form-select"
              value={formData.spouse_info.suffix}
              onChange={(e) => updateFormData('spouse_info', 'suffix', e.target.value)}
            >
              <option value="">None</option>
              {SUFFIX_OPTIONS.map((sfx) => (
                <option key={sfx} value={sfx}>{sfx}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">Date of Birth <span className="text-danger">*</span></label>
            <input
              type="date"
              className={`form-control ${errors['spouse_info.date_of_birth'] ? 'is-invalid' : ''}`}
              value={formData.spouse_info.date_of_birth}
              onChange={(e) => updateFormData('spouse_info', 'date_of_birth', e.target.value)}
            />
            {errors['spouse_info.date_of_birth'] && <div className="invalid-feedback">{errors['spouse_info.date_of_birth']}</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label">Gender <span className="text-danger">*</span></label>
            <select
              className={`form-select ${errors['spouse_info.gender'] ? 'is-invalid' : ''}`}
              value={formData.spouse_info.gender}
              onChange={(e) => updateFormData('spouse_info', 'gender', e.target.value)}
            >
              <option value="">Select...</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            {errors['spouse_info.gender'] && <div className="invalid-feedback">{errors['spouse_info.gender']}</div>}
          </div>
        </div>

        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">Phone Number <span className="text-danger">*</span></label>
            <input
              type="tel"
              className={`form-control ${errors['spouse_info.phone_number'] ? 'is-invalid' : ''}`}
              value={formData.spouse_info.phone_number}
              onChange={(e) => updateFormData('spouse_info', 'phone_number', handlePhoneChange(e.target.value))}
              placeholder="(504) 555-1234"
            />
            {errors['spouse_info.phone_number'] && <div className="invalid-feedback">{errors['spouse_info.phone_number']}</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label">Last 4 Digits of SSN <span className="text-danger">*</span></label>
            <input
              type="text"
              className={`form-control ${errors['spouse_info.last_4_ssn_digits'] ? 'is-invalid' : ''}`}
              value={formData.spouse_info.last_4_ssn_digits}
              onChange={(e) => updateFormData('spouse_info', 'last_4_ssn_digits', e.target.value.replace(/\D/g, ''))}
              maxLength={4}
              placeholder="XXXX"
            />
            {errors['spouse_info.last_4_ssn_digits'] && <div className="invalid-feedback">{errors['spouse_info.last_4_ssn_digits']}</div>}
          </div>
        </div>

        {/* Same Address Checkbox */}
        <div className="mb-3">
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="same_address_as_primary"
              checked={formData.spouse_info.same_address_as_primary}
              onChange={(e) => updateFormData('spouse_info', 'same_address_as_primary', e.target.checked)}
            />
            <label className="form-check-label" htmlFor="same_address_as_primary">
              Same address as {isPOA ? 'first principal' : 'primary account holder'}
            </label>
          </div>
        </div>

        {/* Address fields (shown only if different address) */}
        {!formData.spouse_info.same_address_as_primary && (
          <>
            <div className="row mb-3">
              <div className="col-md-6">
                <label className="form-label">Street Address <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${errors['spouse_info.street_address'] ? 'is-invalid' : ''}`}
                  value={formData.spouse_info.street_address}
                  onChange={(e) => updateFormData('spouse_info', 'street_address', e.target.value)}
                />
                {errors['spouse_info.street_address'] && <div className="invalid-feedback">{errors['spouse_info.street_address']}</div>}
              </div>
              <div className="col-md-6">
                <label className="form-label">Street Address 2</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.spouse_info.street_address_2}
                  onChange={(e) => updateFormData('spouse_info', 'street_address_2', e.target.value)}
                  placeholder="Apt, Suite, Unit, etc."
                />
              </div>
            </div>

            <div className="row mb-3">
              <div className="col-md-3">
                <label className="form-label">City <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${errors['spouse_info.city'] ? 'is-invalid' : ''}`}
                  value={formData.spouse_info.city}
                  onChange={(e) => updateFormData('spouse_info', 'city', e.target.value)}
                />
                {errors['spouse_info.city'] && <div className="invalid-feedback">{errors['spouse_info.city']}</div>}
              </div>
              <div className="col-md-3">
                <label className="form-label">State <span className="text-danger">*</span></label>
                <select
                  className={`form-select ${errors['spouse_info.state'] ? 'is-invalid' : ''}`}
                  value={formData.spouse_info.state}
                  onChange={(e) => updateFormData('spouse_info', 'state', e.target.value)}
                >
                  <option value="">Select State...</option>
                  {US_STATES.map((st) => (
                    <option key={st.abbrev} value={st.value}>{st.value}</option>
                  ))}
                </select>
                {errors['spouse_info.state'] && <div className="invalid-feedback">{errors['spouse_info.state']}</div>}
              </div>
              <div className="col-md-3">
                <label className="form-label">ZIP Code <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${errors['spouse_info.zip'] ? 'is-invalid' : ''}`}
                  value={formData.spouse_info.zip}
                  onChange={(e) => updateFormData('spouse_info', 'zip', e.target.value)}
                  maxLength={5}
                />
                {errors['spouse_info.zip'] && <div className="invalid-feedback">{errors['spouse_info.zip']}</div>}
              </div>
              <div className="col-md-3">
                <label className="form-label">
                  {formData.spouse_info.state === 'Louisiana' ? 'Parish' : 'County'} <span className="text-danger">*</span>
                </label>
                {getCountiesForState(formData.spouse_info.state).length > 0 ? (
                  <select
                    className={`form-select ${errors['spouse_info.parish'] ? 'is-invalid' : ''}`}
                    value={formData.spouse_info.parish}
                    onChange={(e) => updateFormData('spouse_info', 'parish', e.target.value)}
                  >
                    <option value="">Select {formData.spouse_info.state === 'Louisiana' ? 'Parish' : 'County'}...</option>
                    {getCountiesForState(formData.spouse_info.state).map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className={`form-control ${errors['spouse_info.parish'] ? 'is-invalid' : ''}`}
                    value={formData.spouse_info.parish}
                    onChange={(e) => updateFormData('spouse_info', 'parish', e.target.value)}
                    placeholder={formData.spouse_info.state ? 'Enter county' : 'Select state first'}
                  />
                )}
                {errors['spouse_info.parish'] && <div className="invalid-feedback">{errors['spouse_info.parish']}</div>}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderAgentsPage = () => (
    <div className="poa-page">
      <h2>3. People or Entities Who Will Serve as Agents</h2>
      <p className="text-muted">Add the people or entities you want to serve as your agents (attorneys-in-fact).</p>

      {errors['agents'] && <div className="alert alert-danger">{errors['agents']}</div>}

      {(formData.people_or_entities_who_will_serve_as_agents?.parties || []).map((party, index) => (
        <div key={party.id} className="card mb-3">
          <div className="card-header d-flex justify-content-between align-items-center">
            <strong>{getPartyDisplayName(party) || `Agent ${index + 1}`}</strong>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => removeParty(index)}
            >
              <i className="fas fa-trash"></i> Remove
            </button>
          </div>
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label">Type of Party <span className="text-danger">*</span></label>
              <div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name={`party_type_${index}`}
                    value="An individual person"
                    checked={party.type_of_party === 'An individual person'}
                    onChange={(e) => updateParty(index, 'type_of_party', e.target.value)}
                  />
                  <label className="form-check-label">An individual person</label>
                </div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name={`party_type_${index}`}
                    value="An entity"
                    checked={party.type_of_party === 'An entity'}
                    onChange={(e) => updateParty(index, 'type_of_party', e.target.value)}
                  />
                  <label className="form-check-label">An entity (company, trust, etc.)</label>
                </div>
              </div>
            </div>

            {party.type_of_party === 'An individual person' && (
              <>
                <div className="row mb-3">
                  <div className="col-md-4">
                    <label className="form-label">First Name <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.first_name}
                      onChange={(e) => updateParty(index, 'first_name', e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Middle Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.middle_name}
                      onChange={(e) => updateParty(index, 'middle_name', e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Last Name <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.surname}
                      onChange={(e) => updateParty(index, 'surname', e.target.value)}
                    />
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-4">
                    <label className="form-label">Date of Birth <span className="text-danger">*</span></label>
                    <input
                      type="date"
                      className="form-control"
                      value={party.date_of_birth}
                      onChange={(e) => updateParty(index, 'date_of_birth', e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Gender <span className="text-danger">*</span></label>
                    <select
                      className="form-select"
                      value={party.gender}
                      onChange={(e) => updateParty(index, 'gender', e.target.value)}
                    >
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Street Address</label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.street_address || ''}
                      onChange={(e) => updateParty(index, 'street_address', e.target.value)}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Second line of street address, if any (Apt. or Suite No.)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.street_address_2 || ''}
                      onChange={(e) => updateParty(index, 'street_address_2', e.target.value)}
                    />
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-3">
                    <label className="form-label">City</label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.city || ''}
                      onChange={(e) => updateParty(index, 'city', e.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">State</label>
                    <select
                      className="form-select"
                      value={party.state || ''}
                      onChange={(e) => updateParty(index, 'state', e.target.value)}
                    >
                      <option value="">Select...</option>
                      {US_STATES.map((st) => (
                        <option key={st.abbrev} value={st.value}>{st.value}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Zip</label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.zip || ''}
                      onChange={(e) => updateParty(index, 'zip', e.target.value)}
                      maxLength={10}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Parish or County</label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.parish || ''}
                      onChange={(e) => updateParty(index, 'parish', e.target.value)}
                      placeholder="Do not include 'Parish' or 'County'"
                    />
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-4">
                    <label className="form-label">Your relationship with this person <span className="text-danger">*</span></label>
                    <select
                      className="form-select"
                      value={party.relationship_with_person}
                      onChange={(e) => updateParty(index, 'relationship_with_person', e.target.value)}
                    >
                      <option value="">Select...</option>
                      {RELATIONSHIP_OPTIONS.map((rel) => (
                        <option key={rel} value={rel}>{rel}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Last 4 digits SSN <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.last_4_ssn_digits}
                      onChange={(e) => updateParty(index, 'last_4_ssn_digits', e.target.value.replace(/\D/g, ''))}
                      maxLength={4}
                    />
                  </div>
                </div>
              </>
            )}

            {party.type_of_party === 'An entity' && (
              <>
                <div className="row mb-3">
                  <div className="col-md-8">
                    <label className="form-label">Entity Name <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.entity_name}
                      onChange={(e) => updateParty(index, 'entity_name', e.target.value)}
                      placeholder="e.g., ABC Company, LLC"
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Last 4 EIN Digits</label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.last_4_ein_digits}
                      onChange={(e) => updateParty(index, 'last_4_ein_digits', e.target.value.replace(/\D/g, ''))}
                      maxLength={4}
                    />
                  </div>
                </div>

                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Entity Type <span className="text-danger">*</span></label>
                    <select
                      className="form-select"
                      value={party.entity_type}
                      onChange={(e) => updateParty(index, 'entity_type', e.target.value)}
                    >
                      <option value="">Select Entity Type...</option>
                      {ENTITY_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Authorized Signers for Entity */}
                <div className="mb-3">
                  <label className="form-label">
                    <strong>Authorized Signers</strong>
                    <span className="text-muted ms-2">(Person(s) who will sign on behalf of the entity)</span>
                  </label>

                  {(party.signers || []).map((signer, signerIndex) => (
                    <div key={signerIndex} className="card card-body bg-light mb-2">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <small className="text-muted">Signer {signerIndex + 1}</small>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => removeSigner(index, signerIndex)}
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                      <div className="row">
                        <div className="col-md-3 mb-2">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="First Name"
                            value={signer.first_name}
                            onChange={(e) => updateSigner(index, signerIndex, 'first_name', e.target.value)}
                          />
                        </div>
                        <div className="col-md-2 mb-2">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Middle"
                            value={signer.middle_name}
                            onChange={(e) => updateSigner(index, signerIndex, 'middle_name', e.target.value)}
                          />
                        </div>
                        <div className="col-md-3 mb-2">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Last Name"
                            value={signer.surname}
                            onChange={(e) => updateSigner(index, signerIndex, 'surname', e.target.value)}
                          />
                        </div>
                        <div className="col-md-2 mb-2">
                          <select
                            className="form-select form-select-sm"
                            value={signer.suffix}
                            onChange={(e) => updateSigner(index, signerIndex, 'suffix', e.target.value)}
                            title="Suffix (Jr., Sr., III, etc.)"
                          >
                            <option value="">Suffix</option>
                            {SUFFIX_OPTIONS.map((sfx) => (
                              <option key={sfx} value={sfx}>{sfx}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-2 mb-2">
                          <select
                            className="form-select form-select-sm"
                            value={signer.title}
                            onChange={(e) => updateSigner(index, signerIndex, 'title', e.target.value)}
                          >
                            <option value="">Title...</option>
                            {ENTITY_ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => addSigner(index)}
                  >
                    <i className="fas fa-plus me-1"></i>
                    Add Signer
                  </button>
                </div>
              </>
            )}

            <div className="mb-3">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={party.same_address_as_person_granting_power_of_attorney}
                  onChange={(e) => updateParty(index, 'same_address_as_person_granting_power_of_attorney', e.target.checked)}
                />
                <label className="form-check-label">Same address as {getPrincipalFullName()}</label>
              </div>
            </div>

            {!party.same_address_as_person_granting_power_of_attorney && (
              <div className="row mb-3">
                <div className="col-md-6">
                  <label className="form-label">Street Address</label>
                  <input
                    type="text"
                    className="form-control"
                    value={party.street_address}
                    onChange={(e) => updateParty(index, 'street_address', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Street Address 2</label>
                  <input
                    type="text"
                    className="form-control"
                    value={party.street_address_2}
                    onChange={(e) => updateParty(index, 'street_address_2', e.target.value)}
                  />
                </div>
                <div className="col-md-3 mt-2">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-control"
                    value={party.city}
                    onChange={(e) => updateParty(index, 'city', e.target.value)}
                  />
                </div>
                <div className="col-md-3 mt-2">
                  <label className="form-label">State</label>
                  <select
                    className="form-select"
                    value={party.state}
                    onChange={(e) => updateParty(index, 'state', e.target.value)}
                  >
                    <option value="">Select State...</option>
                    {US_STATES.map((st) => (
                      <option key={st.abbrev} value={st.value}>{st.value}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3 mt-2">
                  <label className="form-label">ZIP Code</label>
                  <input
                    type="text"
                    className="form-control"
                    value={party.zip}
                    onChange={(e) => updateParty(index, 'zip', e.target.value)}
                    maxLength={5}
                  />
                </div>
                <div className="col-md-3 mt-2">
                  <label className="form-label">
                    {party.state === 'Louisiana' ? 'Parish' : 'County'}
                  </label>
                  {getCountiesForState(party.state || '').length > 0 ? (
                    <select
                      className="form-select"
                      value={party.parish}
                      onChange={(e) => updateParty(index, 'parish', e.target.value)}
                    >
                      <option value="">Select {party.state === 'Louisiana' ? 'Parish' : 'County'}...</option>
                      {getCountiesForState(party.state || '').map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-control"
                      value={party.parish}
                      onChange={(e) => updateParty(index, 'parish', e.target.value)}
                      placeholder={party.state ? `Enter county` : 'Select state first'}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      <button type="button" className="btn btn-outline-primary" onClick={addParty}>
        <i className="fas fa-plus me-2"></i> Add Another Party
      </button>
    </div>
  );

  const renderPlanContentsPage = () => {
    const isTrust = formType.includes('trustBased');
    const isWill = formType.includes('willBased') || formType.includes('minorChild');

    return (
      <div className="poa-page">
        <h2>4. Plan Contents</h2>
        <p><em><strong>In the following steps you will enter information to create the following documents:</strong></em></p>
        <ul className="mb-4" style={{ listStyleType: 'disc', paddingLeft: '2.5rem' }}>
          {/* Trust-specific documents */}
          {isTrust && (
            <>
              <li><em>Revocable Living Trust Agreement</em></li>
              <li><em>Certificate of Trust</em></li>
              <li><em>Pour-Over Will</em></li>
              <li><em>Trust Funding Instructions</em></li>
            </>
          )}
          {/* Will-specific documents */}
          {isWill && (
            <>
              <li><em>Last Will and Testament</em></li>
              <li><em>Will Attestation</em></li>
            </>
          )}
          {/* POA documents (all plans) */}
          <li><em>Durable Financial Power of Attorney</em></li>
          <li><em>Durable Medical Power of Attorney</em></li>
          <li><em>Advance Healthcare Directive (a/k/a Living Will)</em></li>
          <li><em>HIPAA Release</em></li>
        </ul>
        <p>If you wish to add, remove, or edit personal information about any person to be included in your GeauxPlan, simply return to the previous steps. Your revisions will then be available in the following steps.</p>
      </div>
    );
  };

  const renderFPOAPage = () => {
    const parties = formData.people_or_entities_who_will_serve_as_agents?.parties || [];
    const isTwoPerson = formType.includes('2Person');
    const isPOA = formType.includes('powerOfAttorney');
    const secondPersonLabel = isPOA ? 'Second Principal' : 'Spouse';
    const getSecondPersonName = () => formData.spouse_info.first_name || secondPersonLabel;

    return (
      <div className="poa-page">
        <h2>5. Financial Power of Attorney for {getPrincipalFullName()}</h2>
        <p className="text-muted mb-3">
          A Financial Power of Attorney gives a person, called an Agent, the authority to make financial decisions for
          you if you become incapacitated or otherwise unable to manage your own affairs. Agents can pay your bills,
          manage your investments and financial accounts, and other similar tasks.
        </p>
        <p className="text-muted mb-4">
          <em>If you did not enter an Agent for this Principal on the "Agents" step (Step 3), please return to Step 3
          and enter at least one Agent before continuing.</em>
        </p>

        <p className="mb-3">Select the initial agent(s) for {getPrincipalFullName()}'s Financial Power of Attorney:</p>
        <div className="card mb-3">
          <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
            <span>Item</span>
            <span>−</span>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Select the person you want to serve:</label>
                <select
                  className="form-select"
                  value={formData.fpoa.fpoa_initial_agents.person_to_serve}
                  onChange={(e) => updateNestedFormData('fpoa.fpoa_initial_agents.person_to_serve', e.target.value)}
                >
                  <option value="">Initial Agent</option>
                  {isTwoPerson && (
                    <option value="spouse">My Spouse</option>
                  )}
                  {parties.map((party) => (
                    <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">If you want to appoint a second person (a Co-Agent) to serve at the same time as the Initial Agent, select them here:</label>
                <select
                  className="form-select"
                  value={formData.fpoa.fpoa_initial_agents.second_coagent_person_to_serve}
                  onChange={(e) => updateNestedFormData('fpoa.fpoa_initial_agents.second_coagent_person_to_serve', e.target.value)}
                >
                  <option value="">Initial Co-Agent (if any)</option>
                  {parties.map((party) => (
                    <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                  ))}
                </select>
              </div>
            </div>
            {formData.fpoa.fpoa_initial_agents.second_coagent_person_to_serve && (
              <div className="mb-3">
                <label className="form-label">Can each agent act independently?</label>
                <div>
                  <div className="form-check form-check-inline">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="fpoa_serve_alone"
                      value="Yes"
                      checked={formData.fpoa.fpoa_initial_agents.agents_serve_alone === 'Yes'}
                      onChange={(e) => updateNestedFormData('fpoa.fpoa_initial_agents.agents_serve_alone', e.target.value)}
                    />
                    <label className="form-check-label">Yes - Each agent can act alone</label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="fpoa_serve_alone"
                      value="No"
                      checked={formData.fpoa.fpoa_initial_agents.agents_serve_alone === 'No'}
                      onChange={(e) => updateNestedFormData('fpoa.fpoa_initial_agents.agents_serve_alone', e.target.value)}
                    />
                    <label className="form-check-label">No - Agents must act together</label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Will Successor Agent(s) be appointed for {getPrincipalFullName()}'s Financial Power of Attorney?</label>
          <div>
            <div className="form-check form-check-inline">
              <input
                type="radio"
                className="form-check-input"
                name="fpoa_successors"
                value="Yes"
                checked={formData.fpoa.has_appointer_successor_agents === 'Yes'}
                onChange={(e) => updateNestedFormData('fpoa.has_appointer_successor_agents', e.target.value)}
              />
              <label className="form-check-label">Yes</label>
            </div>
            <div className="form-check form-check-inline">
              <input
                type="radio"
                className="form-check-input"
                name="fpoa_successors"
                value="No"
                checked={formData.fpoa.has_appointer_successor_agents === 'No'}
                onChange={(e) => updateNestedFormData('fpoa.has_appointer_successor_agents', e.target.value)}
              />
              <label className="form-check-label">No</label>
            </div>
          </div>
        </div>

        {/* Successor Agents Section - appears when Yes is selected */}
        {formData.fpoa.has_appointer_successor_agents === 'Yes' && (
          <>
            <p className="text-muted mb-2">
              The successor agents will serve if all of the initial Agents are unable to serve.
              These successor Agents will serve in the order they are entered.
              Successor agents are not required, but are usually recommended.
            </p>
            <p className="mb-3">Select the successor agents for {getPrincipalFullName()}'s Financial Power of Attorney:</p>

            {(formData.fpoa.successor_agents || []).map((agent, index) => (
              <div key={index} className="card mb-2">
                <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                  <span>{getOrdinalLabel(index)} Successor Agent(s)</span>
                  <div>
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-white"
                      onClick={() => removeSuccessorAgent('fpoa', index)}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Select the person you want to serve:</label>
                      <select
                        className="form-select"
                        value={agent.successor_agent_to_serve || ''}
                        onChange={(e) => updateSuccessorAgent('fpoa', index, 'successor_agent_to_serve', e.target.value)}
                      >
                        <option value="">Successor Agent</option>
                        {parties.map((party) => (
                          <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">If you want to appoint a second person (a Co-Agent) to serve as Successor Agent, select them here:</label>
                      <select
                        className="form-select"
                        value={agent.second_successor_coagent_to_serve || ''}
                        onChange={(e) => updateSuccessorAgent('fpoa', index, 'second_successor_coagent_to_serve', e.target.value)}
                      >
                        <option value="">Successor Co-Agent (if any)</option>
                        {parties.map((party) => (
                          <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-outline-primary mb-3"
              onClick={() => addSuccessorAgent('fpoa')}
            >
              + Add {getOrdinalLabel((formData.fpoa.successor_agents || []).length)} Successor Agent(s)
            </button>
          </>
        )}

        {/* Second Principal FPOA Section for 2-person forms */}
        {isTwoPerson && (
          <>
            <hr className="my-5" />
            <h2>5. Financial Power of Attorney for {getSecondPersonName()}</h2>
            <p className="text-muted mb-3">
              A Financial Power of Attorney gives a person, called an Agent, the authority to make financial decisions for
              you if you become incapacitated or otherwise unable to manage your own affairs. Agents can pay your bills,
              manage your investments and financial accounts, and other similar tasks.
            </p>
            <p className="text-muted mb-4">
              <em>If you did not enter an Agent for this Principal on the "Agents" step (Step 3), please return to Step 3
              and enter at least one Agent before continuing.</em>
            </p>

            <p className="mb-3">Select the initial agent(s) for {getSecondPersonName()}'s Financial Power of Attorney:</p>
            <div className="card mb-3">
              <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                <span>Item</span>
                <span>−</span>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Select the person you want to serve:</label>
                    <select
                      className="form-select"
                      value={formData.spouse_fpoa.fpoa_initial_agents.person_to_serve}
                      onChange={(e) => updateNestedFormData('spouse_fpoa.fpoa_initial_agents.person_to_serve', e.target.value)}
                    >
                      <option value="">Initial Agent</option>
                      <option value="client">{formData.personal_info.first_name || 'First Principal'} ({isPOA ? 'First Principal' : 'My Spouse'})</option>
                      {parties.map((party) => (
                        <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">If you want to appoint a second person (a Co-Agent) to serve at the same time as the Initial Agent, select them here:</label>
                    <select
                      className="form-select"
                      value={formData.spouse_fpoa.fpoa_initial_agents.second_coagent_person_to_serve}
                      onChange={(e) => updateNestedFormData('spouse_fpoa.fpoa_initial_agents.second_coagent_person_to_serve', e.target.value)}
                    >
                      <option value="">Initial Co-Agent (if any)</option>
                      {parties.map((party) => (
                        <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {formData.spouse_fpoa.fpoa_initial_agents.second_coagent_person_to_serve && (
                  <div className="mb-3">
                    <label className="form-label">Can each agent act independently?</label>
                    <div>
                      <div className="form-check form-check-inline">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="spouse_fpoa_serve_alone"
                          value="Yes"
                          checked={formData.spouse_fpoa.fpoa_initial_agents.agents_serve_alone === 'Yes'}
                          onChange={(e) => updateNestedFormData('spouse_fpoa.fpoa_initial_agents.agents_serve_alone', e.target.value)}
                        />
                        <label className="form-check-label">Yes - Each agent can act alone</label>
                      </div>
                      <div className="form-check form-check-inline">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="spouse_fpoa_serve_alone"
                          value="No"
                          checked={formData.spouse_fpoa.fpoa_initial_agents.agents_serve_alone === 'No'}
                          onChange={(e) => updateNestedFormData('spouse_fpoa.fpoa_initial_agents.agents_serve_alone', e.target.value)}
                        />
                        <label className="form-check-label">No - Agents must act together</label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Will Successor Agent(s) be appointed for {getSecondPersonName()}'s Financial Power of Attorney?</label>
              <div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="spouse_fpoa_successors"
                    value="Yes"
                    checked={formData.spouse_fpoa.has_appointer_successor_agents === 'Yes'}
                    onChange={(e) => updateNestedFormData('spouse_fpoa.has_appointer_successor_agents', e.target.value)}
                  />
                  <label className="form-check-label">Yes</label>
                </div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="spouse_fpoa_successors"
                    value="No"
                    checked={formData.spouse_fpoa.has_appointer_successor_agents === 'No'}
                    onChange={(e) => updateNestedFormData('spouse_fpoa.has_appointer_successor_agents', e.target.value)}
                  />
                  <label className="form-check-label">No</label>
                </div>
              </div>
            </div>

            {/* Spouse FPOA Successor Agents Section */}
            {formData.spouse_fpoa.has_appointer_successor_agents === 'Yes' && (
              <>
                <p className="text-muted mb-2">
                  The successor agents will serve if all of the initial Agents are unable to serve.
                  These successor Agents will serve in the order they are entered.
                </p>
                <p className="mb-3">Select the successor agents for {getSecondPersonName()}'s Financial Power of Attorney:</p>

                {(formData.spouse_fpoa.successor_agents || []).map((agent, index) => (
                  <div key={index} className="card mb-2">
                    <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                      <span>{getOrdinalLabel(index)} Successor Agent(s)</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-white"
                        onClick={() => removeSuccessorAgent('spouse_fpoa', index)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-6 mb-3">
                          <label className="form-label">Select the person you want to serve:</label>
                          <select
                            className="form-select"
                            value={agent.successor_agent_to_serve || ''}
                            onChange={(e) => updateSuccessorAgent('spouse_fpoa', index, 'successor_agent_to_serve', e.target.value)}
                          >
                            <option value="">Successor Agent</option>
                            <option value="client">{formData.personal_info.first_name || 'Client'} ({isPOA ? 'First Principal' : 'My Spouse'})</option>
                            {parties.map((party) => (
                              <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-6 mb-3">
                          <label className="form-label">If you want to appoint a Co-Agent as Successor, select them here:</label>
                          <select
                            className="form-select"
                            value={agent.second_successor_coagent_to_serve || ''}
                            onChange={(e) => updateSuccessorAgent('spouse_fpoa', index, 'second_successor_coagent_to_serve', e.target.value)}
                          >
                            <option value="">Successor Co-Agent (if any)</option>
                            {parties.map((party) => (
                              <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="btn btn-outline-primary mb-3"
                  onClick={() => addSuccessorAgent('spouse_fpoa')}
                >
                  + Add {getOrdinalLabel((formData.spouse_fpoa.successor_agents || []).length)} Successor Agent(s)
                </button>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const renderHCPOAPage = () => {
    const parties = formData.people_or_entities_who_will_serve_as_agents?.parties || [];
    const isTwoPerson = formType.includes('2Person');
    const isPOA = formType.includes('powerOfAttorney');
    const secondPersonLabel = isPOA ? 'Second Principal' : 'Spouse';
    const getSecondPersonName = () => formData.spouse_info.first_name || secondPersonLabel;

    return (
      <div className="poa-page">
        <h2>6. Healthcare Power of Attorney For {getPrincipalFullName()}</h2>
        <p className="text-muted mb-3">
          A Healthcare Power of Attorney (HCPOA) is a legal document that allows an individual (the "Principal") to
          designate another person (an "Agent") to make medical decisions for him or her when he or she cannot make
          decisions for himself or herself.
        </p>
        <p className="text-muted mb-3">
          Healthcare decisions include the power to consent, refuse to consent, or withdraw consent to any type of
          medical care, treatment, service or procedure, as well as accessing protected health information, and
          making care arrangements.
        </p>
        <p className="text-muted mb-3">
          The Healthcare Power of Attorney will be effective immediately upon execution by the Principal and Agent.
        </p>
        <p className="text-muted mb-3">
          The Healthcare Power of Attorney is "durable", which means it will remain effective until the earlier of
          the death of the Principal or until it is expressly revoked, and shall not be affected by the subsequent
          disability, incapacity, or other condition of Principal making express revocation impossible or impracticable.
        </p>
        <p className="text-muted mb-4">
          You can designate a single Agent who will serve alone, or you may designate Co-Agents who will serve at
          the same time. If you designate Co-Agents, then decisions must be made jointly by mutual consent.
        </p>

        <div className="alert alert-light border mb-4">
          <strong>If you do not see the name of the person or entity you wish to designate as an Agent:</strong>
          <div className="d-flex align-items-center mt-2 flex-wrap">
            <span>Return to Step 3</span>
            <span className="mx-2">&rarr;</span>
            <span>Select "yes" that the person will serve as Financial Agent or Medical Agent</span>
            <span className="mx-2">&rarr;</span>
            <span>Add the last 4 digits of the SSN or EIN as appropriate.</span>
            <span className="ms-2 text-success">&#10003;</span>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Does {getPrincipalFullName()} wish to be an organ donor?</label>
          <div>
            <div className="form-check form-check-inline">
              <input
                type="radio"
                className="form-check-input"
                name="organ_donor"
                value="Yes"
                checked={formData.hcpoa.wish_to_be_organ_donor === 'Yes'}
                onChange={(e) => updateNestedFormData('hcpoa.wish_to_be_organ_donor', e.target.value)}
              />
              <label className="form-check-label">Yes</label>
            </div>
            <div className="form-check form-check-inline">
              <input
                type="radio"
                className="form-check-input"
                name="organ_donor"
                value="No"
                checked={formData.hcpoa.wish_to_be_organ_donor === 'No'}
                onChange={(e) => updateNestedFormData('hcpoa.wish_to_be_organ_donor', e.target.value)}
              />
              <label className="form-check-label">No</label>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="form-label">Does {getPrincipalFullName()} wish to donate their body to science?</label>
          <div>
            <div className="form-check form-check-inline">
              <input
                type="radio"
                className="form-check-input"
                name="donate_science"
                value="Yes"
                checked={formData.hcpoa.wish_to_donate_body_to_science === 'Yes'}
                onChange={(e) => updateNestedFormData('hcpoa.wish_to_donate_body_to_science', e.target.value)}
              />
              <label className="form-check-label">Yes</label>
            </div>
            <div className="form-check form-check-inline">
              <input
                type="radio"
                className="form-check-input"
                name="donate_science"
                value="No"
                checked={formData.hcpoa.wish_to_donate_body_to_science === 'No'}
                onChange={(e) => updateNestedFormData('hcpoa.wish_to_donate_body_to_science', e.target.value)}
              />
              <label className="form-check-label">No</label>
            </div>
          </div>
        </div>

        <p className="mb-3">Select the initial agent(s) for {getPrincipalFullName()}'s Healthcare Power of Attorney:</p>
        <div className="card mb-3">
          <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
            <span>Item</span>
            <span>−</span>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Select the person you want to serve:</label>
                <select
                  className="form-select"
                  value={formData.hcpoa.hcpoa_initial_agents.person_to_serve}
                  onChange={(e) => updateNestedFormData('hcpoa.hcpoa_initial_agents.person_to_serve', e.target.value)}
                >
                  <option value="">Initial Agent</option>
                  {isTwoPerson && (
                    <option value="spouse">My Spouse</option>
                  )}
                  {parties.map((party) => (
                    <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">If you want to appoint a second person (a Co-Agent) to serve at the same time as the Initial Agent, select them here:</label>
                <select
                  className="form-select"
                  value={formData.hcpoa.hcpoa_initial_agents.second_coagent_person_to_serve}
                  onChange={(e) => updateNestedFormData('hcpoa.hcpoa_initial_agents.second_coagent_person_to_serve', e.target.value)}
                >
                  <option value="">Initial Co-Agent (if any)</option>
                  {parties.map((party) => (
                    <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                  ))}
                </select>
              </div>
            </div>
            {formData.hcpoa.hcpoa_initial_agents.second_coagent_person_to_serve && (
              <div className="mb-3">
                <label className="form-label">Can each agent act independently?</label>
                <div>
                  <div className="form-check form-check-inline">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="hcpoa_serve_alone"
                      value="Yes"
                      checked={formData.hcpoa.hcpoa_initial_agents.agents_serve_alone === 'Yes'}
                      onChange={(e) => updateNestedFormData('hcpoa.hcpoa_initial_agents.agents_serve_alone', e.target.value)}
                    />
                    <label className="form-check-label">Yes - Each can act alone</label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="hcpoa_serve_alone"
                      value="No"
                      checked={formData.hcpoa.hcpoa_initial_agents.agents_serve_alone === 'No'}
                      onChange={(e) => updateNestedFormData('hcpoa.hcpoa_initial_agents.agents_serve_alone', e.target.value)}
                    />
                    <label className="form-check-label">No - Must act together</label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Will Successor Agent(s) be appointed for {getPrincipalFullName()}'s Healthcare Power of Attorney?</label>
          <div>
            <div className="form-check form-check-inline">
              <input
                type="radio"
                className="form-check-input"
                name="hcpoa_successors"
                value="Yes"
                checked={formData.hcpoa.has_appointed_successor_agents === 'Yes'}
                onChange={(e) => updateNestedFormData('hcpoa.has_appointed_successor_agents', e.target.value)}
              />
              <label className="form-check-label">Yes</label>
            </div>
            <div className="form-check form-check-inline">
              <input
                type="radio"
                className="form-check-input"
                name="hcpoa_successors"
                value="No"
                checked={formData.hcpoa.has_appointed_successor_agents === 'No'}
                onChange={(e) => updateNestedFormData('hcpoa.has_appointed_successor_agents', e.target.value)}
              />
              <label className="form-check-label">No</label>
            </div>
          </div>
        </div>

        {/* Successor Agents Section - appears when Yes is selected */}
        {formData.hcpoa.has_appointed_successor_agents === 'Yes' && (
          <>
            <p className="text-muted mb-2">
              The successor agents will serve if all of the initial Agents are unable to serve.
              These successor Agents will serve in the order they are entered.
              Successor agents are not required, but are usually recommended.
            </p>
            <p className="mb-3">Select the successor agents for {getPrincipalFullName()}'s Healthcare Power of Attorney:</p>

            {(formData.hcpoa.successor_agents || []).map((agent, index) => (
              <div key={index} className="card mb-2">
                <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                  <span>{getOrdinalLabel(index)} Successor Agent(s)</span>
                  <div>
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-white"
                      onClick={() => removeSuccessorAgent('hcpoa', index)}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Select the person you want to serve:</label>
                      <select
                        className="form-select"
                        value={agent.successor_agent_to_serve || ''}
                        onChange={(e) => updateSuccessorAgent('hcpoa', index, 'successor_agent_to_serve', e.target.value)}
                      >
                        <option value="">Successor Agent</option>
                        {parties.map((party) => (
                          <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">If you want to appoint a second person (a Co-Agent) to serve as Successor Agent, select them here:</label>
                      <select
                        className="form-select"
                        value={agent.second_successor_coagent_to_serve || ''}
                        onChange={(e) => updateSuccessorAgent('hcpoa', index, 'second_successor_coagent_to_serve', e.target.value)}
                      >
                        <option value="">Successor Co-Agent (if any)</option>
                        {parties.map((party) => (
                          <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-outline-primary mb-3"
              onClick={() => addSuccessorAgent('hcpoa')}
            >
              + Add {getOrdinalLabel((formData.hcpoa.successor_agents || []).length)} Successor Agent(s)
            </button>
          </>
        )}

        {/* Second Principal HCPOA Section for 2-person forms */}
        {isTwoPerson && (
          <>
            <hr className="my-5" />
            <h2>Healthcare Power of Attorney For {getSecondPersonName()}</h2>
            <p className="text-muted mb-3">
              A Healthcare Power of Attorney (HCPOA) is a legal document that allows an individual (the "Principal") to
              designate another person (an "Agent") to make medical decisions for him or her when he or she cannot make
              decisions for himself or herself.
            </p>
            <p className="text-muted mb-3">
              Healthcare decisions include the power to consent, refuse to consent, or withdraw consent to any type of
              medical care, treatment, service or procedure, as well as accessing protected health information, and
              making care arrangements.
            </p>
            <p className="text-muted mb-3">
              The Healthcare Power of Attorney will be effective immediately upon execution by the Principal and Agent.
            </p>
            <p className="text-muted mb-3">
              The Healthcare Power of Attorney is "durable", which means it will remain effective until the earlier of
              the death of the Principal or until it is expressly revoked, and shall not be affected by the subsequent
              disability, incapacity, or other condition of Principal making express revocation impossible or impracticable.
            </p>
            <p className="text-muted mb-4">
              You can designate a single Agent who will serve alone, or you may designate Co-Agents who will serve at
              the same time. If you designate Co-Agents, then decisions must be made jointly by mutual consent.
            </p>

            <div className="mb-3">
              <label className="form-label">Does {getSecondPersonName()} wish to be an organ donor?</label>
              <div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="spouse_organ_donor"
                    value="Yes"
                    checked={formData.spouse_hcpoa.wish_to_be_organ_donor === 'Yes'}
                    onChange={(e) => updateNestedFormData('spouse_hcpoa.wish_to_be_organ_donor', e.target.value)}
                  />
                  <label className="form-check-label">Yes</label>
                </div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="spouse_organ_donor"
                    value="No"
                    checked={formData.spouse_hcpoa.wish_to_be_organ_donor === 'No'}
                    onChange={(e) => updateNestedFormData('spouse_hcpoa.wish_to_be_organ_donor', e.target.value)}
                  />
                  <label className="form-check-label">No</label>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label">Does {getSecondPersonName()} wish to donate their body to science?</label>
              <div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="spouse_donate_science"
                    value="Yes"
                    checked={formData.spouse_hcpoa.wish_to_donate_body_to_science === 'Yes'}
                    onChange={(e) => updateNestedFormData('spouse_hcpoa.wish_to_donate_body_to_science', e.target.value)}
                  />
                  <label className="form-check-label">Yes</label>
                </div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="spouse_donate_science"
                    value="No"
                    checked={formData.spouse_hcpoa.wish_to_donate_body_to_science === 'No'}
                    onChange={(e) => updateNestedFormData('spouse_hcpoa.wish_to_donate_body_to_science', e.target.value)}
                  />
                  <label className="form-check-label">No</label>
                </div>
              </div>
            </div>

            <p className="mb-3">Select the initial agent(s) for {getSecondPersonName()}'s Healthcare Power of Attorney:</p>
            <div className="card mb-3">
              <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                <span>Item</span>
                <span>−</span>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Select the person you want to serve:</label>
                    <select
                      className="form-select"
                      value={formData.spouse_hcpoa.hcpoa_initial_agents.person_to_serve}
                      onChange={(e) => updateNestedFormData('spouse_hcpoa.hcpoa_initial_agents.person_to_serve', e.target.value)}
                    >
                      <option value="">Initial Agent</option>
                      <option value="client">{formData.personal_info.first_name || 'First Principal'} ({isPOA ? 'First Principal' : 'My Spouse'})</option>
                      {parties.map((party) => (
                        <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">If you want to appoint a second person (a Co-Agent) to serve at the same time as the Initial Agent, select them here:</label>
                    <select
                      className="form-select"
                      value={formData.spouse_hcpoa.hcpoa_initial_agents.second_coagent_person_to_serve}
                      onChange={(e) => updateNestedFormData('spouse_hcpoa.hcpoa_initial_agents.second_coagent_person_to_serve', e.target.value)}
                    >
                      <option value="">Initial Co-Agent (if any)</option>
                      {parties.map((party) => (
                        <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {formData.spouse_hcpoa.hcpoa_initial_agents.second_coagent_person_to_serve && (
                  <div className="mb-3">
                    <label className="form-label">Can each agent act independently?</label>
                    <div>
                      <div className="form-check form-check-inline">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="spouse_hcpoa_serve_alone"
                          value="Yes"
                          checked={formData.spouse_hcpoa.hcpoa_initial_agents.agents_serve_alone === 'Yes'}
                          onChange={(e) => updateNestedFormData('spouse_hcpoa.hcpoa_initial_agents.agents_serve_alone', e.target.value)}
                        />
                        <label className="form-check-label">Yes - Each can act alone</label>
                      </div>
                      <div className="form-check form-check-inline">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="spouse_hcpoa_serve_alone"
                          value="No"
                          checked={formData.spouse_hcpoa.hcpoa_initial_agents.agents_serve_alone === 'No'}
                          onChange={(e) => updateNestedFormData('spouse_hcpoa.hcpoa_initial_agents.agents_serve_alone', e.target.value)}
                        />
                        <label className="form-check-label">No - Must act together</label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Will Successor Agent(s) be appointed for {getSecondPersonName()}'s Healthcare Power of Attorney?</label>
              <div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="spouse_hcpoa_successors"
                    value="Yes"
                    checked={formData.spouse_hcpoa.has_appointed_successor_agents === 'Yes'}
                    onChange={(e) => updateNestedFormData('spouse_hcpoa.has_appointed_successor_agents', e.target.value)}
                  />
                  <label className="form-check-label">Yes</label>
                </div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="spouse_hcpoa_successors"
                    value="No"
                    checked={formData.spouse_hcpoa.has_appointed_successor_agents === 'No'}
                    onChange={(e) => updateNestedFormData('spouse_hcpoa.has_appointed_successor_agents', e.target.value)}
                  />
                  <label className="form-check-label">No</label>
                </div>
              </div>
            </div>

            {/* Spouse HCPOA Successor Agents Section */}
            {formData.spouse_hcpoa.has_appointed_successor_agents === 'Yes' && (
              <>
                <p className="text-muted mb-2">
                  The successor agents will serve if all of the initial Agents are unable to serve.
                  These successor Agents will serve in the order they are entered.
                </p>
                <p className="mb-3">Select the successor agents for {getSecondPersonName()}'s Healthcare Power of Attorney:</p>

                {(formData.spouse_hcpoa.successor_agents || []).map((agent, index) => (
                  <div key={index} className="card mb-2">
                    <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                      <span>{getOrdinalLabel(index)} Successor Agent(s)</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-white"
                        onClick={() => removeSuccessorAgent('spouse_hcpoa', index)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-6 mb-3">
                          <label className="form-label">Select the person you want to serve:</label>
                          <select
                            className="form-select"
                            value={agent.successor_agent_to_serve || ''}
                            onChange={(e) => updateSuccessorAgent('spouse_hcpoa', index, 'successor_agent_to_serve', e.target.value)}
                          >
                            <option value="">Successor Agent</option>
                            <option value="client">{formData.personal_info.first_name || 'Client'} ({isPOA ? 'First Principal' : 'My Spouse'})</option>
                            {parties.map((party) => (
                              <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-6 mb-3">
                          <label className="form-label">If you want to appoint a Co-Agent as Successor, select them here:</label>
                          <select
                            className="form-select"
                            value={agent.second_successor_coagent_to_serve || ''}
                            onChange={(e) => updateSuccessorAgent('spouse_hcpoa', index, 'second_successor_coagent_to_serve', e.target.value)}
                          >
                            <option value="">Successor Co-Agent (if any)</option>
                            {parties.map((party) => (
                              <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="btn btn-outline-primary mb-3"
                  onClick={() => addSuccessorAgent('spouse_hcpoa')}
                >
                  + Add {getOrdinalLabel((formData.spouse_hcpoa.successor_agents || []).length)} Successor Agent(s)
                </button>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const renderHCDPage = () => {
    const isTwoPerson = formType.includes('2Person');
    const isPOA = formType.includes('powerOfAttorney');
    const secondPersonLabel = isPOA ? 'Second Principal' : 'Spouse';
    const getSecondPersonName = () => formData.spouse_info.first_name || secondPersonLabel;

    return (
      <div className="poa-page">
        <h2>7. Healthcare Directive for {getPrincipalFullName()}</h2>
        <p className="text-muted mb-3">
          A Healthcare Directive (also known as a Living Will) documents your wishes regarding end-of-life care.
          It tells your healthcare providers and loved ones what medical treatments you want or don't want
          if you become terminally ill or permanently unconscious.
        </p>

        <div className="mb-3">
          <label className="form-label">Life Support Preference <span className="text-danger">*</span></label>
          <select
            className="form-select"
            value={formData.hcd.life_support_option}
            onChange={(e) => updateNestedFormData('hcd.life_support_option', e.target.value)}
          >
            <option value="">Select your preference...</option>
            <option value="WITHDRAW">WITHDRAW - withhold and remove all life support</option>
            <option value="CHOOSE">Choose specific options below</option>
          </select>
        </div>

        {formData.hcd.life_support_option === 'CHOOSE' && (
          <div className="card mb-3">
            <div className="card-header">Specific Preferences</div>
            <div className="card-body">
              <div className="form-check mb-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={formData.hcd.client_hcds.includes('Nutr')}
                  onChange={(e) => {
                    const newHcds = e.target.checked
                      ? [...formData.hcd.client_hcds, 'Nutr']
                      : formData.hcd.client_hcds.filter(h => h !== 'Nutr');
                    updateNestedFormData('hcd.client_hcds', newHcds);
                  }}
                />
                <label className="form-check-label">
                  <strong>Nutrition</strong> - I want to receive artificial nutrition (feeding tube)
                </label>
              </div>
              <div className="form-check mb-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={formData.hcd.client_hcds.includes('Hydr')}
                  onChange={(e) => {
                    const newHcds = e.target.checked
                      ? [...formData.hcd.client_hcds, 'Hydr']
                      : formData.hcd.client_hcds.filter(h => h !== 'Hydr');
                    updateNestedFormData('hcd.client_hcds', newHcds);
                  }}
                />
                <label className="form-check-label">
                  <strong>Hydration</strong> - I want to receive artificial hydration (IV fluids)
                </label>
              </div>
              <div className="form-check mb-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={formData.hcd.client_hcds.includes('Vent')}
                  onChange={(e) => {
                    const newHcds = e.target.checked
                      ? [...formData.hcd.client_hcds, 'Vent']
                      : formData.hcd.client_hcds.filter(h => h !== 'Vent');
                    updateNestedFormData('hcd.client_hcds', newHcds);
                  }}
                />
                <label className="form-check-label">
                  <strong>Ventilator</strong> - I want to receive mechanical ventilation
                </label>
              </div>
              <div className="form-check mb-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={formData.hcd.client_hcds.includes('CPR')}
                  onChange={(e) => {
                    const newHcds = e.target.checked
                      ? [...formData.hcd.client_hcds, 'CPR']
                      : formData.hcd.client_hcds.filter(h => h !== 'CPR');
                    updateNestedFormData('hcd.client_hcds', newHcds);
                  }}
                />
                <label className="form-check-label">
                  <strong>CPR</strong> - I want cardiopulmonary resuscitation attempted
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="card mb-3">
          <div className="card-header">Extended Period Option</div>
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label">Do you want to extend the waiting period before withdrawal of life support?</label>
              <div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="extend_hcd"
                    value="No"
                    checked={formData.hcd.extend_hcd === 'No'}
                    onChange={(e) => updateNestedFormData('hcd.extend_hcd', e.target.value)}
                  />
                  <label className="form-check-label">No - Use standard period</label>
                </div>
                <div className="form-check form-check-inline">
                  <input
                    type="radio"
                    className="form-check-input"
                    name="extend_hcd"
                    value="Yes"
                    checked={formData.hcd.extend_hcd === 'Yes'}
                    onChange={(e) => updateNestedFormData('hcd.extend_hcd', e.target.value)}
                  />
                  <label className="form-check-label">Yes - Specify custom period</label>
                </div>
              </div>
            </div>

            {formData.hcd.extend_hcd === 'Yes' && (
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Number of days</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.hcd.hcd_days}
                    min={1}
                    max={365}
                    onChange={(e) => updateNestedFormData('hcd.hcd_days', parseInt(e.target.value) || 7)}
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">Timing preference</label>
                  <select
                    className="form-select"
                    value={formData.hcd.hcd_sooner_longer}
                    onChange={(e) => updateNestedFormData('hcd.hcd_sooner_longer', e.target.value)}
                  >
                    <option value="">Select...</option>
                    <option value="sooner">Sooner - err on the side of earlier withdrawal</option>
                    <option value="longer">Longer - err on the side of extended care</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Second Principal HCD Section for 2-person forms */}
        {isTwoPerson && (
          <>
            <hr className="my-5" />
            <h2>7. Healthcare Directive for {getSecondPersonName()}</h2>
            <p className="text-muted mb-3">
              A Healthcare Directive (also known as a Living Will) documents your wishes regarding end-of-life care.
              It tells your healthcare providers and loved ones what medical treatments you want or don't want
              if you become terminally ill or permanently unconscious.
            </p>

            <div className="mb-3">
              <label className="form-label">Life Support Preference <span className="text-danger">*</span></label>
              <select
                className="form-select"
                value={formData.spouse_hcd.life_support_option}
                onChange={(e) => updateNestedFormData('spouse_hcd.life_support_option', e.target.value)}
              >
                <option value="">Select preference...</option>
                <option value="WITHDRAW">WITHDRAW - withhold and remove all life support</option>
                <option value="CHOOSE">Choose specific options below</option>
              </select>
            </div>

            {formData.spouse_hcd.life_support_option === 'CHOOSE' && (
              <div className="card mb-3">
                <div className="card-header">Specific Preferences</div>
                <div className="card-body">
                  <div className="form-check mb-2">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={formData.spouse_hcd.spouse_hcds.includes('Nutr')}
                      onChange={(e) => {
                        const newHcds = e.target.checked
                          ? [...formData.spouse_hcd.spouse_hcds, 'Nutr']
                          : formData.spouse_hcd.spouse_hcds.filter(h => h !== 'Nutr');
                        updateNestedFormData('spouse_hcd.spouse_hcds', newHcds);
                      }}
                    />
                    <label className="form-check-label"><strong>Nutrition</strong></label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={formData.spouse_hcd.spouse_hcds.includes('Hydr')}
                      onChange={(e) => {
                        const newHcds = e.target.checked
                          ? [...formData.spouse_hcd.spouse_hcds, 'Hydr']
                          : formData.spouse_hcd.spouse_hcds.filter(h => h !== 'Hydr');
                        updateNestedFormData('spouse_hcd.spouse_hcds', newHcds);
                      }}
                    />
                    <label className="form-check-label"><strong>Hydration</strong></label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={formData.spouse_hcd.spouse_hcds.includes('Vent')}
                      onChange={(e) => {
                        const newHcds = e.target.checked
                          ? [...formData.spouse_hcd.spouse_hcds, 'Vent']
                          : formData.spouse_hcd.spouse_hcds.filter(h => h !== 'Vent');
                        updateNestedFormData('spouse_hcd.spouse_hcds', newHcds);
                      }}
                    />
                    <label className="form-check-label"><strong>Ventilator</strong></label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={formData.spouse_hcd.spouse_hcds.includes('CPR')}
                      onChange={(e) => {
                        const newHcds = e.target.checked
                          ? [...formData.spouse_hcd.spouse_hcds, 'CPR']
                          : formData.spouse_hcd.spouse_hcds.filter(h => h !== 'CPR');
                        updateNestedFormData('spouse_hcd.spouse_hcds', newHcds);
                      }}
                    />
                    <label className="form-check-label"><strong>CPR</strong></label>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="alert alert-success mt-4">
          <h5><i className="fas fa-check-circle me-2"></i>Review and Submit</h5>
          <p>You have completed all sections of the form. Please review your information and click "Submit Form" when ready.</p>
          <p className="mb-0"><strong>After submission, your documents will be generated and available for download.</strong></p>
        </div>
      </div>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const renderOtherPartiesPage = () => (
    <div className="poa-page">
      <h2>3. Other Parties</h2>
      <p className="text-muted">
        If you want to include anyone else in your estate plan (other than yourself or if children are listed in Step 2),
        enter their information here. These may be individuals or entities that serve a specific role or receive a specific gift.
      </p>

      <div className="alert alert-info mb-4">
        <p className="mb-2"><strong>This section is used to identify people or organizations who will:</strong></p>
        <ul className="mb-0">
          <li>Serve as a <strong>Trustee</strong> (manage a trust for beneficiaries)</li>
          <li>Serve as an <strong>Executor</strong> (handle your estate after your passing)</li>
          <li>Act as a <strong>Financial Agent</strong> (make financial decisions under a Power of Attorney)</li>
          <li>Act as a <strong>Healthcare Agent</strong> (make medical decisions if you are unable)</li>
          <li>Receive a <strong>Gift or Inheritance</strong> (beneficiaries not already listed)</li>
          <li>Serve in any other estate planning role not covered earlier</li>
        </ul>
      </div>

      <p>
        For example, you might wish to name your niece as the Executor of your Will and also leave a portion of your estate
        to a charity. In this case, you would list both your niece and the charity in this section as separate entries.
      </p>

      <div className="alert alert-warning mb-4">
        <strong>NOTE:</strong> Do not re-add or duplicate anyone already named in Step 2. You may select these persons for any of the above roles.
      </div>

      <div className="mb-4">
        <label className="form-label">
          <strong>Are there any other family members, friends, or individuals – other than anyone already named in Step 2 – that you'd like to name in your estate plan?</strong>
        </label>
        <div>
          <div className="form-check">
            <input
              type="radio"
              className="form-check-input"
              name="has_other_parties"
              value="Yes"
              checked={hasOtherParties === 'Yes'}
              onChange={(e) => setHasOtherParties(e.target.value)}
            />
            <label className="form-check-label">Yes</label>
          </div>
          <div className="form-check">
            <input
              type="radio"
              className="form-check-input"
              name="has_other_parties"
              value="No"
              checked={hasOtherParties === 'No'}
              onChange={(e) => setHasOtherParties(e.target.value)}
            />
            <label className="form-check-label">No</label>
          </div>
        </div>
      </div>

      <button type="button" className="btn btn-outline-primary mb-4" onClick={addParty}>
        <i className="fas fa-plus me-2"></i> Add Party
      </button>

      {(formData.people_or_entities_who_will_serve_as_agents?.parties || []).length > 0 && (
        <>
          {(formData.people_or_entities_who_will_serve_as_agents?.parties || []).map((party, index) => (
            <div key={party.id} className="card mb-3">
              <div className="card-header d-flex justify-content-between align-items-center">
                <strong>{getPartyDisplayName(party) || `Agent ${index + 1}`}</strong>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => removeParty(index)}
                >
                  <i className="fas fa-trash"></i> Remove
                </button>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label">Type of Party <span className="text-danger">*</span></label>
                  <div>
                    <div className="form-check form-check-inline">
                      <input
                        type="radio"
                        className="form-check-input"
                        name={`party_type_${index}`}
                        value="An individual person"
                        checked={party.type_of_party === 'An individual person'}
                        onChange={(e) => updateParty(index, 'type_of_party', e.target.value)}
                      />
                      <label className="form-check-label">An individual person</label>
                    </div>
                    <div className="form-check form-check-inline">
                      <input
                        type="radio"
                        className="form-check-input"
                        name={`party_type_${index}`}
                        value="An entity"
                        checked={party.type_of_party === 'An entity'}
                        onChange={(e) => updateParty(index, 'type_of_party', e.target.value)}
                      />
                      <label className="form-check-label">An entity (company, trust, etc.)</label>
                    </div>
                  </div>
                </div>

                {party.type_of_party === 'An individual person' && (
                  <>
                    <div className="row mb-3">
                      <div className="col-md-4">
                        <label className="form-label">First Name <span className="text-danger">*</span></label>
                        <input
                          type="text"
                          className="form-control"
                          value={party.first_name}
                          onChange={(e) => updateParty(index, 'first_name', e.target.value)}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Middle Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={party.middle_name}
                          onChange={(e) => updateParty(index, 'middle_name', e.target.value)}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Last Name <span className="text-danger">*</span></label>
                        <input
                          type="text"
                          className="form-control"
                          value={party.surname}
                          onChange={(e) => updateParty(index, 'surname', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="row mb-3">
                      <div className="col-md-4">
                        <label className="form-label">Date of Birth <span className="text-danger">*</span></label>
                        <input
                          type="date"
                          className="form-control"
                          value={party.date_of_birth}
                          onChange={(e) => updateParty(index, 'date_of_birth', e.target.value)}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Gender <span className="text-danger">*</span></label>
                        <select
                          className="form-select"
                          value={party.gender}
                          onChange={(e) => updateParty(index, 'gender', e.target.value)}
                        >
                          <option value="">Select...</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Relationship <span className="text-danger">*</span></label>
                        <select
                          className="form-select"
                          value={party.relationship_with_person}
                          onChange={(e) => updateParty(index, 'relationship_with_person', e.target.value)}
                        >
                          <option value="">Select...</option>
                          {RELATIONSHIP_OPTIONS.map((rel) => (
                            <option key={rel} value={rel}>{rel}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="row mb-3">
                      <div className="col-md-4">
                        <label className="form-label">Last 4 SSN Digits <span className="text-danger">*</span></label>
                        <input
                          type="text"
                          className="form-control"
                          value={party.last_4_ssn_digits}
                          onChange={(e) => updateParty(index, 'last_4_ssn_digits', e.target.value.replace(/\D/g, ''))}
                          maxLength={4}
                        />
                      </div>
                    </div>
                  </>
                )}

                {party.type_of_party === 'An entity' && (
                  <>
                    <div className="row mb-3">
                      <div className="col-md-8">
                        <label className="form-label">Entity Name <span className="text-danger">*</span></label>
                        <input
                          type="text"
                          className="form-control"
                          value={party.entity_name}
                          onChange={(e) => updateParty(index, 'entity_name', e.target.value)}
                          placeholder="e.g., ABC Company, LLC"
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Last 4 EIN Digits</label>
                        <input
                          type="text"
                          className="form-control"
                          value={party.last_4_ein_digits}
                          onChange={(e) => updateParty(index, 'last_4_ein_digits', e.target.value.replace(/\D/g, ''))}
                          maxLength={4}
                        />
                      </div>
                    </div>

                    <div className="row mb-3">
                      <div className="col-md-6">
                        <label className="form-label">Entity Type <span className="text-danger">*</span></label>
                        <select
                          className="form-select"
                          value={party.entity_type}
                          onChange={(e) => updateParty(index, 'entity_type', e.target.value)}
                        >
                          <option value="">Select Entity Type...</option>
                          {ENTITY_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Authorized Signers for Entity */}
                    <div className="mb-3">
                      <label className="form-label">
                        <strong>Authorized Signers</strong>
                        <span className="text-muted ms-2">(Person(s) who will sign on behalf of the entity)</span>
                      </label>

                      {(party.signers || []).map((signer, signerIndex) => (
                        <div key={signerIndex} className="card card-body bg-light mb-2">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <small className="text-muted">Signer {signerIndex + 1}</small>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => removeSigner(index, signerIndex)}
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                          <div className="row">
                            <div className="col-md-3 mb-2">
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="First Name"
                                value={signer.first_name}
                                onChange={(e) => updateSigner(index, signerIndex, 'first_name', e.target.value)}
                              />
                            </div>
                            <div className="col-md-2 mb-2">
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="Middle"
                                value={signer.middle_name}
                                onChange={(e) => updateSigner(index, signerIndex, 'middle_name', e.target.value)}
                              />
                            </div>
                            <div className="col-md-3 mb-2">
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="Last Name"
                                value={signer.surname}
                                onChange={(e) => updateSigner(index, signerIndex, 'surname', e.target.value)}
                              />
                            </div>
                            <div className="col-md-2 mb-2">
                              <select
                                className="form-select form-select-sm"
                                value={signer.suffix}
                                onChange={(e) => updateSigner(index, signerIndex, 'suffix', e.target.value)}
                                title="Suffix (Jr., Sr., III, etc.)"
                              >
                                <option value="">Suffix</option>
                                {SUFFIX_OPTIONS.map((sfx) => (
                                  <option key={sfx} value={sfx}>{sfx}</option>
                                ))}
                              </select>
                            </div>
                            <div className="col-md-2 mb-2">
                              <select
                                className="form-select form-select-sm"
                                value={signer.title}
                                onChange={(e) => updateSigner(index, signerIndex, 'title', e.target.value)}
                              >
                                <option value="">Title...</option>
                                {ENTITY_ROLE_OPTIONS.map((role) => (
                                  <option key={role} value={role}>{role}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => addSigner(index)}
                      >
                        <i className="fas fa-plus me-1"></i>
                        Add Signer
                      </button>
                    </div>
                  </>
                )}

                <div className="mb-3">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={party.same_address_as_person_granting_power_of_attorney}
                      onChange={(e) => updateParty(index, 'same_address_as_person_granting_power_of_attorney', e.target.checked)}
                    />
                    <label className="form-check-label">Same address as {getPrincipalFullName()}</label>
                  </div>
                </div>

                {!party.same_address_as_person_granting_power_of_attorney && (
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label">Street Address</label>
                      <input
                        type="text"
                        className="form-control"
                        value={party.street_address}
                        onChange={(e) => updateParty(index, 'street_address', e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Street Address 2</label>
                      <input
                        type="text"
                        className="form-control"
                        value={party.street_address_2}
                        onChange={(e) => updateParty(index, 'street_address_2', e.target.value)}
                      />
                    </div>
                    <div className="col-md-3 mt-2">
                      <label className="form-label">City</label>
                      <input
                        type="text"
                        className="form-control"
                        value={party.city}
                        onChange={(e) => updateParty(index, 'city', e.target.value)}
                      />
                    </div>
                    <div className="col-md-3 mt-2">
                      <label className="form-label">State</label>
                      <select
                        className="form-select"
                        value={party.state}
                        onChange={(e) => updateParty(index, 'state', e.target.value)}
                      >
                        <option value="">Select State...</option>
                        {US_STATES.map((st) => (
                          <option key={st.abbrev} value={st.value}>{st.value}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-3 mt-2">
                      <label className="form-label">ZIP Code</label>
                      <input
                        type="text"
                        className="form-control"
                        value={party.zip}
                        onChange={(e) => updateParty(index, 'zip', e.target.value)}
                        maxLength={5}
                      />
                    </div>
                    <div className="col-md-3 mt-2">
                      <label className="form-label">
                        {party.state === 'Louisiana' ? 'Parish' : 'County'}
                      </label>
                      {getCountiesForState(party.state || '').length > 0 ? (
                        <select
                          className="form-select"
                          value={party.parish}
                          onChange={(e) => updateParty(index, 'parish', e.target.value)}
                        >
                          <option value="">Select {party.state === 'Louisiana' ? 'Parish' : 'County'}...</option>
                          {getCountiesForState(party.state || '').map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="form-control"
                          value={party.parish}
                          onChange={(e) => updateParty(index, 'parish', e.target.value)}
                          placeholder={party.state ? `Enter county` : 'Select state first'}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );

  const renderTrustInfoPage = () => (
    <div className="poa-page">
      <h2>8. Trust Information</h2>
      <p className="text-muted">Enter information about your trust.</p>

      <div className="mb-3">
        <label className="form-label">Trust Name</label>
        <input
          type="text"
          className="form-control"
          value={formData.trust_info.trust_name}
          onChange={(e) => updateFormData('trust_info', 'trust_name', e.target.value)}
          placeholder="e.g., The Smith Family Trust"
        />
        <small className="text-muted">Leave blank to use default naming based on your name</small>
      </div>

      <div className="mb-3">
        <label className="form-label">Trust Type <span className="text-danger">*</span></label>
        <select
          className={`form-select ${errors['trust_info.trust_type'] ? 'is-invalid' : ''}`}
          value={formData.trust_info.trust_type}
          onChange={(e) => updateFormData('trust_info', 'trust_type', e.target.value)}
        >
          <option value="">Select trust type...</option>
          <option value="revocable">Revocable Living Trust</option>
          <option value="irrevocable">Irrevocable Trust</option>
          <option value="joint">Joint Trust (for married couples)</option>
        </select>
        {errors['trust_info.trust_type'] && <div className="invalid-feedback">{errors['trust_info.trust_type']}</div>}
        <small className="text-muted">Most people choose a Revocable Living Trust</small>
      </div>

      <div className="mb-3">
        <label className="form-label">Specific Bequests</label>
        <textarea
          className="form-control"
          rows={4}
          value={formData.trust_info.specific_bequests}
          onChange={(e) => updateFormData('trust_info', 'specific_bequests', e.target.value)}
          placeholder="List any specific items you wish to leave to specific people (e.g., 'My grandmother's ring to my daughter Jane')"
        />
      </div>

      <div className="mb-3">
        <label className="form-label">Special Instructions</label>
        <textarea
          className="form-control"
          rows={4}
          value={formData.trust_info.special_instructions}
          onChange={(e) => updateFormData('trust_info', 'special_instructions', e.target.value)}
          placeholder="Any special instructions or wishes for your trust"
        />
      </div>

      <div className="alert alert-info">
        <i className="fas fa-info-circle me-2"></i>
        <strong>Note:</strong> Your successor trustees and beneficiaries will be selected from the agents you've already added.
        After submission, our team will contact you to confirm these details.
      </div>

    </div>
  );

  // ============================================================================
  // CHILDREN PAGE (Trust, Will, Minor Child plans)
  // ============================================================================
  const renderChildrenPage = () => (
    <div className="poa-page">
      <h2>Children Information</h2>
      <p className="text-muted">Enter information about your children.</p>

      <div className="mb-3">
        <label className="form-label">Do you have children? <span className="text-danger">*</span></label>
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="hasChildren"
            id="hasChildrenYes"
            value="yes"
            checked={formData.children_as_agents === true}
            onChange={() => updateFormData('', 'children_as_agents', true)}
          />
          <label className="form-check-label" htmlFor="hasChildrenYes">Yes</label>
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="hasChildren"
            id="hasChildrenNo"
            value="no"
            checked={formData.children_as_agents === false}
            onChange={() => updateFormData('', 'children_as_agents', false)}
          />
          <label className="form-check-label" htmlFor="hasChildrenNo">No</label>
        </div>
      </div>

      {formData.children_as_agents && (
        <div className="alert alert-info">
          <i className="fas fa-info-circle me-2"></i>
          Children can be added as agents on the Agents page. Their information will be used for beneficiary designations.
        </div>
      )}
    </div>
  );

  // ============================================================================
  // TRUST SETUP PAGE (Trust plans only)
  // ============================================================================
  const renderTrustSetupPage = () => (
    <div className="poa-page">
      <h2>Trust Setup</h2>
      <p className="text-muted">Configure your trust settings.</p>

      <div className="mb-3">
        <label className="form-label">Trust Name</label>
        <input
          type="text"
          className="form-control"
          value={formData.trust_info?.trust_name || ''}
          onChange={(e) => updateFormData('trust_info', 'trust_name', e.target.value)}
          placeholder="e.g., The Smith Family Living Trust"
        />
        <small className="text-muted">Leave blank to use default naming based on your name</small>
      </div>

      <div className="mb-3">
        <label className="form-label">Trust Type <span className="text-danger">*</span></label>
        <select
          className={`form-select ${errors['trust_info.trust_type'] ? 'is-invalid' : ''}`}
          value={formData.trust_info?.trust_type || ''}
          onChange={(e) => updateFormData('trust_info', 'trust_type', e.target.value)}
        >
          <option value="">Select trust type...</option>
          <option value="revocable">Revocable Living Trust (Most Common)</option>
          <option value="apt">Asset Protection Trust</option>
          <option value="idgt">Intentionally Defective Grantor Trust (IDGT)</option>
        </select>
        {errors['trust_info.trust_type'] && <div className="invalid-feedback">{errors['trust_info.trust_type']}</div>}
      </div>

      <div className="mb-3">
        <label className="form-label">Is this an amendment to an existing trust?</label>
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="isAmendment"
            value="no"
            checked={!formData.trust_info?.is_amendment}
            onChange={() => updateFormData('trust_info', 'is_amendment', false)}
          />
          <label className="form-check-label">No, this is a new trust</label>
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="isAmendment"
            value="yes"
            checked={formData.trust_info?.is_amendment === true}
            onChange={() => updateFormData('trust_info', 'is_amendment', true)}
          />
          <label className="form-check-label">Yes, amending existing trust</label>
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // TRUSTEES PAGE (Trust plans only)
  // ============================================================================
  const renderTrusteesPage = () => {
    const isTwoPerson = formType.includes('2Person');
    return (
      <div className="poa-page">
        <h2>Trustees</h2>
        <p className="text-muted">Designate who will manage your trust.</p>

        <div className="mb-3">
          <label className="form-label">Will you serve as your own initial trustee?</label>
          <div className="form-check">
            <input
              className="form-check-input"
              type="radio"
              name="settlorAsTrustee"
              value="yes"
              checked={formData.trust_info?.settlor_as_trustee === true}
              onChange={() => updateFormData('trust_info', 'settlor_as_trustee', true)}
            />
            <label className="form-check-label">
              Yes{isTwoPerson ? ', both of us will serve as co-trustees' : ', I will serve as my own trustee'}
            </label>
          </div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="radio"
              name="settlorAsTrustee"
              value="no"
              checked={formData.trust_info?.settlor_as_trustee === false}
              onChange={() => updateFormData('trust_info', 'settlor_as_trustee', false)}
            />
            <label className="form-check-label">No, someone else will serve</label>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Successor Trustee(s)</label>
          <p className="text-muted small">Select from agents you've added, or add new ones on the Agents page.</p>
          <select
            className="form-select"
            value={formData.trust_info?.successor_trustee || ''}
            onChange={(e) => updateFormData('trust_info', 'successor_trustee', e.target.value)}
          >
            <option value="">Select successor trustee...</option>
            {(formData.people_or_entities_who_will_serve_as_agents?.parties || []).map((party, i) => (
              <option key={i} value={`${party.first_name} ${party.surname}`.trim() || party.entity_name}>
                {party.type_of_party === 'An entity' ? party.entity_name : `${party.first_name} ${party.surname}`.trim()}
              </option>
            ))}
          </select>
        </div>

        <div className="alert alert-info">
          <i className="fas fa-info-circle me-2"></i>
          <strong>Tip:</strong> A successor trustee manages your trust if you become incapacitated or pass away.
          Choose someone you trust completely with financial matters.
        </div>
      </div>
    );
  };

  // ============================================================================
  // DISTRIBUTION PAGE (Trust plans only)
  // ============================================================================
  const renderDistributionPage = () => {
    const isTwoPerson = formType.includes('2Person');
    return (
      <div className="poa-page">
        <h2>Distribution</h2>
        <p className="text-muted">Specify how your assets should be distributed.</p>

        {isTwoPerson && (
          <div className="mb-4">
            <label className="form-label">Marital Trust Options</label>
            <select
              className="form-select"
              value={formData.trust_info?.marital_trust_type || ''}
              onChange={(e) => updateFormData('trust_info', 'marital_trust_type', e.target.value)}
            >
              <option value="">Select marital trust option...</option>
              <option value="NoMarital">No Marital Trust - outright to surviving spouse</option>
              <option value="MaritalNoFed">Marital Trust (without federal tax optimization)</option>
              <option value="MaritalFed">Marital Trust with QTIP/Credit Shelter</option>
            </select>
          </div>
        )}

        <div className="mb-3">
          <label className="form-label">Specific Bequests</label>
          <textarea
            className="form-control"
            rows={4}
            value={formData.trust_info?.specific_bequests || ''}
            onChange={(e) => updateFormData('trust_info', 'specific_bequests', e.target.value)}
            placeholder="List any specific items you wish to leave to specific people (e.g., 'My grandmother's ring to my daughter Jane')"
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Residuary Distribution</label>
          <p className="text-muted small">After specific bequests, how should the remainder be distributed?</p>
          <textarea
            className="form-control"
            rows={3}
            value={formData.trust_info?.residuary_distribution || ''}
            onChange={(e) => updateFormData('trust_info', 'residuary_distribution', e.target.value)}
            placeholder="e.g., Equally among my children, or specific percentages"
          />
        </div>
      </div>
    );
  };

  // ============================================================================
  // EXECUTORS PAGE (Will plans only)
  // ============================================================================
  const renderExecutorsPage = () => (
    <div className="poa-page">
      <h2>Executors</h2>
      <p className="text-muted">Designate who will administer your estate.</p>

      <div className="mb-3">
        <label className="form-label">Primary Executor</label>
        <select
          className="form-select"
          value={formData.will_info?.primary_executor || ''}
          onChange={(e) => updateFormData('will_info', 'primary_executor', e.target.value)}
        >
          <option value="">Select primary executor...</option>
          {(formData.people_or_entities_who_will_serve_as_agents?.parties || []).map((party, i) => (
            <option key={i} value={`${party.first_name} ${party.surname}`.trim() || party.entity_name}>
              {party.type_of_party === 'An entity' ? party.entity_name : `${party.first_name} ${party.surname}`.trim()}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label className="form-label">Successor Executor</label>
        <select
          className="form-select"
          value={formData.will_info?.successor_executor || ''}
          onChange={(e) => updateFormData('will_info', 'successor_executor', e.target.value)}
        >
          <option value="">Select successor executor...</option>
          {(formData.people_or_entities_who_will_serve_as_agents?.parties || []).map((party, i) => (
            <option key={i} value={`${party.first_name} ${party.surname}`.trim() || party.entity_name}>
              {party.type_of_party === 'An entity' ? party.entity_name : `${party.first_name} ${party.surname}`.trim()}
            </option>
          ))}
        </select>
      </div>

      <div className="alert alert-info">
        <i className="fas fa-info-circle me-2"></i>
        <strong>What does an Executor do?</strong> The executor is responsible for managing your estate after you pass,
        including paying debts, filing taxes, and distributing assets according to your will.
      </div>
    </div>
  );

  // ============================================================================
  // GUARDIANS PAGE (Will & Minor Child plans)
  // ============================================================================
  const renderGuardiansPage = () => (
    <div className="poa-page">
      <h2>Guardians for Minor Children</h2>
      <p className="text-muted">Designate who will care for your minor children if needed.</p>

      <div className="mb-3">
        <label className="form-label">Primary Guardian (Tutor)</label>
        <select
          className="form-select"
          value={formData.will_info?.primary_guardian || ''}
          onChange={(e) => updateFormData('will_info', 'primary_guardian', e.target.value)}
        >
          <option value="">Select primary guardian...</option>
          {(formData.people_or_entities_who_will_serve_as_agents?.parties || [])
            .filter(p => p.type_of_party === 'An individual person')
            .map((party, i) => (
              <option key={i} value={`${party.first_name} ${party.surname}`.trim()}>
                {`${party.first_name} ${party.surname}`.trim()}
              </option>
            ))}
        </select>
      </div>

      <div className="mb-3">
        <label className="form-label">Backup Guardian (Under-Tutor)</label>
        <select
          className="form-select"
          value={formData.will_info?.backup_guardian || ''}
          onChange={(e) => updateFormData('will_info', 'backup_guardian', e.target.value)}
        >
          <option value="">Select backup guardian...</option>
          {(formData.people_or_entities_who_will_serve_as_agents?.parties || [])
            .filter(p => p.type_of_party === 'An individual person')
            .map((party, i) => (
              <option key={i} value={`${party.first_name} ${party.surname}`.trim()}>
                {`${party.first_name} ${party.surname}`.trim()}
              </option>
            ))}
        </select>
      </div>

      <div className="alert alert-warning">
        <i className="fas fa-exclamation-triangle me-2"></i>
        <strong>Important:</strong> Guardian designations only apply to minor children (under 18).
        Make sure to discuss this responsibility with your chosen guardians beforehand.
      </div>
    </div>
  );

  // ============================================================================
  // WILL DISTRIBUTION PAGE (Will plans only)
  // ============================================================================
  const renderWillDistributionPage = () => (
    <div className="poa-page">
      <h2>Will Distribution</h2>
      <p className="text-muted">Specify how your assets should be distributed in your will.</p>

      <div className="mb-3">
        <label className="form-label">Do you want to include specific bequests?</label>
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="hasSpecificBequests"
            value="yes"
            checked={formData.will_info?.has_specific_bequests === true}
            onChange={() => updateFormData('will_info', 'has_specific_bequests', true)}
          />
          <label className="form-check-label">Yes, I have specific items to leave to specific people</label>
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="hasSpecificBequests"
            value="no"
            checked={formData.will_info?.has_specific_bequests === false}
            onChange={() => updateFormData('will_info', 'has_specific_bequests', false)}
          />
          <label className="form-check-label">No, distribute everything according to my residuary plan</label>
        </div>
      </div>

      {formData.will_info?.has_specific_bequests && (
        <div className="mb-3">
          <label className="form-label">Specific Bequests</label>
          <textarea
            className="form-control"
            rows={4}
            value={formData.will_info?.specific_bequests || ''}
            onChange={(e) => updateFormData('will_info', 'specific_bequests', e.target.value)}
            placeholder="List specific items and recipients (e.g., 'My jewelry collection to my daughter Jane')"
          />
        </div>
      )}

      <div className="mb-3">
        <label className="form-label">Residuary Estate Distribution</label>
        <textarea
          className="form-control"
          rows={3}
          value={formData.will_info?.residuary_distribution || ''}
          onChange={(e) => updateFormData('will_info', 'residuary_distribution', e.target.value)}
          placeholder="e.g., Equally among my children, or specific percentages"
        />
        <small className="text-muted">This covers everything not specifically bequeathed above.</small>
      </div>
    </div>
  );

  // ============================================================================
  // CHILDREN TRUSTS PAGE (Minor Child plans only)
  // ============================================================================
  const renderChildrenTrustsPage = () => (
    <div className="poa-page">
      <h2>Children's Trust Provisions</h2>
      <p className="text-muted">Configure trust provisions for your minor children.</p>

      <div className="mb-3">
        <label className="form-label">Age for Outright Distribution</label>
        <select
          className="form-select"
          value={formData.will_info?.distribution_age || '25'}
          onChange={(e) => updateFormData('will_info', 'distribution_age', e.target.value)}
        >
          <option value="18">18 years old</option>
          <option value="21">21 years old</option>
          <option value="25">25 years old (Recommended)</option>
          <option value="30">30 years old</option>
          <option value="35">35 years old</option>
        </select>
        <small className="text-muted">
          At this age, your children will receive their inheritance outright.
          Until then, it will be held in trust.
        </small>
      </div>

      <div className="mb-3">
        <label className="form-label">Trustee for Children's Trust</label>
        <select
          className="form-select"
          value={formData.will_info?.children_trustee || ''}
          onChange={(e) => updateFormData('will_info', 'children_trustee', e.target.value)}
        >
          <option value="">Select trustee...</option>
          {(formData.people_or_entities_who_will_serve_as_agents?.parties || []).map((party, i) => (
            <option key={i} value={`${party.first_name} ${party.surname}`.trim() || party.entity_name}>
              {party.type_of_party === 'An entity' ? party.entity_name : `${party.first_name} ${party.surname}`.trim()}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label className="form-label">Allow education distributions before distribution age?</label>
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={formData.will_info?.allow_education_distributions === true}
            onChange={(e) => updateFormData('will_info', 'allow_education_distributions', e.target.checked)}
          />
          <label className="form-check-label">
            Yes, the trustee may distribute funds for education expenses
          </label>
        </div>
      </div>

      <div className="alert alert-info">
        <i className="fas fa-info-circle me-2"></i>
        <strong>Why a Children's Trust?</strong> Holding assets in trust until a certain age protects your children
        from making poor financial decisions when they're young and inexperienced.
      </div>
    </div>
  );

  // Calculate warning formulas based on form data
  const getWarnings = (): { type: 'warning' | 'info'; message: string }[] => {
    const warnings: { type: 'warning' | 'info'; message: string }[] = [];
    const isTwoPerson = formType.includes('2Person');
    const parties = formData.people_or_entities_who_will_serve_as_agents?.parties || [];

    // AddressWarningTF - Check if address is incomplete
    const client = formData.personal_info;
    if (!client.street_address || !client.city || !client.state || !client.zip) {
      warnings.push({
        type: 'warning',
        message: 'Your address information appears incomplete. Please review the Personal Information page.',
      });
    }

    // Spouse address warning for 2-person forms
    if (isTwoPerson) {
      const spouse = formData.spouse_info;
      if (spouse && !spouse.same_address_as_primary && (!spouse.street_address || !spouse.city || !spouse.state || !spouse.zip)) {
        warnings.push({
          type: 'warning',
          message: 'Spouse address information appears incomplete. Please review the Other Parties page.',
        });
      }
    }

    // No agents warning
    if (parties.length === 0) {
      warnings.push({
        type: 'warning',
        message: 'You have not added any agents. At least one agent is required for your documents.',
      });
    }

    // FPOA agent selection warning
    if (!formData.fpoa?.fpoa_initial_agents?.person_to_serve) {
      warnings.push({
        type: 'warning',
        message: 'No initial Financial POA agent selected. Please review the FPOA page.',
      });
    }

    // HCPOA agent selection warning
    if (!formData.hcpoa?.hcpoa_initial_agents?.person_to_serve) {
      warnings.push({
        type: 'warning',
        message: 'No initial Healthcare POA agent selected. Please review the HCPOA page.',
      });
    }

    // Successor agents info
    const hasSuccessorFPOA = formData.fpoa?.successor_agents?.length > 0;
    const hasSuccessorHCPOA = formData.hcpoa?.successor_agents?.length > 0;
    if (!hasSuccessorFPOA && !hasSuccessorHCPOA) {
      warnings.push({
        type: 'info',
        message: 'Consider naming successor agents in case your primary agents are unable to serve.',
      });
    }

    return warnings;
  };

  const renderReviewPage = () => {
    const warnings = getWarnings();
    const hasErrors = warnings.some(w => w.type === 'warning');
    const isTwoPerson = formType.includes('2Person');
    const isTrustPlan = formType.includes('trustBased');
    const isWillPlan = formType.includes('willBased') || formType.includes('minorChild');
    const agents = formData.people_or_entities_who_will_serve_as_agents?.parties || [];

    // Helper to get life support choice label
    const getLifeSupportLabel = (option: string) => {
      switch (option) {
        case 'ALL': return 'Use all life-sustaining measures';
        case 'NONE': return 'Withhold all life-sustaining measures';
        case 'CHOOSE': return 'Selectively withhold specific measures';
        default: return 'Not selected';
      }
    };

    // Helper to get HCD choices
    const getHCDChoices = (choices: string[]) => {
      const labels: Record<string, string> = {
        'Nutr': 'Nutrition/Feeding Tube',
        'Hydr': 'Hydration',
        'Vent': 'Ventilator/Breathing Machine',
        'CPR': 'CPR/Resuscitation',
      };
      return choices.map(c => labels[c] || c).join(', ') || 'None selected';
    };

    // Helper to get trust type label
    const getTrustTypeLabel = (type: string) => {
      switch (type) {
        case 'revocable': return 'Revocable Living Trust';
        case 'apt': return 'Asset Protection Trust';
        case 'idgt': return 'Intentionally Defective Grantor Trust (IDGT)';
        default: return type || 'Not selected';
      }
    };

    return (
      <div className="poa-page">
        <h2>8. Review</h2>
        <p className="text-muted mb-2">
          You have completed all sections of the form. Please review your information and click "Submit Form" when ready.
        </p>
        <p className="text-muted mb-4">
          After submission, your documents will be generated and available for download.
        </p>

        {/* Warnings Section */}
        {warnings.length > 0 && (
          <div className="mb-4">
            <h5>
              <i className="fas fa-exclamation-triangle me-2 text-warning"></i>
              Notices
            </h5>
            {warnings.map((warning, index) => (
              <div
                key={index}
                className={`alert ${warning.type === 'warning' ? 'alert-warning' : 'alert-info'} d-flex align-items-center`}
              >
                <i className={`fas ${warning.type === 'warning' ? 'fa-exclamation-circle' : 'fa-info-circle'} me-2`}></i>
                {warning.message}
              </div>
            ))}
          </div>
        )}

        {/* ===== SECTION 1: PERSONAL INFORMATION ===== */}
        <h4 className="mt-4 mb-3 border-bottom pb-2">Personal Information</h4>
        <div className="row">
          {/* Principal Info */}
          <div className="col-md-6 mb-3">
            <div className="card h-100">
              <div className="card-header bg-primary text-white">
                <strong>Principal (You)</strong>
                <button
                  type="button"
                  className="btn btn-link btn-sm float-end p-0 text-white"
                  onClick={() => setCurrentPage(pages.indexOf('personal_info'))}
                >
                  Edit
                </button>
              </div>
              <div className="card-body">
                <p className="mb-1"><strong>Name:</strong> {getPrincipalFullName()}</p>
                <p className="mb-1"><strong>Date of Birth:</strong> {formData.personal_info.date_of_birth || 'Not provided'}</p>
                <p className="mb-1"><strong>Gender:</strong> {formData.personal_info.gender || 'Not provided'}</p>
                <p className="mb-1"><strong>Phone:</strong> {formData.personal_info.phone_number || 'Not provided'}</p>
                <p className="mb-1"><strong>Address:</strong> {formData.personal_info.street_address || 'Not provided'}</p>
                <p className="mb-1"><strong>City/State/Zip:</strong> {formData.personal_info.city}, {formData.personal_info.state} {formData.personal_info.zip}</p>
                <p className="mb-0"><strong>Parish/County:</strong> {formData.personal_info.parish || 'Not provided'}</p>
              </div>
            </div>
          </div>

          {/* Second Principal / Spouse Info (if 2-person) */}
          {isTwoPerson && (
            <div className="col-md-6 mb-3">
              <div className="card h-100">
                <div className="card-header bg-primary text-white">
                  <strong>{formType.includes('powerOfAttorney') ? 'Second Principal' : 'Spouse'}</strong>
                  <button
                    type="button"
                    className="btn btn-link btn-sm float-end p-0 text-white"
                    onClick={() => setCurrentPage(pages.indexOf('spouse_info'))}
                  >
                    Edit
                  </button>
                </div>
                <div className="card-body">
                  <p className="mb-1"><strong>Name:</strong> {formData.spouse_info?.first_name} {formData.spouse_info?.middle_name} {formData.spouse_info?.surname} {formData.spouse_info?.suffix}</p>
                  <p className="mb-1"><strong>Date of Birth:</strong> {formData.spouse_info?.date_of_birth || 'Not provided'}</p>
                  <p className="mb-1"><strong>Gender:</strong> {formData.spouse_info?.gender || 'Not provided'}</p>
                  <p className="mb-1"><strong>Phone:</strong> {formData.spouse_info?.phone_number || 'Not provided'}</p>
                  <p className="mb-0"><strong>Same Address:</strong> {formData.spouse_info?.same_address_as_primary ? 'Yes' : 'No'}</p>
                  {!formData.spouse_info?.same_address_as_primary && (
                    <>
                      <p className="mb-1 mt-2"><strong>Address:</strong> {formData.spouse_info?.street_address}</p>
                      <p className="mb-0"><strong>City/State/Zip:</strong> {formData.spouse_info?.city}, {formData.spouse_info?.state} {formData.spouse_info?.zip}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== SECTION 2: CHILDREN ===== */}
        {pages.includes('children') && (
          <>
            <h4 className="mt-4 mb-3 border-bottom pb-2">Children</h4>
            <div className="row">
              <div className="col-12 mb-3">
                <div className="card">
                  <div className="card-header">
                    <strong>Children Information</strong>
                    <button
                      type="button"
                      className="btn btn-link btn-sm float-end p-0"
                      onClick={() => setCurrentPage(pages.indexOf('children'))}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="card-body">
                    <p className="mb-2"><strong>Has Children:</strong> {formData.children_as_agents ? 'Yes' : 'No'}</p>
                    {formData.children_as_agents && agents.filter(a => a.relationship_with_person?.toLowerCase().includes('child') || a.relationship_with_person?.toLowerCase().includes('son') || a.relationship_with_person?.toLowerCase().includes('daughter')).length > 0 && (
                      <ul className="mb-0">
                        {agents.filter(a => a.relationship_with_person?.toLowerCase().includes('child') || a.relationship_with_person?.toLowerCase().includes('son') || a.relationship_with_person?.toLowerCase().includes('daughter')).map((child, idx) => (
                          <li key={idx}>
                            {child.first_name} {child.surname} - {child.relationship_with_person}
                            {child.date_of_birth && ` (DOB: ${child.date_of_birth})`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ===== SECTION 3: AGENTS ===== */}
        <h4 className="mt-4 mb-3 border-bottom pb-2">Agents & Fiduciaries</h4>
        <div className="row">
          <div className="col-12 mb-3">
            <div className="card">
              <div className="card-header">
                <strong>All Designated Agents ({agents.length})</strong>
                <button
                  type="button"
                  className="btn btn-link btn-sm float-end p-0"
                  onClick={() => setCurrentPage(pages.indexOf('agents'))}
                >
                  Edit
                </button>
              </div>
              <div className="card-body">
                {agents.length === 0 ? (
                  <p className="text-muted mb-0">No agents added yet.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Relationship</th>
                          <th>Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agents.map((agent, idx) => (
                          <tr key={idx}>
                            <td>{agent.type_of_party === 'An entity' ? agent.entity_name : `${agent.first_name} ${agent.surname}`}</td>
                            <td>{agent.type_of_party || 'Individual'}</td>
                            <td>{agent.relationship_with_person || '-'}</td>
                            <td>{agent.city ? `${agent.city}, ${agent.state}` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===== SECTION 4: TRUST DETAILS (Trust Plans Only) ===== */}
        {isTrustPlan && (
          <>
            <h4 className="mt-4 mb-3 border-bottom pb-2">Trust Details</h4>
            <div className="row">
              <div className="col-md-6 mb-3">
                <div className="card h-100">
                  <div className="card-header">
                    <strong>Trust Setup</strong>
                    <button
                      type="button"
                      className="btn btn-link btn-sm float-end p-0"
                      onClick={() => setCurrentPage(pages.indexOf('trust_setup'))}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="card-body">
                    <p className="mb-1"><strong>Trust Name:</strong> {formData.trust_info?.trust_name || 'Default (based on your name)'}</p>
                    <p className="mb-1"><strong>Trust Type:</strong> {getTrustTypeLabel(formData.trust_info?.trust_type)}</p>
                    <p className="mb-1"><strong>Amendment:</strong> {formData.trust_info?.is_amendment ? 'Yes (amending existing trust)' : 'No (new trust)'}</p>
                    <p className="mb-0"><strong>Settlor as Trustee:</strong> {formData.trust_info?.settlor_as_trustee ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <div className="card h-100">
                  <div className="card-header">
                    <strong>Trustees & Distribution</strong>
                    <button
                      type="button"
                      className="btn btn-link btn-sm float-end p-0"
                      onClick={() => setCurrentPage(pages.indexOf('trustees'))}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="card-body">
                    <p className="mb-1"><strong>Successor Trustee:</strong> {formData.trust_info?.successor_trustee || 'Not selected'}</p>
                    <p className="mb-1"><strong>Distribution Plan:</strong> {formData.trust_info?.residuary_distribution || 'Not specified'}</p>
                    {formData.trust_info?.specific_bequests && (
                      <p className="mb-0"><strong>Specific Bequests:</strong> {formData.trust_info.specific_bequests.substring(0, 100)}...</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ===== SECTION 5: WILL DETAILS (Will Plans Only) ===== */}
        {isWillPlan && (
          <>
            <h4 className="mt-4 mb-3 border-bottom pb-2">Will Details</h4>
            <div className="row">
              <div className="col-md-6 mb-3">
                <div className="card h-100">
                  <div className="card-header">
                    <strong>Executors</strong>
                    {pages.includes('executors') && (
                      <button
                        type="button"
                        className="btn btn-link btn-sm float-end p-0"
                        onClick={() => setCurrentPage(pages.indexOf('executors'))}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <div className="card-body">
                    <p className="mb-1"><strong>Primary Executor:</strong> {formData.will_info?.primary_executor || 'Not selected'}</p>
                    <p className="mb-0"><strong>Successor Executor:</strong> {formData.will_info?.successor_executor || 'Not selected'}</p>
                  </div>
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <div className="card h-100">
                  <div className="card-header">
                    <strong>Guardians (for minor children)</strong>
                    {pages.includes('guardians') && (
                      <button
                        type="button"
                        className="btn btn-link btn-sm float-end p-0"
                        onClick={() => setCurrentPage(pages.indexOf('guardians'))}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <div className="card-body">
                    <p className="mb-1"><strong>Primary Guardian:</strong> {formData.will_info?.primary_guardian || 'Not selected'}</p>
                    <p className="mb-0"><strong>Backup Guardian:</strong> {formData.will_info?.backup_guardian || 'Not selected'}</p>
                  </div>
                </div>
              </div>
              <div className="col-12 mb-3">
                <div className="card">
                  <div className="card-header">
                    <strong>Distribution</strong>
                  </div>
                  <div className="card-body">
                    <p className="mb-1"><strong>Residuary Distribution:</strong> {formData.will_info?.residuary_distribution || 'Not specified'}</p>
                    <p className="mb-1"><strong>Distribution Age:</strong> {formData.will_info?.distribution_age || '25'} years old</p>
                    <p className="mb-1"><strong>Children's Trustee:</strong> {formData.will_info?.children_trustee || 'Not selected'}</p>
                    <p className="mb-0"><strong>Allow Education Distributions:</strong> {formData.will_info?.allow_education_distributions ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ===== SECTION 6: FPOA DETAILS ===== */}
        <h4 className="mt-4 mb-3 border-bottom pb-2">Financial Power of Attorney (FPOA)</h4>
        <div className="row">
          <div className="col-md-6 mb-3">
            <div className="card h-100">
              <div className="card-header">
                <strong>{isTwoPerson ? 'Your FPOA' : 'FPOA Settings'}</strong>
                <button
                  type="button"
                  className="btn btn-link btn-sm float-end p-0"
                  onClick={() => setCurrentPage(pages.indexOf('fpoa'))}
                >
                  Edit
                </button>
              </div>
              <div className="card-body">
                <p className="mb-1"><strong>Primary Agent:</strong> {formData.fpoa?.fpoa_initial_agents?.person_to_serve || 'Not selected'}</p>
                {formData.fpoa?.fpoa_initial_agents?.second_coagent_person_to_serve && (
                  <p className="mb-1"><strong>Co-Agent:</strong> {formData.fpoa.fpoa_initial_agents.second_coagent_person_to_serve}</p>
                )}
                <p className="mb-1"><strong>Agents Act Independently:</strong> {formData.fpoa?.fpoa_initial_agents?.agents_serve_alone === 'Yes' ? 'Yes' : 'No (must act together)'}</p>
                <p className="mb-1"><strong>Springing POA:</strong> {formData.fpoa?.springing_poa === 'Yes' ? 'Yes (effective upon incapacity)' : 'No (effective immediately)'}</p>
                <p className="mb-0"><strong>Revoke Prior POAs:</strong> {formData.fpoa?.revoke_prior_poa === 'Yes' ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>
          {isTwoPerson && (
            <div className="col-md-6 mb-3">
              <div className="card h-100">
                <div className="card-header">
                  <strong>Spouse's FPOA</strong>
                </div>
                <div className="card-body">
                  <p className="mb-1"><strong>Primary Agent:</strong> {formData.spouse_fpoa?.fpoa_initial_agents?.person_to_serve || 'Not selected'}</p>
                  {formData.spouse_fpoa?.fpoa_initial_agents?.second_coagent_person_to_serve && (
                    <p className="mb-1"><strong>Co-Agent:</strong> {formData.spouse_fpoa.fpoa_initial_agents.second_coagent_person_to_serve}</p>
                  )}
                  <p className="mb-1"><strong>Agents Act Independently:</strong> {formData.spouse_fpoa?.fpoa_initial_agents?.agents_serve_alone === 'Yes' ? 'Yes' : 'No'}</p>
                  <p className="mb-1"><strong>Springing POA:</strong> {formData.spouse_fpoa?.springing_poa === 'Yes' ? 'Yes' : 'No'}</p>
                  <p className="mb-0"><strong>Revoke Prior POAs:</strong> {formData.spouse_fpoa?.revoke_prior_poa === 'Yes' ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== SECTION 7: HCPOA DETAILS ===== */}
        <h4 className="mt-4 mb-3 border-bottom pb-2">Healthcare Power of Attorney (HCPOA)</h4>
        <div className="row">
          <div className="col-md-6 mb-3">
            <div className="card h-100">
              <div className="card-header">
                <strong>{isTwoPerson ? 'Your HCPOA' : 'HCPOA Settings'}</strong>
                <button
                  type="button"
                  className="btn btn-link btn-sm float-end p-0"
                  onClick={() => setCurrentPage(pages.indexOf('hcpoa'))}
                >
                  Edit
                </button>
              </div>
              <div className="card-body">
                <p className="mb-1"><strong>Primary Agent:</strong> {formData.hcpoa?.hcpoa_initial_agents?.person_to_serve || 'Not selected'}</p>
                {formData.hcpoa?.hcpoa_initial_agents?.second_coagent_person_to_serve && (
                  <p className="mb-1"><strong>Co-Agent:</strong> {formData.hcpoa.hcpoa_initial_agents.second_coagent_person_to_serve}</p>
                )}
                <p className="mb-1"><strong>Organ Donor:</strong> {formData.hcpoa?.wish_to_be_organ_donor === 'Yes' ? 'Yes' : formData.hcpoa?.wish_to_be_organ_donor === 'No' ? 'No' : 'Not specified'}</p>
                <p className="mb-1"><strong>Donate Body to Science:</strong> {formData.hcpoa?.wish_to_donate_body_to_science === 'Yes' ? 'Yes' : formData.hcpoa?.wish_to_donate_body_to_science === 'No' ? 'No' : 'Not specified'}</p>
                <p className="mb-0"><strong>No Blood Transfusions:</strong> {formData.hcpoa?.no_blood_transfusion === 'Yes' ? 'Yes (religious objection)' : 'No'}</p>
              </div>
            </div>
          </div>
          {isTwoPerson && (
            <div className="col-md-6 mb-3">
              <div className="card h-100">
                <div className="card-header">
                  <strong>Spouse's HCPOA</strong>
                </div>
                <div className="card-body">
                  <p className="mb-1"><strong>Primary Agent:</strong> {formData.spouse_hcpoa?.hcpoa_initial_agents?.person_to_serve || 'Not selected'}</p>
                  {formData.spouse_hcpoa?.hcpoa_initial_agents?.second_coagent_person_to_serve && (
                    <p className="mb-1"><strong>Co-Agent:</strong> {formData.spouse_hcpoa.hcpoa_initial_agents.second_coagent_person_to_serve}</p>
                  )}
                  <p className="mb-1"><strong>Organ Donor:</strong> {formData.spouse_hcpoa?.wish_to_be_organ_donor === 'Yes' ? 'Yes' : formData.spouse_hcpoa?.wish_to_be_organ_donor === 'No' ? 'No' : 'Not specified'}</p>
                  <p className="mb-1"><strong>Donate Body to Science:</strong> {formData.spouse_hcpoa?.wish_to_donate_body_to_science === 'Yes' ? 'Yes' : 'No'}</p>
                  <p className="mb-0"><strong>No Blood Transfusions:</strong> {formData.spouse_hcpoa?.no_blood_transfusion === 'Yes' ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== SECTION 8: HCD DETAILS ===== */}
        <h4 className="mt-4 mb-3 border-bottom pb-2">Healthcare Directive (Living Will)</h4>
        <div className="row">
          <div className="col-md-6 mb-3">
            <div className="card h-100">
              <div className="card-header">
                <strong>{isTwoPerson ? 'Your Directive' : 'Healthcare Directive'}</strong>
                <button
                  type="button"
                  className="btn btn-link btn-sm float-end p-0"
                  onClick={() => setCurrentPage(pages.indexOf('hcd'))}
                >
                  Edit
                </button>
              </div>
              <div className="card-body">
                <p className="mb-1"><strong>Life Support Preference:</strong> {getLifeSupportLabel(formData.hcd?.life_support_option)}</p>
                {formData.hcd?.life_support_option === 'CHOOSE' && (
                  <p className="mb-1"><strong>Withhold:</strong> {getHCDChoices(formData.hcd?.client_hcds || [])}</p>
                )}
                <p className="mb-1"><strong>Extend Default Period:</strong> {formData.hcd?.extend_hcd === 'Yes' ? `Yes (${formData.hcd?.hcd_days} days ${formData.hcd?.hcd_sooner_longer})` : 'No'}</p>
              </div>
            </div>
          </div>
          {isTwoPerson && (
            <div className="col-md-6 mb-3">
              <div className="card h-100">
                <div className="card-header">
                  <strong>Spouse's Directive</strong>
                </div>
                <div className="card-body">
                  <p className="mb-1"><strong>Life Support Preference:</strong> {getLifeSupportLabel(formData.spouse_hcd?.life_support_option)}</p>
                  {formData.spouse_hcd?.life_support_option === 'CHOOSE' && (
                    <p className="mb-1"><strong>Withhold:</strong> {getHCDChoices(formData.spouse_hcd?.spouse_hcds || [])}</p>
                  )}
                  <p className="mb-1"><strong>Extend Default Period:</strong> {formData.spouse_hcd?.extend_hcd === 'Yes' ? `Yes (${formData.spouse_hcd?.hcd_days} days ${formData.spouse_hcd?.hcd_sooner_longer})` : 'No'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== SECTION 9: DOCUMENTS TO GENERATE ===== */}
        <h4 className="mt-4 mb-3 border-bottom pb-2">Documents to Generate</h4>
        <div className="row">
          <div className="col-12 mb-3">
            <div className="card">
              <div className="card-header bg-success text-white">
                <strong>Your Document Package</strong>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6">
                    <ul className="mb-0">
                      {/* Trust-Based Plan Documents */}
                      {isTrustPlan && (
                        <>
                          <li><i className="fas fa-file-alt me-2 text-primary"></i>Signing Instructions</li>
                          <li><i className="fas fa-folder me-2 text-primary"></i>Estate Planning Portfolio</li>
                          <li><i className="fas fa-file-contract me-2 text-primary"></i>Trust Agreement</li>
                          <li><i className="fas fa-certificate me-2 text-primary"></i>Certificate of Trust</li>
                          <li><i className="fas fa-file-signature me-2 text-primary"></i>Pour-Over Will{isTwoPerson ? ' (x2)' : ''}</li>
                          <li><i className="fas fa-tasks me-2 text-primary"></i>Trust Funding Instructions</li>
                        </>
                      )}
                      {/* Will-Based Plan Documents */}
                      {isWillPlan && (
                        <>
                          <li><i className="fas fa-folder me-2 text-primary"></i>Estate Planning Portfolio</li>
                          <li><i className="fas fa-file-signature me-2 text-primary"></i>Last Will and Testament{isTwoPerson ? ' (x2)' : ''}</li>
                          <li><i className="fas fa-stamp me-2 text-primary"></i>Will Attestation{isTwoPerson ? ' (x2)' : ''}</li>
                        </>
                      )}
                    </ul>
                  </div>
                  <div className="col-md-6">
                    <ul className="mb-0">
                      {/* POA Documents (all plans include these) */}
                      <li><i className="fas fa-hand-holding-usd me-2 text-success"></i>Financial Power of Attorney{isTwoPerson ? ' (x2)' : ''}</li>
                      <li><i className="fas fa-heartbeat me-2 text-success"></i>Healthcare Power of Attorney{isTwoPerson ? ' (x2)' : ''}</li>
                      <li><i className="fas fa-notes-medical me-2 text-success"></i>Healthcare Directive{isTwoPerson ? ' (x2)' : ''}</li>
                      <li><i className="fas fa-shield-alt me-2 text-success"></i>HIPAA Authorization{isTwoPerson ? ' (x2)' : ''}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Section */}
        <div className={`alert ${hasErrors ? 'alert-warning' : 'alert-success'} mt-4`}>
          <h5>
            <i className={`fas ${hasErrors ? 'fa-exclamation-triangle' : 'fa-check-circle'} me-2`}></i>
            {hasErrors ? 'Please Review Warnings' : 'Ready to Submit'}
          </h5>
          {hasErrors ? (
            <p className="mb-0">Please address the warnings above before submitting. You can still submit, but your documents may be incomplete.</p>
          ) : (
            <p className="mb-0">Your information looks complete. Click "Submit Form" below to generate your documents.</p>
          )}
        </div>
      </div>
    );
  };

  const renderCurrentPage = () => {
    const pageName = pages[currentPage];
    switch (pageName) {
      // Common pages
      case 'start': return renderStartPage();
      case 'personal_info': return renderPersonalInfoPage();
      case 'spouse_info': return renderSecondPrincipalPage();
      case 'children': return renderChildrenPage();
      case 'agents': return renderAgentsPage();
      case 'plan_contents': return renderPlanContentsPage();
      // POA pages
      case 'fpoa': return renderFPOAPage();
      case 'hcpoa': return renderHCPOAPage();
      case 'hcd': return renderHCDPage();
      // Trust pages
      case 'trust_setup': return renderTrustSetupPage();
      case 'trustees': return renderTrusteesPage();
      case 'distribution': return renderDistributionPage();
      case 'trust_info': return renderTrustInfoPage(); // Legacy compatibility
      // Will pages
      case 'executors': return renderExecutorsPage();
      case 'guardians': return renderGuardiansPage();
      case 'will_distribution': return renderWillDistributionPage();
      // Minor child pages
      case 'children_trusts': return renderChildrenTrustsPage();
      // Review
      case 'review': return renderReviewPage();
      default: return <div>Page not found: {pageName}</div>;
    }
  };

  const progress = ((currentPage + 1) / pages.length) * 100;

  return (
    <div className="poa-form-page">
      <div className="container py-4">
        <div className="row justify-content-center">
          <div className="col-lg-10">
            <div className="poa-header text-center mb-4">
              <h1 onClick={handleTitleClick} style={{ cursor: 'default' }}>{formConfig.title}</h1>
            </div>

            {/* Progress Bar */}
            <div className="poa-progress mb-4">
              <div className="d-flex justify-content-between mb-2 flex-wrap">
                {pages.map((page, index) => (
                  <button
                    key={page}
                    className={`poa-progress-step ${index === currentPage ? 'active' : ''} ${index < currentPage ? 'completed' : ''}`}
                    onClick={() => setCurrentPage(index)}
                    type="button"
                    title={getPageDisplayName(page)}
                  >
                    <span className="step-number">{index + 1}</span>
                    <span className="step-name">{getPageDisplayName(page)}</span>
                  </button>
                ))}
              </div>
              <div className="progress" style={{ height: '4px' }}>
                <div className="progress-bar bg-success" style={{ width: `${progress}%` }}></div>
              </div>
            </div>

            {/* Save Message */}
            {saveMessage && (
              <div className={`alert ${saveMessage.includes('success') || saveMessage.includes('saved') ? 'alert-success' : 'alert-danger'} mb-3`}>
                <strong>{saveMessage.includes('success') || saveMessage.includes('saved') ? '✓ ' : '⚠ '}</strong>
                {saveMessage}
              </div>
            )}

            {/* Form Content */}
            <div className="poa-form-container card">
              <div className="card-body p-4">
                {renderCurrentPage()}
              </div>
              <div className="card-footer d-flex justify-content-between align-items-center">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={prevPage}
                  disabled={currentPage === 0}
                >
                  <i className="fas fa-arrow-left me-2"></i> Previous
                </button>

                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => handleSave('inprogress')}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>
                    ) : (
                      <><i className="fas fa-save me-2"></i>Save Progress</>
                    )}
                  </button>

                  {currentPage < pages.length - 1 ? (
                    <button type="button" className="btn btn-primary" onClick={nextPage}>
                      Next <i className="fas fa-arrow-right ms-2"></i>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <><span className="spinner-border spinner-border-sm me-2"></span>Submitting...</>
                      ) : (
                        <><i className="fas fa-check me-2"></i>Submit Form</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POAForm;
