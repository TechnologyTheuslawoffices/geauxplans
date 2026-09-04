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
  spouse_info: 'Second Person',
  children: 'Children',
  agents: 'Other Parties',
  plan_contents: 'Contents',
  // POA Pages
  fpoa: 'FPOA',
  hcpoa: 'HCPOA',
  hcd: 'HCD',
  // Trust Pages
  rlt: 'RLT',
  dor: 'DOR',
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
    pages: ['start', 'personal_info', 'children', 'agents', 'plan_contents', 'executors', 'rlt', 'dor', 'fpoa', 'hcpoa', 'hcd', 'review'],
    planType: 'single_trust',
  },
  trustBasedEstatePlan2Person: {
    title: 'Trust-Based Estate Plan for 2 Persons',
    pages: ['start', 'personal_info', 'spouse_info', 'children', 'agents', 'plan_contents', 'executors', 'rlt', 'dor', 'fpoa', 'hcpoa', 'hcd', 'review'],
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
  children: Array<{
    first_name: string;
    middle_name: string;
    surname: string;
    suffix: string;
    date_of_birth: string;
    parentage: string;   // 'Joint' | 'Client' | 'Spouse' (2-person plans only)
    deceased: boolean;
    disinherit: boolean;
  }>;
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
    settlor_as_trustee: boolean;
    // Successor trustees (WP repeatable group), gated by a Yes/No like the
    // successor executors / agents / tutors.
    has_successor_trustees: string;
    trustees: Array<{ trustee_to_serve: string; second_trustee_person_to_serve: string }>;
    // Trust specific bequests (WP)
    has_specific_bequests: boolean;
    specific_bequests: Array<{ recipient: string; description: string; multiple_recipients: string; second_recipient: string }>;
    // Final trust distributions (WP) — backend residuary contract shape
    distributions_equal: boolean;
    residuary_distribution: Array<{
      recipient: string;
      share_percent: string;
      how_receive: string;
      trust_until_age: string;
      // Nested "In Trust" detail (age-based trust for this beneficiary). All
      // optional so existing/mocked rows without them still typecheck.
      distribution_ages?: string[];        // one or more mandatory distribution ages
      initial_trustee?: string;            // initial trustee of this beneficiary's trust
      has_successor_trustees?: string;     // 'Yes' | 'No'
      successor_trustees?: string[];       // ordered successor trustees
      pay_for_education?: string;          // 'Yes' | 'No'
      include_trade_schools?: string;      // 'Yes' | 'No'
    }>;
    // Marital trust option (two-person plans)
    marital_trust_type: string;
    // Tutor / Under-Tutor for minor children (WP)
    appoint_tutor: boolean;
    tutor: string;
    under_tutor: string;
    has_successor_tutors: string;
    successor_tutors: Array<{ successor_tutor_to_serve: string }>;
  };
  // Donation of Residence (Act of Donation to Trust of Principal Residence)
  dor: {
    parish_where_home_is_located: string;
    have_full_legal_description_for_home: string;
    full_legal_description: string;
  };
  will_info: {
    // Executors (WP repeatable groups)
    initial_executors: Array<{ initial_executor: string; co_executor: string }>;
    has_successor_executors: string;
    successor_executors: Array<{ successor_agent_to_serve: string; second_successor_coagent_to_serve: string }>;
    // Derived single values kept for backend compatibility
    primary_executor: string;
    successor_executor: string;
    // Spouse's own pourover-will executors (2-person plans only), mirroring the
    // client fields above exactly as spouse_fpoa / spouse_hcpoa mirror theirs.
    spouse_initial_executors: Array<{ initial_executor: string; co_executor: string }>;
    spouse_has_successor_executors: string;
    spouse_successor_executors: Array<{ successor_agent_to_serve: string; second_successor_coagent_to_serve: string }>;
    spouse_primary_executor: string;
    spouse_successor_executor: string;
    // Sole-executor shortcuts: does one principal name the other as sole executor?
    name_second_principal_as_executor: string; // client's will: 'Yes' | 'No' | ''
    name_first_principal_as_executor: string;  // spouse's will: 'Yes' | 'No' | ''
    primary_guardian: string;
    backup_guardian: string;
    has_specific_bequests: boolean;
    specific_bequests: Array<{ recipient: string; description: string; multiple_recipients: string; second_recipient: string }>;
    distributions_equal: boolean;
    residuary_distribution: Array<{
      recipient: string;
      share_percent: string;
      how_receive: string;
      trust_until_age: string;
      // Nested "In Trust" detail (age-based trust for this beneficiary). All
      // optional so existing/mocked rows without them still typecheck.
      distribution_ages?: string[];        // one or more mandatory distribution ages
      initial_trustee?: string;            // initial trustee of this beneficiary's trust
      has_successor_trustees?: string;     // 'Yes' | 'No'
      successor_trustees?: string[];       // ordered successor trustees
      pay_for_education?: string;          // 'Yes' | 'No'
      include_trade_schools?: string;      // 'Yes' | 'No'
    }>;
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
  children: [],
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
    settlor_as_trustee: true,
    has_successor_trustees: '',
    trustees: [],
    has_specific_bequests: false,
    specific_bequests: [],
    distributions_equal: true,
    residuary_distribution: [],
    marital_trust_type: '',
    appoint_tutor: false,
    tutor: '',
    under_tutor: '',
    has_successor_tutors: '',
    successor_tutors: [],
  },
  dor: {
    parish_where_home_is_located: '',
    have_full_legal_description_for_home: '',
    full_legal_description: '',
  },
  will_info: {
    initial_executors: [],
    has_successor_executors: '',
    successor_executors: [],
    primary_executor: '',
    successor_executor: '',
    spouse_initial_executors: [],
    spouse_has_successor_executors: '',
    spouse_successor_executors: [],
    spouse_primary_executor: '',
    spouse_successor_executor: '',
    name_second_principal_as_executor: '',
    name_first_principal_as_executor: '',
    primary_guardian: '',
    backup_guardian: '',
    has_specific_bequests: false,
    specific_bequests: [],
    distributions_equal: true,
    residuary_distribution: [],
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
  children: [
    { first_name: 'Emily', middle_name: '', surname: 'Smith', suffix: '', date_of_birth: '2010-04-12', parentage: 'Joint', deceased: false, disinherit: false },
  ],
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
    settlor_as_trustee: true,
    has_successor_trustees: 'Yes',
    trustees: [
      { trustee_to_serve: 'Robert James Smith', second_trustee_person_to_serve: '' },
    ],
    has_specific_bequests: true,
    specific_bequests: [
      { recipient: 'Emily Rose Johnson', description: 'Jewelry collection', multiple_recipients: 'No', second_recipient: '' },
    ],
    distributions_equal: false,
    residuary_distribution: [
      { recipient: 'Robert James Smith', share_percent: '50', how_receive: 'Outright', trust_until_age: '' },
      { recipient: 'Emily Rose Johnson', share_percent: '50', how_receive: 'In Trust', trust_until_age: '25' },
    ],
    marital_trust_type: 'NoMarital',
    appoint_tutor: false,
    tutor: '',
    under_tutor: '',
    has_successor_tutors: '',
    successor_tutors: [],
  },
  // Donation of Residence
  dor: {
    parish_where_home_is_located: 'Orleans',
    have_full_legal_description_for_home: 'Yes, I have the complete legal description',
    full_legal_description: 'Lot 12, Square 5, Faubourg Marigny, City of New Orleans, Orleans Parish, Louisiana.',
  },
  // Will info (for will-based plans)
  will_info: {
    initial_executors: [
      { initial_executor: 'Robert James Smith', co_executor: '' },
    ],
    has_successor_executors: 'Yes',
    successor_executors: [
      { successor_agent_to_serve: 'Emily Rose Johnson', second_successor_coagent_to_serve: '' },
    ],
    primary_executor: 'Robert James Smith',
    successor_executor: 'Emily Rose Johnson',
    spouse_initial_executors: [],
    spouse_has_successor_executors: '',
    spouse_successor_executors: [],
    spouse_primary_executor: '',
    spouse_successor_executor: '',
    name_second_principal_as_executor: '',
    name_first_principal_as_executor: '',
    primary_guardian: 'Michael Andrew Williams III',
    backup_guardian: 'Emily Rose Johnson',
    has_specific_bequests: true,
    specific_bequests: [
      { recipient: 'Emily Rose Johnson', description: 'My jewelry collection.', multiple_recipients: 'No', second_recipient: '' },
    ],
    distributions_equal: false,
    residuary_distribution: [
      { recipient: 'Emily Rose Johnson', share_percent: '100', how_receive: 'Outright', trust_until_age: '' },
    ],
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

  // WordPress numbers the flow Start=1, Personal Information=2, Other Parties=3,
  // ... HCD=10. The spouse and children pages fold into the "Personal
  // Information" section (Step 2), so they share its number and are not counted
  // separately. This keeps Executors=5, RLT=6, DOR=7, FPOA=8, HCPOA=9, HCD=10 on
  // the trust flow (and FPOA=5 on the POA-only flow) regardless of solo vs
  // 2-person, matching the legacy site.
  const getStepNumber = (pageKey: string): number => {
    const key = pageKey === 'children' || pageKey === 'spouse_info' ? 'personal_info' : pageKey;
    const numbered = pages.filter((p) => p !== 'spouse_info' && p !== 'children');
    const idx = numbered.indexOf(key);
    return idx >= 0 ? idx + 1 : 0;
  };

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

  // Children roster helpers
  const addChild = () => {
    setFormData(prev => ({
      ...prev,
      children: [
        ...(prev.children || []),
        { first_name: '', middle_name: '', surname: '', suffix: '', date_of_birth: '', parentage: 'Joint', deceased: false, disinherit: false },
      ],
    }));
  };

  const removeChild = (index: number) => {
    setFormData(prev => ({
      ...prev,
      children: (prev.children || []).filter((_, i) => i !== index),
    }));
  };

  const updateChild = (index: number, field: keyof FormData['children'][number], value: any) => {
    setFormData(prev => ({
      ...prev,
      children: (prev.children || []).map((child, i) =>
        i === index ? { ...child, [field]: value } : child
      ),
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

  // Beneficiary options: agents/parties plus any children (WP pulls from both pools).
  const getBeneficiaryOptions = (): string[] => {
    const partyNames = (formData.people_or_entities_who_will_serve_as_agents?.parties || [])
      .map((p) => getPartyDisplayName(p))
      .filter(Boolean);
    const childNames = (formData.children || [])
      .map((c) => [c.first_name, c.middle_name, c.surname, c.suffix].map((s) => (s || '').trim()).filter(Boolean).join(' '))
      .filter(Boolean);
    return Array.from(new Set([...partyNames, ...childNames]));
  };

  // Executor options for a given principal's pourover will. The "other
  // principal" (the spouse for the client's will, the client for the spouse's)
  // is a selectable option; the backend `findPartyId` resolves those display
  // names to client/spouse ids, so no id plumbing is needed here.
  const getExecutorOptions = (principal: ExecutorPrincipal = 'client'): string[] => {
    const pi = formData.personal_info;
    const si = formData.spouse_info;
    const clientName = [pi.first_name, pi.middle_name, pi.surname].filter(Boolean).join(' ');
    const spouseName = [si.first_name, si.middle_name, si.surname].filter(Boolean).join(' ');
    const otherName = principal === 'spouse' ? clientName : spouseName;
    return Array.from(new Set([otherName, ...getBeneficiaryOptions()].filter(Boolean)));
  };

  // ---- Trust: successor trustees group ----
  const addTrustee = () => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, trustees: [...(prev.trust_info.trustees || []), { trustee_to_serve: '', second_trustee_person_to_serve: '' }] },
  }));
  const removeTrustee = (index: number) => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, trustees: (prev.trust_info.trustees || []).filter((_, i) => i !== index) },
  }));
  const updateTrustee = (index: number, field: 'trustee_to_serve' | 'second_trustee_person_to_serve', value: string) => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, trustees: (prev.trust_info.trustees || []).map((t, i) => i === index ? { ...t, [field]: value } : t) },
  }));

  // ---- Trust: specific bequests group ----
  const addBequest = () => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, specific_bequests: [...(prev.trust_info.specific_bequests || []), { recipient: '', description: '', multiple_recipients: 'No', second_recipient: '' }] },
  }));
  const removeBequest = (index: number) => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, specific_bequests: (prev.trust_info.specific_bequests || []).filter((_, i) => i !== index) },
  }));
  const updateBequest = (index: number, field: 'recipient' | 'description' | 'multiple_recipients' | 'second_recipient', value: string) => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, specific_bequests: (prev.trust_info.specific_bequests || []).map((b, i) => i === index ? { ...b, [field]: value } : b) },
  }));

  // ---- Trust: final residuary distributions group ----
  const addDistribution = () => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, residuary_distribution: [...(prev.trust_info.residuary_distribution || []), { recipient: '', share_percent: '', how_receive: 'Outright', trust_until_age: '' }] },
  }));
  const removeDistribution = (index: number) => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, residuary_distribution: (prev.trust_info.residuary_distribution || []).filter((_, i) => i !== index) },
  }));
  const updateDistribution = (index: number, field: 'recipient' | 'share_percent' | 'how_receive' | 'trust_until_age', value: string) => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, residuary_distribution: (prev.trust_info.residuary_distribution || []).map((d, i) => i === index ? { ...d, [field]: value } : d) },
  }));

  // ---- Will: specific bequests group (mirrors the trust helpers, on will_info) ----
  const addWillBequest = () => setFormData(prev => ({
    ...prev,
    will_info: { ...prev.will_info, specific_bequests: [...(prev.will_info.specific_bequests || []), { recipient: '', description: '', multiple_recipients: 'No', second_recipient: '' }] },
  }));
  const removeWillBequest = (index: number) => setFormData(prev => ({
    ...prev,
    will_info: { ...prev.will_info, specific_bequests: (prev.will_info.specific_bequests || []).filter((_, i) => i !== index) },
  }));
  const updateWillBequest = (index: number, field: 'recipient' | 'description' | 'multiple_recipients' | 'second_recipient', value: string) => setFormData(prev => ({
    ...prev,
    will_info: { ...prev.will_info, specific_bequests: (prev.will_info.specific_bequests || []).map((b, i) => i === index ? { ...b, [field]: value } : b) },
  }));

  // ---- Will: residuary distributions group ----
  const addWillDistribution = () => setFormData(prev => ({
    ...prev,
    will_info: { ...prev.will_info, residuary_distribution: [...(prev.will_info.residuary_distribution || []), { recipient: '', share_percent: '', how_receive: 'Outright', trust_until_age: '' }] },
  }));
  const removeWillDistribution = (index: number) => setFormData(prev => ({
    ...prev,
    will_info: { ...prev.will_info, residuary_distribution: (prev.will_info.residuary_distribution || []).filter((_, i) => i !== index) },
  }));
  const updateWillDistribution = (index: number, field: 'recipient' | 'share_percent' | 'how_receive' | 'trust_until_age', value: string) => setFormData(prev => ({
    ...prev,
    will_info: { ...prev.will_info, residuary_distribution: (prev.will_info.residuary_distribution || []).map((d, i) => i === index ? { ...d, [field]: value } : d) },
  }));

  // ---- Shared: nested "In Trust" detail for a residuary row ----
  // Trust and will residuary lists have the same row shape, so one mutation
  // helper (keyed by section) and one renderer serve both. `mut` receives a
  // shallow copy of the target row and returns the replacement.
  type ResidSectionKey = 'trust_info' | 'will_info';
  const mutateResidRow = (section: ResidSectionKey, index: number, mut: (row: any) => any) =>
    setFormData(prev => {
      const info: any = prev[section];
      const list = (info.residuary_distribution || []).map((d: any, i: number) => (i === index ? mut({ ...d }) : d));
      return { ...prev, [section]: { ...info, residuary_distribution: list } } as typeof prev;
    });

  // The nested age/trustee/education block shown when a beneficiary receives
  // "In Trust". The legacy single `trust_until_age` is kept synced to the first
  // age so older submissions and the backend's single-age fallback still work.
  const renderInTrustDetails = (section: ResidSectionKey, d: any, index: number) => {
    const trusteeOptions = getBeneficiaryOptions();
    const ages: string[] = (d.distribution_ages && d.distribution_ages.length)
      ? d.distribution_ages
      : [d.trust_until_age || ''];
    const successors: string[] = d.successor_trustees || [];
    return (
      <div className="mt-2 pt-3 border-top">
        <label className="form-label fw-semibold">At what age(s) should distributions be made?</label>
        <p className="text-muted small mb-2">You can enter as many ages (i.e., have as many distributions) as you like.</p>
        {ages.map((age, ai) => (
          <div key={ai} className="d-flex align-items-center mb-2" style={{ maxWidth: 320 }}>
            <input
              type="number" min={18} max={99} className="form-control" placeholder="25" value={age}
              onChange={(e) => mutateResidRow(section, index, (r) => {
                const base = (r.distribution_ages && r.distribution_ages.length) ? [...r.distribution_ages] : [r.trust_until_age || ''];
                base[ai] = e.target.value;
                return { ...r, distribution_ages: base, trust_until_age: base[0] || '' };
              })}
            />
            {ages.length > 1 && (
              <button
                type="button" className="btn btn-sm btn-link text-danger ms-2"
                onClick={() => mutateResidRow(section, index, (r) => {
                  const base = (r.distribution_ages && r.distribution_ages.length) ? [...r.distribution_ages] : [r.trust_until_age || ''];
                  const next = base.filter((_: string, i2: number) => i2 !== ai);
                  return { ...r, distribution_ages: next, trust_until_age: next[0] || '' };
                })}
              >×</button>
            )}
          </div>
        ))}
        <button
          type="button" className="btn btn-sm btn-outline-secondary mb-3"
          onClick={() => mutateResidRow(section, index, (r) => {
            const base = (r.distribution_ages && r.distribution_ages.length) ? [...r.distribution_ages] : [r.trust_until_age || ''];
            return { ...r, distribution_ages: [...base, ''] };
          })}
        >+ Add another age</button>

        <div className="mb-3">
          <label className="form-label">Who should serve as the initial Trustee of this beneficiary's trust?</label>
          <select
            className="form-select" value={d.initial_trustee || ''}
            onChange={(e) => mutateResidRow(section, index, (r) => ({ ...r, initial_trustee: e.target.value }))}
          >
            <option value="">Select trustee...</option>
            {trusteeOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
          </select>
        </div>

        <div className="mb-3">
          <label className="form-label">Do you want to appoint successor Trustees for this beneficiary's trust?</label>
          <select
            className="form-select" style={{ maxWidth: 160 }} value={d.has_successor_trustees || 'No'}
            onChange={(e) => mutateResidRow(section, index, (r) => ({ ...r, has_successor_trustees: e.target.value }))}
          >
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
          {d.has_successor_trustees === 'Yes' && (
            <div className="mt-2">
              {successors.map((s, si) => (
                <div key={si} className="d-flex align-items-center mb-2" style={{ maxWidth: 360 }}>
                  <select
                    className="form-select" value={s}
                    onChange={(e) => mutateResidRow(section, index, (r) => {
                      const next = [...(r.successor_trustees || [])];
                      next[si] = e.target.value;
                      return { ...r, successor_trustees: next };
                    })}
                  >
                    <option value="">Select successor trustee...</option>
                    {trusteeOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                  </select>
                  <button
                    type="button" className="btn btn-sm btn-link text-danger ms-2"
                    onClick={() => mutateResidRow(section, index, (r) => ({
                      ...r, successor_trustees: (r.successor_trustees || []).filter((_: string, i2: number) => i2 !== si),
                    }))}
                  >×</button>
                </div>
              ))}
              <button
                type="button" className="btn btn-sm btn-outline-secondary"
                onClick={() => mutateResidRow(section, index, (r) => ({ ...r, successor_trustees: [...(r.successor_trustees || []), ''] }))}
              >+ Add successor Trustee</button>
            </div>
          )}
        </div>

        <div className="mb-2">
          <label className="form-label">Do you want the Trustee to use the Trust funds to pay for the beneficiary's education?</label>
          <select
            className="form-select" style={{ maxWidth: 160 }} value={d.pay_for_education || 'No'}
            onChange={(e) => mutateResidRow(section, index, (r) => ({ ...r, pay_for_education: e.target.value }))}
          >
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
          {d.pay_for_education === 'Yes' && (
            <div className="mt-2">
              <label className="form-label">Include trade schools in the education distributions?</label>
              <select
                className="form-select" style={{ maxWidth: 160 }} value={d.include_trade_schools || 'No'}
                onChange={(e) => mutateResidRow(section, index, (r) => ({ ...r, include_trade_schools: e.target.value }))}
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ---- Trust: successor tutors group ----
  const addSuccessorTutor = () => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, successor_tutors: [...(prev.trust_info.successor_tutors || []), { successor_tutor_to_serve: '' }] },
  }));
  const removeSuccessorTutor = (index: number) => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, successor_tutors: (prev.trust_info.successor_tutors || []).filter((_, i) => i !== index) },
  }));
  const updateSuccessorTutor = (index: number, value: string) => setFormData(prev => ({
    ...prev,
    trust_info: { ...prev.trust_info, successor_tutors: (prev.trust_info.successor_tutors || []).map((t, i) => i === index ? { successor_tutor_to_serve: value } : t) },
  }));

  // ---- Will/Pourover: initial + successor executors groups ----
  // primary_executor / successor_executor are kept in sync for the backend contract.
  // Generalized over principal so a 2-person plan can drive each spouse's own
  // pourover-will section; call sites default to the client.
  type ExecutorPrincipal = 'client' | 'spouse';
  const execFields = (principal: ExecutorPrincipal) => principal === 'spouse'
    ? {
        initial: 'spouse_initial_executors' as const,
        successor: 'spouse_successor_executors' as const,
        primarySingle: 'spouse_primary_executor' as const,
        successorSingle: 'spouse_successor_executor' as const,
      }
    : {
        initial: 'initial_executors' as const,
        successor: 'successor_executors' as const,
        primarySingle: 'primary_executor' as const,
        successorSingle: 'successor_executor' as const,
      };
  const syncExecutorSingles = (info: FormData['will_info'], principal: ExecutorPrincipal = 'client'): FormData['will_info'] => {
    const f = execFields(principal);
    return {
      ...info,
      [f.primarySingle]: (info[f.initial] as Array<{ initial_executor: string }>)?.[0]?.initial_executor || '',
      [f.successorSingle]: (info[f.successor] as Array<{ successor_agent_to_serve: string }>)?.[0]?.successor_agent_to_serve || '',
    };
  };
  const addInitialExecutor = (principal: ExecutorPrincipal = 'client') => setFormData(prev => {
    const f = execFields(principal);
    return { ...prev, will_info: syncExecutorSingles({ ...prev.will_info, [f.initial]: [...(prev.will_info[f.initial] as any[] || []), { initial_executor: '', co_executor: '' }] }, principal) };
  });
  const removeInitialExecutor = (index: number, principal: ExecutorPrincipal = 'client') => setFormData(prev => {
    const f = execFields(principal);
    return { ...prev, will_info: syncExecutorSingles({ ...prev.will_info, [f.initial]: (prev.will_info[f.initial] as any[] || []).filter((_, i) => i !== index) }, principal) };
  });
  const updateInitialExecutor = (index: number, field: 'initial_executor' | 'co_executor', value: string, principal: ExecutorPrincipal = 'client') => setFormData(prev => {
    const f = execFields(principal);
    return { ...prev, will_info: syncExecutorSingles({ ...prev.will_info, [f.initial]: (prev.will_info[f.initial] as any[] || []).map((e, i) => i === index ? { ...e, [field]: value } : e) }, principal) };
  });
  const addSuccessorExecutor = (principal: ExecutorPrincipal = 'client') => setFormData(prev => {
    const f = execFields(principal);
    return { ...prev, will_info: syncExecutorSingles({ ...prev.will_info, [f.successor]: [...(prev.will_info[f.successor] as any[] || []), { successor_agent_to_serve: '', second_successor_coagent_to_serve: '' }] }, principal) };
  });
  const removeSuccessorExecutor = (index: number, principal: ExecutorPrincipal = 'client') => setFormData(prev => {
    const f = execFields(principal);
    return { ...prev, will_info: syncExecutorSingles({ ...prev.will_info, [f.successor]: (prev.will_info[f.successor] as any[] || []).filter((_, i) => i !== index) }, principal) };
  });
  const updateSuccessorExecutor = (index: number, field: 'successor_agent_to_serve' | 'second_successor_coagent_to_serve', value: string, principal: ExecutorPrincipal = 'client') => setFormData(prev => {
    const f = execFields(principal);
    return { ...prev, will_info: syncExecutorSingles({ ...prev.will_info, [f.successor]: (prev.will_info[f.successor] as any[] || []).map((e, i) => i === index ? { ...e, [field]: value } : e) }, principal) };
  });

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
      // Other Parties is optional: selecting "No" (or adding at least one party)
      // lets the user continue. Only block if they haven't answered and haven't
      // added anyone.
      const partyCount = (formData.people_or_entities_who_will_serve_as_agents?.parties || []).length;
      if (hasOtherParties !== 'No' && partyCount === 0) {
        newErrors['agents'] = 'Add at least one party, or select "No".';
      }
    }

    if (pageName === 'executors') {
      const wi = formData.will_info;
      const isTwoPerson = formType.includes('2Person');
      // Each principal is satisfied by either the sole-executor shortcut === 'Yes'
      // or a named initial executor.
      const clientOk = wi.name_second_principal_as_executor === 'Yes'
        || Boolean((wi.initial_executors || [])[0]?.initial_executor);
      if (!clientOk) {
        newErrors['will_info.initial_executors'] = 'Select at least one Executor.';
      }
      if (isTwoPerson) {
        const spouseOk = wi.name_first_principal_as_executor === 'Yes'
          || Boolean((wi.spouse_initial_executors || [])[0]?.initial_executor);
        if (!spouseOk) {
          newErrors['will_info.spouse_initial_executors'] = 'Select at least one Executor.';
        }
      }
    }

    if (pageName === 'will_distribution') {
      const wi = formData.will_info;
      const dist = wi.residuary_distribution || [];
      if (dist.length === 0 || dist.some((d) => !d.recipient)) {
        newErrors['will_info.residuary_distribution'] = 'Each residuary beneficiary must be named.';
      } else if (!wi.distributions_equal) {
        const total = dist.reduce((sum, d) => sum + (parseFloat(d.share_percent) || 0), 0);
        if (Math.abs(total - 100) > 0.01) {
          newErrors['will_info.residuary_distribution'] = `Residuary shares total ${Math.round(total * 100) / 100}%, not 100%.`;
        }
      }
      if (wi.has_specific_bequests) {
        const bequests = wi.specific_bequests || [];
        if (bequests.some((b) => !b.recipient || !String(b.description || '').trim())) {
          newErrors['will_info.specific_bequests'] = 'Each specific bequest needs a recipient and a description.';
        }
      }
    }

    if (pageName === 'rlt') {
      const ti = formData.trust_info;
      // Successor trustees are optional (the settlor is the initial trustee), but
      // if the user says "Yes" they must name at least one.
      const trustees = ti.trustees || [];
      if (ti.has_successor_trustees === 'Yes' && (trustees.length === 0 || !trustees[0]?.trustee_to_serve)) {
        newErrors['trust_info.trustees'] = 'Select at least one Successor Trustee, or answer "No".';
      }
      const dist = ti.residuary_distribution || [];
      if (dist.length === 0 || dist.some((d) => !d.recipient)) {
        newErrors['trust_info.residuary_distribution'] = 'Each residuary beneficiary must be named.';
      }
      if (!ti.distributions_equal) {
        const total = dist.reduce((sum, d) => sum + (parseFloat(d.share_percent) || 0), 0);
        if (Math.abs(total - 100) > 0.01) {
          newErrors['trust_info.residuary_distribution'] = `Residuary shares total ${Math.round(total * 100) / 100}%, not 100%.`;
        }
      }
      if (ti.has_specific_bequests) {
        const bequests = ti.specific_bequests || [];
        if (bequests.some((b) => !b.recipient || !String(b.description || '').trim())) {
          newErrors['trust_info.specific_bequests'] = 'Each specific bequest needs a recipient and a description.';
        }
      }
      if (ti.appoint_tutor && (!ti.tutor || !ti.under_tutor)) {
        newErrors['trust_info.tutor'] = 'Select both a Tutor and an Under-Tutor.';
      }
    }

    if (pageName === 'dor') {
      const dor = formData.dor;
      if (!dor.parish_where_home_is_located) {
        newErrors['dor.parish_where_home_is_located'] = 'Parish or county is required.';
      }
      if (dor.have_full_legal_description_for_home === 'Yes, I have the complete legal description' &&
          !String(dor.full_legal_description || '').trim()) {
        newErrors['dor.full_legal_description'] = 'Enter the full legal description.';
      }
    }

    return { valid: Object.keys(newErrors).length === 0, errors: newErrors };
  };

  const validateCurrentPage = (): boolean => {
    const result = validatePage(currentPage);
    setErrors(result.errors);
    return result.valid;
  };

  // When "distribute equally" is chosen the UI hides the per-beneficiary
  // percentage, but the backend still requires residuary shares to total 100
  // (see docPreconditions.js). Fill equal shares before the payload leaves.
  const fillEqualShares = <T extends { share_percent: string }>(rows: T[], equal: boolean): T[] => {
    if (!equal || rows.length === 0) return rows;
    const n = rows.length;
    const base = Math.floor(10000 / n) / 100;
    return rows.map((d, i) => ({
      ...d,
      share_percent: (i === 0 ? 100 - base * (n - 1) : base).toFixed(2),
    }));
  };

  const normalizeFormDataForSubmit = (data: FormData): FormData => {
    let next = data;
    if (next.trust_info) {
      const ti = next.trust_info;
      next = { ...next, trust_info: { ...ti, residuary_distribution: fillEqualShares(ti.residuary_distribution || [], ti.distributions_equal) } };
    }
    if (next.will_info) {
      const wi = next.will_info;
      next = { ...next, will_info: { ...wi, residuary_distribution: fillEqualShares(wi.residuary_distribution || [], wi.distributions_equal) } };
    }
    return next;
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
        form_data: normalizeFormDataForSubmit(formData),
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
      return isPOA ? 'Principal 2' : 'Second Person';
    }
    return PAGE_NAMES[page] || page;
  };

  const renderStartPage = () => {
    const isPOA2Person = formType === 'powerOfAttorneyForm2Person';

    return (
      <div className="poa-page">
        <p className="text-muted"><em>Estate Plan Document Selection</em></p>
        <h2>{getStepNumber('start')}. {formConfig.title}</h2>
        {isPOA2Person ? (
          <>
            <p>
              The Power of Attorney Supplement for Two People includes a set of the following legal documents for two people:
            </p>
            <p>
              <strong>(1) Financial Power of Attorney;</strong> <strong>(2) Medical Power of Attorney;</strong> <strong>(3) Advanced Healthcare Directive (a/k/a "Living Will");</strong> and <strong>(4) HIPAA Release.</strong>
            </p>
            <p>
              The Power of Attorney Supplement for Two People is well suited for married couples or life partners who wish to authorize legal or financial decisions for each other, as well as access protected health information, consent to medical procedures, or make care arrangements if they are unable to do so. Successor or alternative Agents may also be named. The persons granting powers of attorney (the "Principals") need not name each other as their first choice of Agent and, instead, may choose to name another person, whether a friend of family member, as their initial Agent.
            </p>
          </>
        ) : (
          <p>
            The Power of Attorney (POA) Supplement to your estate plan is well suited for families with a young adult child or student who is over the age of eighteen (18), or families with an aging parent, or any other person who needs to authorize someone to act for them legally. The Power of Attorney Supplement includes a Financial Power of Attorney, a Medical Power of Attorney, and an Advanced Healthcare Directive (a/k/a "Living Will") for one person. These documents would authorize someone to make legal or financial decisions for yourself, an adult child, an aging parent, or any other person, as well as access protected health information, consent to medical procedures, or make care arrangements if the person granting the power is unable to do so.
          </p>
        )}
      </div>
    );
  };

  const renderPersonalInfoPage = () => {
    const isPOA2Person = formType === 'powerOfAttorneyForm2Person';
    const isTwoPerson = formType.includes('2Person');
    const isPOA = formType.includes('powerOfAttorney');
    const heading = isTwoPerson ? 'Personal Information for First Person' : 'Personal Information';
    const intro = isPOA2Person
      ? 'Enter the personal information for both persons granting powers of attorney.'
      : isTwoPerson
        ? 'Enter the personal information about the persons creating this estate plan here.'
        : 'Enter your personal information below.';

    return (
      <div className="poa-page">
        <h2>{getStepNumber('personal_info')}. {heading}</h2>
        <p className="text-muted">{intro}</p>
        {isTwoPerson && !isPOA && (
          <p className="text-muted">
            Select if you and the second person creating this plan together are unmarried life partners.
            Otherwise, GeauxPlans will assume you are legally married.
          </p>
        )}

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
    const firstPersonName = [formData.personal_info.first_name, formData.personal_info.middle_name, formData.personal_info.surname]
      .map(s => (s || '').trim()).filter(Boolean).join(' ') || (isPOA ? 'the first principal' : 'the first person');
    const pageTitle = isPOA
      ? `${getStepNumber('personal_info')}. Personal Information for Second Principal`
      : `${getStepNumber('personal_info')}. Personal Information for Second Person`;
    const pageDescription = isPOA
      ? 'Enter the personal information about the second person granting powers of attorney (e.g., an adult child, aging parent, or other person):'
      : 'Enter the personal information for the second person creating this estate plan here.';

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
              Check here if this person has the same address as {firstPersonName}
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

  const renderPlanContentsPage = () => {
    const isTrust = formType.includes('trustBased');
    const isWill = formType.includes('willBased') || formType.includes('minorChild');
    const isPOA = formType.includes('powerOfAttorney');

    return (
      <div className="poa-page">
        <h2>{getStepNumber('plan_contents')}. Plan Contents</h2>
        <p><em><strong>In the following steps you will enter information to create the following documents:</strong></em></p>
        <ul className="mb-4" style={{ listStyleType: 'disc', paddingLeft: '2.5rem' }}>
          {/* Trust plans: the full WordPress document set */}
          {isTrust && (
            <>
              <li><em>Revocable Living Trust</em></li>
              <li><em>Pourover Last Will and Testament</em></li>
              <li><em>Durable Financial Power of Attorney</em></li>
              <li><em>Advance Healthcare Directive (a/k/a Living Will)</em></li>
              <li><em>HIPAA Release</em></li>
              <li><em>Act of Donation of Principal Residence</em></li>
              <li><em>Extract of Trust</em></li>
              <li><em>Certificate of Trust</em></li>
              <li><em>Trust Funding Guide</em></li>
            </>
          )}
          {/* Will-specific documents */}
          {isWill && (
            <>
              <li><em>Last Will and Testament</em></li>
              <li><em>Will Attestation</em></li>
              <li><em>Durable Financial Power of Attorney</em></li>
              <li><em>Durable Medical Power of Attorney</em></li>
              <li><em>Advance Healthcare Directive (a/k/a Living Will)</em></li>
              <li><em>HIPAA Release</em></li>
            </>
          )}
          {/* POA Supplement documents (verbatim WordPress list) */}
          {isPOA && (
            <>
              <li><em>Durable Financial Power of Attorney</em></li>
              <li><em>Durable Medical Power of Attorney</em></li>
              <li><em>Advance Healthcare Directive (a/k/a Living Will)</em></li>
              <li><em>HIPAA Release</em></li>
            </>
          )}
        </ul>
        <p>If you wish to add, remove, or edit personal information about any person to be included in your GeauxPlan, simply return to the previous steps. Your revisions will then be available in the following steps.</p>
      </div>
    );
  };

  const renderFPOAPage = () => {
    const parties = formData.people_or_entities_who_will_serve_as_agents?.parties || [];
    const isTwoPerson = formType.includes('2Person');
    const isPOA = formType.includes('powerOfAttorney');
    const secondPersonLabel = isPOA ? 'Second Principal' : 'Second Person';
    const getSecondPersonName = () => formData.spouse_info.first_name || secondPersonLabel;

    return (
      <div className="poa-page">
        <h2>{getStepNumber('fpoa')}. Financial Power of Attorney</h2>
        <p className="text-muted mb-3">
          A Financial Power of Attorney (FPOA) is a legal document that allows an individual to designate another
          person to make financial decisions for him or her when he or she cannot make decisions for himself or herself.
        </p>
        <p className="text-muted mb-3">
          Your agent's powers will include the full power to act and transact business on your behalf, including, but
          not limited to, purchasing and selling assets, establishing legal entities, such as trusts and limited
          liability companies, making and accepting donations, participating in legal proceedings, and virtually any
          other legal act that you could personally undertake.
        </p>
        <h4 className="mt-4 mb-3">{getPrincipalFullName()}'s Financial Power of Attorney</h4>
        <p className="text-muted mb-3">
          Choose {getPrincipalFullName()}'s Agents for the Financial Power of Attorney (the person {getPrincipalFullName()} wants
          to make financial decisions for them if they are incapacitated). {getPrincipalFullName()} may select a Co-Agent to
          serve at the same time as the Initial Agent. Decisions of Co-Agents will be made jointly by mutual consent.
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
                  <option value="">Select Agent...</option>
                  {isTwoPerson && (
                    <option value="spouse">{getSecondPersonName()}</option>
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
                  <option value="">None</option>
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
                        <option value="">Select Agent...</option>
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
                        <option value="">None</option>
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
            <h4 className="mb-3">{getSecondPersonName()}'s Financial Power of Attorney</h4>
            <p className="text-muted mb-3">
              Choose {getSecondPersonName()}'s Agents for the Financial Power of Attorney (the person {getSecondPersonName()} wants
              to make financial decisions for them if they are incapacitated). {getSecondPersonName()} may select a Co-Agent to
              serve at the same time as the Initial Agent. Decisions of Co-Agents will be made jointly by mutual consent.
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
                      <option value="">Select Agent...</option>
                      <option value="client">{formData.personal_info.first_name || 'First Principal'} ({isPOA ? 'First Principal' : 'First Person'})</option>
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
                      <option value="">None</option>
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
                            <option value="">Select Agent...</option>
                            <option value="client">{formData.personal_info.first_name || 'Client'} ({isPOA ? 'First Principal' : 'First Person'})</option>
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
                            <option value="">None</option>
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
    const secondPersonLabel = isPOA ? 'Second Principal' : 'Second Person';
    const getSecondPersonName = () => formData.spouse_info.first_name || secondPersonLabel;

    return (
      <div className="poa-page">
        <h2>{getStepNumber('hcpoa')}. Healthcare Power of Attorney</h2>
        <p className="text-muted mb-3">
          A Health Care Power of Attorney (HCPOA) is a legal document that allows an individual to designate another
          person to make medical decisions for him or her when he or she cannot make decisions for himself or herself.
        </p>
        <p className="text-muted mb-3">
          In other words it names someone who stands in your shoes and tells the doctors what to do or what not do for
          you. A person need not be terminally ill, elderly, or facing high risk activities to execute a HCPOA. Health
          care decisions include the power to consent, refuse consent or withdraw consent to any type of medical care,
          treatment, service or procedure. A HCPOA is also referred to as health care proxy, medical power of attorney
          and Durable Power of Attorney for Health Care.
        </p>

        <h4 className="mt-4 mb-3">{getPrincipalFullName()}'s Healthcare Power of Attorney</h4>

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
                  <option value="">Select Agent...</option>
                  {isTwoPerson && (
                    <option value="spouse">{getSecondPersonName()}</option>
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
                  <option value="">None</option>
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
                        <option value="">Select Agent...</option>
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
                        <option value="">None</option>
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
            <h4 className="mb-3">{getSecondPersonName()}'s Healthcare Power of Attorney</h4>

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
                      <option value="">Select Agent...</option>
                      <option value="client">{formData.personal_info.first_name || 'First Principal'} ({isPOA ? 'First Principal' : 'First Person'})</option>
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
                      <option value="">None</option>
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
                            <option value="">Select Agent...</option>
                            <option value="client">{formData.personal_info.first_name || 'Client'} ({isPOA ? 'First Principal' : 'First Person'})</option>
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
                            <option value="">None</option>
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
    const secondPersonLabel = isPOA ? 'Second Principal' : 'Second Person';
    const getSecondPersonName = () => formData.spouse_info.first_name || secondPersonLabel;

    return (
      <div className="poa-page">
        <h2>{getStepNumber('hcd')}. Advance Healthcare Directive</h2>
        <p className="text-muted mb-3">
          <em>Also known as a "Living Will".</em>
        </p>
        <p className="text-muted mb-3">
          A Healthcare Directive (sometimes referred to as a "Living Will") is a document that instructs your healthcare
          provider to withhold life sustaining procedures in the event two (2) physicians certify that you are in a
          terminal and irreversible condition and that your death will occur whether or not life-sustaining procedures
          are utilized or artificially prolong your life. A statement of your wishes regarding the types of medical life
          support measures you prefer to have, or have withheld if you are in a terminal condition and cannot express
          your wishes yourself. Without this legal document, your physician will spare no expense to prolong your life.
        </p>
        <p className="text-muted mb-3">
          If you wish to make that directive, you essentially have two choices: (1) to withhold all life sustaining
          procedures, including nutrition and hydration; or (2) to withhold all life-sustaining procedures, except
          nutrition and hydration. You will not be conscious or able to communicate in this end-of-life state, so
          nutrition connotes a feeding tube and hydration would be administered intravenously. You must initial next to
          your choice as indicated on the form.
        </p>
        <h4 className="mt-4 mb-3">{getPrincipalFullName()}'s Healthcare Directive</h4>
        <p className="text-muted mb-3">
          For {getPrincipalFullName()}, select whether to withdraw life support entirely or choose which support options
          to permit:
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

        {/* Second Principal HCD Section for 2-person forms */}
        {isTwoPerson && (
          <>
            <hr className="my-5" />
            <h4 className="mb-3">{getSecondPersonName()}'s Healthcare Directive</h4>
            <p className="text-muted mb-3">
              For {getSecondPersonName()}, select whether to withdraw life support entirely or choose which support
              options to permit:
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

  const renderOtherPartiesPage = () => (
    <div className="poa-page">
      <h2>{getStepNumber('agents')}. Other Parties</h2>
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
              onChange={() => setHasOtherParties('Yes')}
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

      {hasOtherParties === 'Yes' && (
        <button type="button" className="btn btn-outline-primary mb-4" onClick={addParty}>
          <i className="fas fa-plus me-2"></i> Add Party
        </button>
      )}

      {hasOtherParties === 'Yes' && (formData.people_or_entities_who_will_serve_as_agents?.parties || []).length > 0 && (
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
                        <strong>Signers</strong>
                        <span className="text-muted ms-2">- these must be one or more individuals who are authorized to sign on behalf of the entity.</span>
                      </label>

                      {(party.signers || []).map((signer, signerIndex) => (
                        <div key={signerIndex} className="card card-body bg-light mb-2">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <small className="text-muted">
                              {[signer.first_name, signer.middle_name, signer.surname, signer.suffix]
                                .map((s) => (s || '').trim())
                                .filter(Boolean)
                                .join(' ') || 'Signer'}
                            </small>
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
                                placeholder="Name"
                                value={signer.first_name}
                                onChange={(e) => updateSigner(index, signerIndex, 'first_name', e.target.value)}
                              />
                            </div>
                            <div className="col-md-2 mb-2">
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="Middle name"
                                value={signer.middle_name}
                                onChange={(e) => updateSigner(index, signerIndex, 'middle_name', e.target.value)}
                              />
                            </div>
                            <div className="col-md-3 mb-2">
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="Surname"
                                value={signer.surname}
                                onChange={(e) => updateSigner(index, signerIndex, 'surname', e.target.value)}
                              />
                            </div>
                            <div className="col-md-2 mb-2">
                              <select
                                className="form-select form-select-sm"
                                value={signer.suffix}
                                onChange={(e) => updateSigner(index, signerIndex, 'suffix', e.target.value)}
                                title="Suffix, if any"
                              >
                                <option value="">Suffix, if any</option>
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
                                <option value="">Company Title / Position for Signing</option>
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

  // ============================================================================
  // CHILDREN PAGE (Trust, Will, Minor Child plans)
  // ============================================================================
  const renderChildrenPage = () => {
    const isTwoPersonPlan = formType.includes('2Person');
    const fullNameOf = (p?: { first_name?: string; middle_name?: string; surname?: string; suffix?: string }) =>
      [p?.first_name, p?.middle_name, p?.surname, p?.suffix].map(s => (s || '').trim()).filter(Boolean).join(' ');
    const firstPersonName = fullNameOf(formData.personal_info) || 'the first person';
    const secondPersonName = fullNameOf(formData.spouse_info) || 'the second person';
    const childrenQuestion = isTwoPersonPlan
      ? `Does ${firstPersonName} or ${secondPersonName} have any children whatsoever - whether born or legally adopted?`
      : 'Do you have any children whatsoever - whether born or legally adopted?';

    return (
    <div className="poa-page">
      <h2>{getStepNumber('children')}. Children</h2>
      <p className="text-muted">Enter information about your children.</p>

      <div className="mb-3">
        <label className="form-label">{childrenQuestion} <span className="text-danger">*</span></label>
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="hasChildren"
            id="hasChildrenYes"
            value="yes"
            checked={formData.children_as_agents === true}
            onChange={() => updateNestedFormData('children_as_agents', true)}
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
            onChange={() => updateNestedFormData('children_as_agents', false)}
          />
          <label className="form-check-label" htmlFor="hasChildrenNo">No</label>
        </div>
      </div>

      {formData.children_as_agents && (
        <div className="children-roster">
          {(formData.children || []).map((child, index) => {
            const isTwoPerson = formType.includes('2Person');
            const fullName = (p?: { first_name?: string; middle_name?: string; surname?: string; suffix?: string }) =>
              [p?.first_name, p?.middle_name, p?.surname, p?.suffix].map(s => (s || '').trim()).filter(Boolean).join(' ');
            const clientName = fullName(formData.personal_info) || 'you';
            const spouseName = fullName(formData.spouse_info) || 'your spouse';
            return (
              <div key={index} className="card mb-3">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="mb-0">{fullName(child) || `Child ${index + 1}`}</h5>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => removeChild(index)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="row">
                    <div className="col-md-4 mb-3">
                      <label className="form-label">First name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={child.first_name}
                        onChange={(e) => updateChild(index, 'first_name', e.target.value)}
                      />
                    </div>
                    <div className="col-md-4 mb-3">
                      <label className="form-label">Middle name (or initial with period)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={child.middle_name}
                        onChange={(e) => updateChild(index, 'middle_name', e.target.value)}
                      />
                    </div>
                    <div className="col-md-4 mb-3">
                      <label className="form-label">Last name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={child.surname}
                        onChange={(e) => updateChild(index, 'surname', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-3 mb-3">
                      <label className="form-label">Suffix, if any</label>
                      <input
                        type="text"
                        className="form-control"
                        value={child.suffix}
                        onChange={(e) => updateChild(index, 'suffix', e.target.value)}
                      />
                    </div>
                    <div className="col-md-3 mb-3">
                      <label className="form-label">Date of birth</label>
                      <input
                        type="date"
                        className="form-control"
                        value={child.date_of_birth}
                        onChange={(e) => updateChild(index, 'date_of_birth', e.target.value)}
                      />
                    </div>
                    {isTwoPerson && (
                      <div className="col-md-6 mb-3">
                        <label className="form-label">
                          Select whether this is a child of {clientName} only, {spouseName} only, or both of them together:
                        </label>
                        <select
                          className="form-select"
                          value={child.parentage}
                          onChange={(e) => updateChild(index, 'parentage', e.target.value)}
                        >
                          <option value="Joint">{clientName} and {spouseName} together</option>
                          <option value="Client">{clientName}</option>
                          <option value="Spouse">{spouseName}</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Is this child deceased?</label>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name={`deceased-${index}`}
                        id={`deceased-yes-${index}`}
                        checked={child.deceased === true}
                        onChange={() => updateChild(index, 'deceased', true)}
                      />
                      <label className="form-check-label" htmlFor={`deceased-yes-${index}`}>Yes</label>
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name={`deceased-${index}`}
                        id={`deceased-no-${index}`}
                        checked={child.deceased === false}
                        onChange={() => updateChild(index, 'deceased', false)}
                      />
                      <label className="form-check-label" htmlFor={`deceased-no-${index}`}>No</label>
                    </div>
                  </div>

                  <div className="mb-2">
                    <label className="form-label">
                      Should this child be intentionally omitted from your estate plan (receive nothing from your estate)?
                    </label>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name={`disinherit-${index}`}
                        id={`disinherit-yes-${index}`}
                        checked={child.disinherit === true}
                        onChange={() => updateChild(index, 'disinherit', true)}
                      />
                      <label className="form-check-label" htmlFor={`disinherit-yes-${index}`}>Yes</label>
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name={`disinherit-${index}`}
                        id={`disinherit-no-${index}`}
                        checked={child.disinherit === false}
                        onChange={() => updateChild(index, 'disinherit', false)}
                      />
                      <label className="form-check-label" htmlFor={`disinherit-no-${index}`}>No</label>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <button type="button" className="btn btn-outline-primary" onClick={addChild}>
            <i className="fas fa-plus me-2"></i>
            Add a child
          </button>
        </div>
      )}
    </div>
    );
  };

  // ============================================================================
  // RLT PAGE — Revocable Living Trust (Trust plans only)
  // ============================================================================
  const renderRLTPage = () => {
    const isTwoPerson = formType.includes('2Person');
    const ti = formData.trust_info;
    const principal = getPrincipalFullName();
    const secondFullName = [formData.spouse_info.first_name, formData.spouse_info.middle_name, formData.spouse_info.surname]
      .filter(Boolean).join(' ') || 'the second person';
    const bothNames = isTwoPerson ? `${principal} and ${secondFullName}` : principal;
    const bequestAsker = isTwoPerson ? `${principal} and / or ${secondFullName}` : principal;
    const beneficiaryOptions = getBeneficiaryOptions();
    const trustees = ti.trustees || [];
    const bequests = ti.specific_bequests || [];
    const dist = ti.residuary_distribution || [];
    const residTotal = dist.reduce((sum, d) => sum + (parseFloat(d.share_percent) || 0), 0);

    return (
      <div className="poa-page">
        <h2>{getStepNumber('rlt')}. Revocable Living Trust</h2>
        <p className="lead text-blue"><em>Your Trust. Your Control.</em></p>
        <p className="text-muted">
          A Revocable Living Trust is the cornerstone of your estate plan. It allows you to manage, control, and
          protect your assets during your lifetime—and direct their distribution after your death—without the delays
          or costs of probate.
        </p>
        <p className="text-muted">
          As the Settlor, you retain full authority over the trust. You can amend, modify, or revoke it at any time
          for any reason, as long as you are living and have mental capacity. That means you can:
        </p>
        <ul className="text-muted">
          <li>Add or remove assets</li>
          <li>Change beneficiaries</li>
          <li>Update your Trustees</li>
          <li>Revise distribution instructions—all with flexibility and ease.</li>
        </ul>
        <p className="text-muted">
          {isTwoPerson
            ? 'You will serve as the Initial Co-Trustees, maintaining control of the assets placed in trust. If one of you is unable or unwilling to serve as Trustee, the other will serve alone. You\u2019ll also name a Successor Trustee to step in and manage things in the event of your incapacity or death.'
            : 'You will serve as the Initial Trustee, maintaining control of the assets placed in trust. You\u2019ll also name a Successor Trustee to step in and manage things in the event of your incapacity or death.'}
        </p>
        <p className="text-muted">
          After your passing, the Successor Trustee will carry out your wishes without court supervision, ensuring a
          smooth, private, and efficient transfer of your legacy to your loved ones.
        </p>
        <p className="text-muted">A well-drafted and properly funded Revocable Living Trust helps you:</p>
        <ul className="text-muted">
          <li>Avoid probate</li>
          <li>Protect your privacy</li>
          <li>Plan for incapacity</li>
          <li>Minimize disputes</li>
          <li>Maintain control over your estate</li>
        </ul>
        <p className="text-muted">
          Your trust is a living document—and like your life, it can evolve. Use it to stay in control today while
          planning wisely for tomorrow.
        </p>

        <div className="alert alert-light border">
          <h5>Let's Start Building Your Trust</h5>
          <p>
            Now that you understand the purpose of a Revocable Living Trust and how it fits into your overall estate
            plan, let's begin by entering the key information needed to set up your trust.
          </p>
          <p className="mb-1">We'll guide you step-by-step through identifying:</p>
          <ul className="mb-0">
            <li>Who will manage it (the Trustee),</li>
            <li>Who will benefit from it (your Beneficiaries),</li>
            <li>And any specific instructions or wishes you'd like us to follow.</li>
          </ul>
        </div>

        {/* ---- Trustees ---- */}
        <h4 className="mt-4 border-bottom pb-2">Trustees</h4>
        <p className="text-muted">
          Your Revocable Living Trust will be managed by one or more Trustees, who have a legal responsibility to
          oversee and administer trust assets according to your instructions.
        </p>
        {isTwoPerson ? (
          <>
            <p className="text-muted">
              <strong>NOTE:</strong> {bothNames} will serve as the initial Co-Trustees, which means {bothNames} will
              co-manage your trust — handling investments, paying expenses, and making distributions. However, it's
              important to understand that only the Settlors (the persons who created the trust, who also happen to be
              {' '}{bothNames}) will have the authority to amend, modify, or revoke the trust by mutual consent while
              you both are surviving.
            </p>
            <p className="text-muted">
              The Trustee (whoever this may be) is bound to follow the terms of the trust and cannot change them
              without action from the Settlors.
            </p>
            <p className="text-muted">
              Once you both are no longer able or willing to serve as Trustee, Successor Trustees will take over. You
              will choose these individuals now to ensure a smooth transition in the future.
            </p>
          </>
        ) : (
          <>
            <p className="text-muted">
              <strong>NOTE:</strong> {principal} will serve as the initial Trustee, which means {principal} will
              manage the trust — handling investments, paying expenses, and making distributions. Only the Settlor
              (the person who created the trust) has the authority to amend, modify, or revoke the trust while
              surviving and with mental capacity.
            </p>
            <p className="text-muted">
              Once {principal} is no longer able or willing to serve as Trustee, Successor Trustees will take over.
              You will choose these individuals now to ensure a smooth transition in the future.
            </p>
          </>
        )}
        <p className="text-muted mb-1">You may:</p>
        <ul className="text-muted">
          <li>List Successor Trustees in order of priority, and</li>
          <li>Choose Co-Trustees to serve jointly who must act by mutual consent.</li>
        </ul>
        <p className="text-muted">
          Your Successor Trustees will manage and distribute trust assets according to the terms you've set.
        </p>
        <h5 className="mt-3">Successor Trustees</h5>
        <label className="form-label">Do you want to appoint successor Trustees?</label>
        <div className="mb-3">
          <div className="form-check form-check-inline">
            <input className="form-check-input" type="radio" name="hasSuccessorTrustees" checked={ti.has_successor_trustees === 'Yes'} onChange={() => updateFormData('trust_info', 'has_successor_trustees', 'Yes')} />
            <label className="form-check-label">Yes</label>
          </div>
          <div className="form-check form-check-inline">
            <input
              className="form-check-input"
              type="radio"
              name="hasSuccessorTrustees"
              checked={ti.has_successor_trustees === 'No'}
              onChange={() => setFormData(prev => ({ ...prev, trust_info: { ...prev.trust_info, has_successor_trustees: 'No', trustees: [] } }))}
            />
            <label className="form-check-label">No</label>
          </div>
        </div>

        {ti.has_successor_trustees === 'Yes' && (
          <>
            {trustees.map((t, index) => (
              <div key={index} className="card mb-2">
                <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                  <span>{getOrdinalLabel(index)} Successor Trustee</span>
                  <button type="button" className="btn btn-sm btn-link text-white p-0" onClick={() => removeTrustee(index)}>×</button>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Select the person you want to serve:</label>
                      <select className="form-select" value={t.trustee_to_serve} onChange={(e) => updateTrustee(index, 'trustee_to_serve', e.target.value)}>
                        <option value="">Select Trustee...</option>
                        {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">If you want to appoint a second person to serve at the same time as the person to the left, select them here:</label>
                      <select className="form-select" value={t.second_trustee_person_to_serve} onChange={(e) => updateTrustee(index, 'second_trustee_person_to_serve', e.target.value)}>
                        <option value="">None</option>
                        {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-outline-primary mb-2" onClick={addTrustee}>+ Add Successor Trustee</button>
            {errors['trust_info.trustees'] && <div className="text-danger small mb-2">{errors['trust_info.trustees']}</div>}
          </>
        )}

        {/* ---- Trust Specific Bequests ---- */}
        <div className="mt-4 p-3" style={{ backgroundColor: '#FAFAFA' }}>
          <h4 className="border-bottom pb-2">Trust Specific Bequests</h4>
          <p className="text-muted">
            This section allows you to make specific gifts—also known as specific bequests—to individuals or
            organizations. These gifts can include particular items of personal property (such as jewelry,
            collectibles, or vehicles), specific amounts of money, or even real estate.
          </p>
          <p className="text-muted">
            These designated gifts will be distributed outright to the people or entities you name after your death.
          </p>
          <p className="text-muted">
            Any remaining assets that are not given away through specific bequests will be handled later in the
            "Final Trust Distributions" section. Those assets will be divided among the beneficiaries you designate to
            receive the rest of your trust property.
          </p>
          <label className="form-label">
            Does {bequestAsker} want to make a specific bequest of any trust property—such as a home, vehicle,
            jewelry, or other item—to a particular person, organization, or entity?
          </label>
          <div>
            <div className="form-check form-check-inline">
              <input className="form-check-input" type="radio" name="hasSpecificBequests" checked={ti.has_specific_bequests === true} onChange={() => updateFormData('trust_info', 'has_specific_bequests', true)} />
              <label className="form-check-label">Yes</label>
            </div>
            <div className="form-check form-check-inline">
              <input className="form-check-input" type="radio" name="hasSpecificBequests" checked={ti.has_specific_bequests === false} onChange={() => updateFormData('trust_info', 'has_specific_bequests', false)} />
              <label className="form-check-label">No</label>
            </div>
          </div>

          {ti.has_specific_bequests && (
            <div className="mt-3">
              <p className="text-muted">Enter details below for any specific gifts you would like to leave to a particular person or organization.</p>
              {bequests.map((b, index) => (
                <div key={index} className="card mb-2">
                  <div className="card-header d-flex justify-content-between align-items-center">
                    <span>{getOrdinalLabel(index)} Specific Bequest</span>
                    <button type="button" className="btn btn-sm btn-link p-0" onClick={() => removeBequest(index)}>×</button>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <label className="form-label">Is this bequest to multiple recipients?</label>
                      <div>
                        <div className="form-check form-check-inline">
                          <input className="form-check-input" type="radio" name={`multiple_recipients_${index}`} checked={b.multiple_recipients === 'Yes'} onChange={() => updateBequest(index, 'multiple_recipients', 'Yes')} />
                          <label className="form-check-label">Yes</label>
                        </div>
                        <div className="form-check form-check-inline">
                          <input className="form-check-input" type="radio" name={`multiple_recipients_${index}`} checked={b.multiple_recipients !== 'Yes'} onChange={() => updateBequest(index, 'multiple_recipients', 'No')} />
                          <label className="form-check-label">No</label>
                        </div>
                      </div>
                    </div>
                    <div className="row">
                      <div className="col-md-6 mb-3">
                        <label className="form-label">Recipient:</label>
                        <select className="form-select" value={b.recipient} onChange={(e) => updateBequest(index, 'recipient', e.target.value)}>
                          <option value="">Select recipient...</option>
                          {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                        </select>
                      </div>
                      {b.multiple_recipients === 'Yes' && (
                        <div className="col-md-6 mb-3">
                          <label className="form-label">Second recipient:</label>
                          <select className="form-select" value={b.second_recipient} onChange={(e) => updateBequest(index, 'second_recipient', e.target.value)}>
                            <option value="">Select recipient...</option>
                            {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="mb-2">
                      <label className="form-label">Describe the gift or item:</label>
                      <textarea className="form-control" rows={2} value={b.description} onChange={(e) => updateBequest(index, 'description', e.target.value)} placeholder="e.g., My grandmother's ring, the family home at 123 Main St, $10,000" />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-outline-primary" onClick={addBequest}>+ Add Specific Bequest</button>
              {errors['trust_info.specific_bequests'] && <div className="text-danger small mt-2">{errors['trust_info.specific_bequests']}</div>}
            </div>
          )}
        </div>

        {/* ---- Final Trust Distributions ---- */}
        <h4 className="mt-4 border-bottom pb-2">Final Trust Distributions</h4>
        <p className="text-muted">
          Once you pass away, any remaining assets in your trust—after specific gifts have been distributed—will be
          divided among the beneficiaries you list below. These beneficiaries are typically your children,
          grandchildren, or other individuals or organizations you wish to inherit the rest of your estate.
        </p>
        <p className="text-muted">You can choose to leave each beneficiary's share in one of two ways:</p>
        <p className="text-muted mb-1"><strong>Outright Distribution</strong></p>
        <p className="text-muted">
          The beneficiary receives full ownership of their share immediately with no restrictions.
        </p>
        <p className="text-muted mb-1"><strong>In Trust (Age-Based Distribution)</strong></p>
        <p className="text-muted">
          You may prefer to have the inheritance held in trust and distributed to the beneficiary over time. In this
          case, you can choose specific ages or age ranges for staggered distributions (e.g., 1/3 at age 25, 1/3 at
          age 30, and the rest at age 35).
        </p>
        <p className="text-muted">
          While the inheritance remains in trust, the Trustee may use the funds for the beneficiary's health,
          education, maintenance, and support—providing financial stability and protection until the distribution
          ages are met. These trusts also include spendthrift provisions, which help safeguard the inheritance from
          creditors, lawsuits, and poor spending habits.
        </p>
        <p className="text-muted">
          You'll be able to designate both the percentage each beneficiary will receive and whether their share
          should be distributed outright or in trust. All percentages must total 100%.
        </p>
        <p className="text-muted">
          This step ensures your estate is distributed according to your wishes—clearly and securely.
        </p>
        <label className="form-label">
          Will the final trust distribution be equal among all recipients? i.e., 1/3 to person A, 1/3 to person B,
          1/3 to person C?
        </label>
        <div className="mb-3">
          <div className="form-check form-check-inline">
            <input className="form-check-input" type="radio" name="distributionsEqual" checked={ti.distributions_equal === true} onChange={() => updateFormData('trust_info', 'distributions_equal', true)} />
            <label className="form-check-label">Yes</label>
          </div>
          <div className="form-check form-check-inline">
            <input className="form-check-input" type="radio" name="distributionsEqual" checked={ti.distributions_equal === false} onChange={() => updateFormData('trust_info', 'distributions_equal', false)} />
            <label className="form-check-label">No</label>
          </div>
        </div>
        <p className="text-muted">
          <strong>NOTE:</strong> You may divide the final distribution among one or more beneficiaries. Percentages
          must total 100%.
        </p>

        {dist.map((d, index) => (
          <div key={index} className="card mb-2">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span>Beneficiary {index + 1}</span>
              <button type="button" className="btn btn-sm btn-link p-0" onClick={() => removeDistribution(index)}>×</button>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-4 mb-3">
                  <label className="form-label">Beneficiary:</label>
                  <select className="form-select" value={d.recipient} onChange={(e) => updateDistribution(index, 'recipient', e.target.value)}>
                    <option value="">Select beneficiary...</option>
                    {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                  </select>
                </div>
                {!ti.distributions_equal && (
                  <div className="col-md-3 mb-3">
                    <label className="form-label">Share (%)</label>
                    <input type="number" min={0} max={100} className="form-control" value={d.share_percent} onChange={(e) => updateDistribution(index, 'share_percent', e.target.value)} />
                  </div>
                )}
                <div className="col-md-3 mb-3">
                  <label className="form-label">How received:</label>
                  <select className="form-select" value={d.how_receive} onChange={(e) => updateDistribution(index, 'how_receive', e.target.value)}>
                    <option value="Outright">Outright</option>
                    <option value="In Trust">In Trust (age-based)</option>
                  </select>
                </div>
              </div>
              {d.how_receive === 'In Trust' && renderInTrustDetails('trust_info', d, index)}
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-outline-primary" onClick={addDistribution}>+ Add Beneficiary to Receive Final Distribution</button>
        {!ti.distributions_equal && dist.length > 0 && (
          <div className={`small mt-2 ${Math.abs(residTotal - 100) < 0.01 ? 'text-success' : 'text-danger'}`}>
            Total: {Math.round(residTotal * 100) / 100}% {Math.abs(residTotal - 100) < 0.01 ? '✓' : '(must equal 100%)'}
          </div>
        )}
        {errors['trust_info.residuary_distribution'] && <div className="text-danger small mt-2">{errors['trust_info.residuary_distribution']}</div>}

        <div className="alert alert-info mt-3">
          <p>
            In the event a person receives an interest through the occurrence of an unforeseeable event, such as the
            death of a named beneficiary, a contingent Under-Age Beneficiary Trust is established if the person is
            below eighteen (18) years of age to ensure the person receiving the interest is at least the legal age of
            majority to receive assets.
          </p>
          <p className="mb-0">
            For example, if you name a child as a legatee under the Trust and your child predeceases you, leaving
            behind children (your grandchildren), your grandchildren will receive your predeceased child's interest by
            representation under Louisiana law. In this case, your GeauxPlans Revocable Living Trust directs the
            interest to be held for the benefit of your grandchild until age eighteen (18), at which time the
            contingent Under-Age Beneficiary Trust will terminate and the assets will be distributed outright to the
            grandchild.
          </p>
        </div>

        {/* ---- Tutor / Under-Tutor ---- */}
        <h4 className="mt-4 border-bottom pb-2">Tutor and Under-Tutor (Legal Guardian for Minor Children)</h4>
        <p className="text-muted">
          A Tutor is the person who will be legally responsible for the care and upbringing of your minor children if
          you (and the other parent) are unable to do so. Under Louisiana law, you may also name an Under-Tutor, who
          serves as a safeguard by overseeing the Tutor's management of the child's affairs.
        </p>
        <p className="text-muted">
          If the other natural parent is still living, they will generally have the first legal right to serve as
          Tutor. For that reason, you typically would not list the other parent here—only the person you want to serve
          if neither parent is able to.
        </p>
        <div className="form-check mb-3">
          <input className="form-check-input" type="checkbox" id="appointTutor" checked={ti.appoint_tutor === true} onChange={(e) => updateFormData('trust_info', 'appoint_tutor', e.target.checked)} />
          <label className="form-check-label" htmlFor="appointTutor">Appoint a Tutor and Under-Tutor to care for minor children.</label>
        </div>
        {ti.appoint_tutor && (
          <>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Select the Tutor for your minor children</label>
                <select className="form-select" value={ti.tutor} onChange={(e) => updateFormData('trust_info', 'tutor', e.target.value)}>
                  <option value="">Select Tutor...</option>
                  {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Select the Under-Tutor for your minor children</label>
                <select className="form-select" value={ti.under_tutor} onChange={(e) => updateFormData('trust_info', 'under_tutor', e.target.value)}>
                  <option value="">Select Under-Tutor...</option>
                  {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                </select>
              </div>
              {errors['trust_info.tutor'] && <div className="text-danger small">{errors['trust_info.tutor']}</div>}
            </div>

            {/* ---- Successor Tutors ---- */}
            <label className="form-label">Do you want to appoint successor Tutors for the Trust?</label>
            <div className="mb-3">
              <div className="form-check form-check-inline">
                <input className="form-check-input" type="radio" name="hasSuccessorTutors" checked={ti.has_successor_tutors === 'Yes'} onChange={() => updateFormData('trust_info', 'has_successor_tutors', 'Yes')} />
                <label className="form-check-label">Yes</label>
              </div>
              <div className="form-check form-check-inline">
                <input className="form-check-input" type="radio" name="hasSuccessorTutors" checked={ti.has_successor_tutors === 'No'} onChange={() => updateFormData('trust_info', 'has_successor_tutors', 'No')} />
                <label className="form-check-label">No</label>
              </div>
            </div>

            {ti.has_successor_tutors === 'Yes' && (
              <div className="mb-3">
                {(ti.successor_tutors || []).map((s, index) => (
                  <div key={index} className="card mb-2">
                    <div className="card-header d-flex justify-content-between align-items-center">
                      <span>{getOrdinalLabel(index)} Successor Tutor</span>
                      <button type="button" className="btn btn-sm btn-link p-0" onClick={() => removeSuccessorTutor(index)}>×</button>
                    </div>
                    <div className="card-body">
                      <label className="form-label">Select the person you want to serve:</label>
                      <select className="form-select" value={s.successor_tutor_to_serve} onChange={(e) => updateSuccessorTutor(index, e.target.value)}>
                        <option value="">Select Successor Tutor...</option>
                        {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                      </select>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn-outline-primary" onClick={addSuccessorTutor}>
                  + Add {(ti.successor_tutors || []).length === 0 ? 'First' : 'Another'} Successor Tutor
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ============================================================================
  // DOR PAGE — Donation of Residence (Trust plans only)
  // ============================================================================
  const renderDORPage = () => {
    const dor = formData.dor;
    const hasLegal = dor.have_full_legal_description_for_home;
    return (
      <div className="poa-page">
        <h2>{getStepNumber('dor')}. Donation of Residence</h2>
        <p className="text-muted">
          The process of transferring assets into your trust is commonly referred to as "trust funding." In order for
          your trust to function properly and avoid probate, it must be properly funded with your assets.
        </p>
        <p className="text-muted">
          As part of your GeauxPlans Trust-Based Estate Plan, we will prepare one Act of Donation for a Louisiana
          residence—specifically, Louisiana immovable property (real estate). This deed will include a reserved usufruct
          in favor of the donor(s), meaning you retain the right to use and enjoy the home during your lifetime. This
          approach is designed to preserve the Louisiana homestead exemption and support seamless integration into your
          Revocable Living Trust.
        </p>
        <p className="text-muted">
          <strong>Please note:</strong> This deed is limited to property located in Louisiana. Out-of-state real estate
          is not eligible for this donation deed and may require alternative or supplemental trust funding methods, which
          can be discussed with an attorney or title company.
        </p>

        <h4 className="mt-4 border-bottom pb-2">Act of Donation for Home</h4>

        <div className="mb-3">
          <label className="form-label">In which State is the property located?</label>
          <input type="text" className="form-control" value="Louisiana" readOnly disabled />
        </div>

        <div className="mb-3">
          <label className="form-label">Parish or County <span className="text-danger">*</span></label>
          <input
            type="text"
            className={`form-control ${errors['dor.parish_where_home_is_located'] ? 'is-invalid' : ''}`}
            value={dor.parish_where_home_is_located}
            onChange={(e) => updateFormData('dor', 'parish_where_home_is_located', e.target.value)}
          />
          {errors['dor.parish_where_home_is_located'] && <div className="invalid-feedback">{errors['dor.parish_where_home_is_located']}</div>}
        </div>

        <div className="alert alert-light border">
          <p>
            To complete the Act of Donation, we must include the full legal description of your property. An abbreviated
            version—like the one found on your tax assessor's notice—is not sufficient.
          </p>
          <p className="mb-1">You can typically find the full legal description in documents such as:</p>
          <ul className="mb-2">
            <li>Your original act of sale</li>
            <li>A prior act of donation</li>
            <li>A judgment of possession or other recorded conveyance document</li>
            <li>A previously prepared deed</li>
          </ul>
          <p className="mb-0">
            If you don't currently have the full legal description, select "No". You can still move forward—you can add
            the legal description later as an Exhibit once it becomes available.
          </p>
        </div>

        <div className="mb-3">
          <label className="form-label">Do You Have the Full Legal Description for Your Home? <span className="text-danger">*</span></label>
          <select
            className="form-select"
            value={hasLegal}
            onChange={(e) => updateFormData('dor', 'have_full_legal_description_for_home', e.target.value)}
          >
            <option value="">Select...</option>
            <option value="Yes, I have the complete legal description">Yes, I have the complete legal description</option>
            <option value="No, I do not have a complete legal description">No, I do not have a complete legal description</option>
          </select>
        </div>

        {hasLegal === 'Yes, I have the complete legal description' && (
          <div className="mb-3">
            <label className="form-label">Insert full legal description here: <span className="text-danger">*</span></label>
            <textarea
              className={`form-control ${errors['dor.full_legal_description'] ? 'is-invalid' : ''}`}
              rows={5}
              value={dor.full_legal_description}
              onChange={(e) => updateFormData('dor', 'full_legal_description', e.target.value)}
            />
            {errors['dor.full_legal_description'] && <div className="invalid-feedback">{errors['dor.full_legal_description']}</div>}
          </div>
        )}

        {hasLegal === 'No, I do not have a complete legal description' && (
          <div className="p-3" style={{ backgroundColor: '#FAFAFA' }}>
            <strong>You must complete these steps later:</strong>
            <ul className="mb-0">
              <li>Obtain a copy of your full legal description (from your deed, judgment of possession, or other conveyance document).</li>
              <li>Ensure it is typed or scanned clearly on a separate page labeled <em>Exhibit A</em>.</li>
              <li>This page will be attached to and recorded with your Act of Donation, which references Exhibit A as the source of the legal property description.</li>
            </ul>
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // EXECUTORS PAGE (Will &amp; Trust plans)
  // ============================================================================
  const renderExecutorsPage = () => {
    const wi = formData.will_info;
    const isTrust = formType.includes('trustBased');
    const isTwoPerson = formType.includes('2Person');

    const clientName = getPrincipalFullName();
    const spouseName = [formData.spouse_info.first_name, formData.spouse_info.middle_name, formData.spouse_info.surname]
      .filter(Boolean).join(' ') || 'Second Person';

    const renderExecutorSection = (principal: ExecutorPrincipal) => {
      const isSpouse = principal === 'spouse';
      const f = execFields(principal);
      const name = isSpouse ? spouseName : clientName;
      const otherName = isSpouse ? clientName : spouseName;
      const options = getExecutorOptions(principal);
      const initialExecs = (wi[f.initial] as Array<{ initial_executor: string; co_executor: string }>) || [];
      const successorExecs = (wi[f.successor] as Array<{ successor_agent_to_serve: string; second_successor_coagent_to_serve: string }>) || [];
      const hasSuccessorField = isSpouse ? 'spouse_has_successor_executors' : 'has_successor_executors';
      const hasSuccessor = wi[hasSuccessorField] as string;
      const shortcutField = isSpouse ? 'name_first_principal_as_executor' : 'name_second_principal_as_executor';
      const shortcut = wi[shortcutField] as string;
      const errorKey = isSpouse ? 'will_info.spouse_initial_executors' : 'will_info.initial_executors';

      const setShortcutYes = () => {
        updateNestedFormData(`will_info.${shortcutField}`, 'Yes');
        setFormData(prev => ({
          ...prev,
          will_info: syncExecutorSingles(
            { ...prev.will_info, [f.initial]: [{ initial_executor: otherName, co_executor: '' }] },
            principal,
          ),
        }));
      };
      const setShortcutNo = () => {
        updateNestedFormData(`will_info.${shortcutField}`, 'No');
        setFormData(prev => {
          const rows = (prev.will_info[f.initial] as Array<{ initial_executor: string; co_executor: string }>) || [];
          const cleared = rows.map((r) => r.initial_executor === otherName ? { ...r, initial_executor: '' } : r);
          return { ...prev, will_info: syncExecutorSingles({ ...prev.will_info, [f.initial]: cleared }, principal) };
        });
      };

      return (
        <React.Fragment key={principal}>
          {/* ---- Initial Executors ---- */}
          <h4 className="mt-4 border-bottom pb-2">Executors in {name}'s Will</h4>
          {isTrust && (
            <p className="text-muted">
              The only decision you need to make for your Pourover Will is the selection of your Independent Executor.
              This is the person responsible for opening a Louisiana succession, if necessary, to transfer omitted assets
              into your Revocable Living Trust.
            </p>
          )}
          <p className="text-muted">
            The Executor(s) are the person or people {name} wants to manage the distribution of {name}'s estate
            after having passed. {name} may select Co-Executors (more than one person) to serve at the same time.
            Decisions of Co-Executors would be made jointly by mutual consent.
          </p>
          <p className="text-muted">
            This {isTrust ? 'Pourover Will' : 'Will'} provides for Independent Administration, which means {name}'s
            Executors will have the ability to act without pre-approval or permission of a Court. The initial Executor
            will serve first; you may select one initial Executor to serve alone, or two initial Co-Executors to serve at
            the same time.
          </p>

          {/* ---- Sole-executor shortcut (2-person only) ---- */}
          {isTwoPerson && (
            <div className="mb-3">
              <label className="form-label">Does {name} want to name {otherName} as their sole executor, if {otherName} survives them?</label>
              <div>
                <div className="form-check form-check-inline">
                  <input className="form-check-input" type="radio" name={`soleExec_${principal}`} checked={shortcut === 'Yes'} onChange={setShortcutYes} />
                  <label className="form-check-label">Yes</label>
                </div>
                <div className="form-check form-check-inline">
                  <input className="form-check-input" type="radio" name={`soleExec_${principal}`} checked={shortcut === 'No'} onChange={setShortcutNo} />
                  <label className="form-check-label">No</label>
                </div>
              </div>
            </div>
          )}

          {(!isTwoPerson || shortcut === 'No') && (
            <>
              {initialExecs.map((ex, index) => (
                <div key={index} className="card mb-2">
                  <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <span>{getOrdinalLabel(index)} Initial Executor</span>
                    <button type="button" className="btn btn-sm btn-link text-white p-0" onClick={() => removeInitialExecutor(index, principal)}>×</button>
                  </div>
                  <div className="card-body">
                    <div className="row">
                      <div className="col-md-6 mb-3">
                        <label className="form-label">Select the person you want to serve as Executor:</label>
                        <select className="form-select" value={ex.initial_executor} onChange={(e) => updateInitialExecutor(index, 'initial_executor', e.target.value, principal)}>
                          <option value="">Select Executor...</option>
                          {options.map((n) => (<option key={n} value={n}>{n}</option>))}
                        </select>
                      </div>
                      <div className="col-md-6 mb-3">
                        <label className="form-label">If you want to appoint a Co-Executor to serve at the same time, select them here:</label>
                        <select className="form-select" value={ex.co_executor} onChange={(e) => updateInitialExecutor(index, 'co_executor', e.target.value, principal)}>
                          <option value="">None</option>
                          {options.map((n) => (<option key={n} value={n}>{n}</option>))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-outline-primary mb-2" onClick={() => addInitialExecutor(principal)}>+ Add Initial Executor</button>
              {errors[errorKey] && <div className="text-danger small mb-2">{errors[errorKey]}</div>}
            </>
          )}

          {/* ---- Successor Executors ---- */}
          <h4 className="mt-4 border-bottom pb-2">Successor Executors</h4>
          <p className="text-muted">
            Your successor Executors will serve if all of the initial Executors are unable to serve. These successor
            Executors will serve in the order they are entered.
          </p>
          <label className="form-label">Do you want to appoint successor Executors for {name}'s Will?</label>
          <div className="mb-3">
            <div className="form-check form-check-inline">
              <input className="form-check-input" type="radio" name={`hasSuccessorExecutors_${principal}`} checked={hasSuccessor === 'Yes'} onChange={() => updateFormData('will_info', hasSuccessorField, 'Yes')} />
              <label className="form-check-label">Yes</label>
            </div>
            <div className="form-check form-check-inline">
              <input className="form-check-input" type="radio" name={`hasSuccessorExecutors_${principal}`} checked={hasSuccessor === 'No'} onChange={() => updateFormData('will_info', hasSuccessorField, 'No')} />
              <label className="form-check-label">No</label>
            </div>
          </div>

          {hasSuccessor === 'Yes' && (
            <div>
              {successorExecs.map((ex, index) => (
                <div key={index} className="card mb-2">
                  <div className="card-header d-flex justify-content-between align-items-center">
                    <span>{getOrdinalLabel(index)} Successor Executor</span>
                    <button type="button" className="btn btn-sm btn-link p-0" onClick={() => removeSuccessorExecutor(index, principal)}>×</button>
                  </div>
                  <div className="card-body">
                    <div className="row">
                      <div className="col-md-6 mb-3">
                        <label className="form-label">Select the person you want to serve:</label>
                        <select className="form-select" value={ex.successor_agent_to_serve} onChange={(e) => updateSuccessorExecutor(index, 'successor_agent_to_serve', e.target.value, principal)}>
                          <option value="">Select Executor...</option>
                          {options.map((n) => (<option key={n} value={n}>{n}</option>))}
                        </select>
                      </div>
                      <div className="col-md-6 mb-3">
                        <label className="form-label">If you want to appoint a second person to serve at the same time, select them here:</label>
                        <select className="form-select" value={ex.second_successor_coagent_to_serve} onChange={(e) => updateSuccessorExecutor(index, 'second_successor_coagent_to_serve', e.target.value, principal)}>
                          <option value="">None</option>
                          {options.map((n) => (<option key={n} value={n}>{n}</option>))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-outline-primary" onClick={() => addSuccessorExecutor(principal)}>+ Add Successor Executor</button>
            </div>
          )}
        </React.Fragment>
      );
    };

    return (
      <div className="poa-page">
        {isTrust ? (
          <>
            <h2>{getStepNumber('executors')}. Pourover Last Will and Testament</h2>
            <p className="text-muted">
              A Pourover Last Will and Testament is an ancillary document that accompanies a trust-based estate plan.
              Its primary function is to serve as a legal "catch-all," ensuring that any probate assets not transferred
              to your trust during your lifetime are "poured over" into your trust at death, through the probate process.
            </p>
            <p className="text-muted">
              Assets governed by beneficiary designation—such as life insurance policies, retirement accounts, and
              annuities—are considered non-probate assets. These do not pass through your Will, and instead go directly
              to the named beneficiaries. The Pourover Will only applies to probate assets, meaning assets that are not
              titled in the name of your trust and not governed by a beneficiary designation at the time of your death.
            </p>
            <p className="text-muted">
              Think of it like a decanter: properly funded trusts handle the distribution of most of your estate, but
              if anything is left out, the Pourover Will acts as a legal mechanism to transfer those remaining assets
              into the trust through probate.
            </p>
            <p className="text-muted">
              A well-funded trust typically avoids the need for a Pourover Will entirely. However, we include it as a
              precautionary measure—a legal backstop to keep your trust at the center of your estate plan.
            </p>
          </>
        ) : (
          <>
            <h2>{getStepNumber('executors')}. Executors</h2>
            <p className="text-muted">
              Your Executor is responsible for administering your estate—opening a Louisiana succession if necessary,
              paying debts and taxes, and distributing your assets according to your Will.
            </p>
          </>
        )}

        {renderExecutorSection('client')}
        {isTwoPerson && renderExecutorSection('spouse')}

        {isTrust && (
          <div className="alert alert-light border mt-3">
            <i className="fas fa-info-circle me-2"></i>
            A probate will not be required, and there is no need to use your Pourover Will or to appoint an Executor if
            your Revocable Trust is properly funded, so these appointments are simply a safety measure.
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // GUARDIANS PAGE (Will & Minor Child plans)
  // ============================================================================
  const renderGuardiansPage = () => {
    const guardianOptions = getBeneficiaryOptions();
    return (
      <div className="poa-page">
        <h2>{getStepNumber('guardians')}. Tutor and Under-Tutor (Legal Guardian for Minor Children)</h2>
        <p className="text-muted">
          If you have children under the age of 18, you may appoint someone to serve as Tutor (legal guardian) in the
          event you pass away or become unable to care for your child.
        </p>
        <p className="text-muted">
          Under Louisiana law, the child's surviving parent is automatically the "natural Tutor" and has priority to
          serve. Therefore, any Tutor you name will only act if the child's other parent is deceased, unwilling, or
          unable to serve in that role. For that reason, do not list the other parent as your nominated Tutor.
        </p>
        <p className="text-muted">
          In addition, Louisiana law requires you to name an Under-Tutor, who serves as a safeguard and must consent to
          certain decisions made by the Tutor. If you do not nominate an Under-Tutor, the Court will appoint one to
          serve alongside the Tutor.
        </p>

        <h4 className="mt-4 border-bottom pb-2">Tutor and Under-Tutor</h4>

        <div className="mb-3">
          <label className="form-label">Select the tutor for Your Minor Children</label>
          <select
            className="form-select"
            value={formData.will_info?.primary_guardian || ''}
            onChange={(e) => updateFormData('will_info', 'primary_guardian', e.target.value)}
          >
            <option value="">Select Tutor...</option>
            {guardianOptions.map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
          <small className="text-muted">
            This is your first-choice guardian to care for your minor children if you pass away while they are under
            age 18.
          </small>
        </div>

        <div className="mb-3">
          <label className="form-label">Select the Under-Tutor for Your Minor Children</label>
          <select
            className="form-select"
            value={formData.will_info?.backup_guardian || ''}
            onChange={(e) => updateFormData('will_info', 'backup_guardian', e.target.value)}
          >
            <option value="">Select Under-Tutor...</option>
            {guardianOptions.map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
          <small className="text-muted">This person must approve certain actions taken by the Tutor.</small>
        </div>
      </div>
    );
  };

  // ============================================================================
  // WILL DISTRIBUTION PAGE (Will plans only)
  // ============================================================================
  const renderWillDistributionPage = () => {
    const wi = formData.will_info;
    const principal = getPrincipalFullName();
    const beneficiaryOptions = getBeneficiaryOptions();
    const bequests = wi.specific_bequests || [];
    const dist = wi.residuary_distribution || [];
    const residTotal = dist.reduce((sum, d) => sum + (parseFloat(d.share_percent) || 0), 0);

    return (
      <div className="poa-page">
        <h2>{getStepNumber('will_distribution')}. Will Distribution</h2>
        <p className="text-muted">
          Specify how {principal}'s assets should be distributed. First make any specific gifts to particular people
          or organizations, then divide everything that remains (the residuary estate) among your beneficiaries.
        </p>

        {/* ---- Specific Bequests ---- */}
        <div className="mt-4 p-3" style={{ backgroundColor: '#FAFAFA' }}>
          <h4 className="border-bottom pb-2">Specific Bequests</h4>
          <p className="text-muted">
            This section lets you make specific gifts—also known as specific bequests—to individuals or organizations.
            These gifts can include particular items of personal property, specific amounts of money, or real estate,
            distributed outright after your death. Anything remaining is handled in the "Residuary Estate" section below.
          </p>
          <label className="form-label">
            Does {principal} want to make a specific bequest of any property—such as a home, vehicle, jewelry, or other
            item—to a particular person, organization, or entity?
          </label>
          <div>
            <div className="form-check form-check-inline">
              <input className="form-check-input" type="radio" name="willHasSpecificBequests" checked={wi.has_specific_bequests === true} onChange={() => updateFormData('will_info', 'has_specific_bequests', true)} />
              <label className="form-check-label">Yes</label>
            </div>
            <div className="form-check form-check-inline">
              <input className="form-check-input" type="radio" name="willHasSpecificBequests" checked={wi.has_specific_bequests === false} onChange={() => updateFormData('will_info', 'has_specific_bequests', false)} />
              <label className="form-check-label">No</label>
            </div>
          </div>

          {wi.has_specific_bequests && (
            <div className="mt-3">
              <p className="text-muted">Enter details below for any specific gifts you would like to leave to a particular person or organization.</p>
              {bequests.map((b, index) => (
                <div key={index} className="card mb-2">
                  <div className="card-header d-flex justify-content-between align-items-center">
                    <span>{getOrdinalLabel(index)} Specific Bequest</span>
                    <button type="button" className="btn btn-sm btn-link p-0" onClick={() => removeWillBequest(index)}>×</button>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <label className="form-label">Is this bequest to multiple recipients?</label>
                      <div>
                        <div className="form-check form-check-inline">
                          <input className="form-check-input" type="radio" name={`will_multiple_recipients_${index}`} checked={b.multiple_recipients === 'Yes'} onChange={() => updateWillBequest(index, 'multiple_recipients', 'Yes')} />
                          <label className="form-check-label">Yes</label>
                        </div>
                        <div className="form-check form-check-inline">
                          <input className="form-check-input" type="radio" name={`will_multiple_recipients_${index}`} checked={b.multiple_recipients !== 'Yes'} onChange={() => updateWillBequest(index, 'multiple_recipients', 'No')} />
                          <label className="form-check-label">No</label>
                        </div>
                      </div>
                    </div>
                    <div className="row">
                      <div className="col-md-6 mb-3">
                        <label className="form-label">Recipient:</label>
                        <select className="form-select" value={b.recipient} onChange={(e) => updateWillBequest(index, 'recipient', e.target.value)}>
                          <option value="">Select recipient...</option>
                          {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                        </select>
                      </div>
                      {b.multiple_recipients === 'Yes' && (
                        <div className="col-md-6 mb-3">
                          <label className="form-label">Second recipient:</label>
                          <select className="form-select" value={b.second_recipient} onChange={(e) => updateWillBequest(index, 'second_recipient', e.target.value)}>
                            <option value="">Select recipient...</option>
                            {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="mb-2">
                      <label className="form-label">Describe the gift or item:</label>
                      <textarea className="form-control" rows={2} value={b.description} onChange={(e) => updateWillBequest(index, 'description', e.target.value)} placeholder="e.g., My grandmother's ring, the family home at 123 Main St, $10,000" />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-outline-primary" onClick={addWillBequest}>+ Add Specific Bequest</button>
              {errors['will_info.specific_bequests'] && <div className="text-danger small mt-2">{errors['will_info.specific_bequests']}</div>}
            </div>
          )}
        </div>

        {/* ---- Residuary Estate ---- */}
        <h4 className="mt-4 border-bottom pb-2">Residuary Estate</h4>
        <p className="text-muted">
          Your residuary estate is everything that remains after specific gifts have been distributed. It will be
          divided among the beneficiaries you list below. Each beneficiary's share may be given outright, or held in
          trust and distributed once they reach a certain age. All percentages must total 100%.
        </p>
        <label className="form-label">Will the residuary estate be distributed equally among all beneficiaries?</label>
        <div className="mb-3">
          <div className="form-check form-check-inline">
            <input className="form-check-input" type="radio" name="willDistributionsEqual" checked={wi.distributions_equal === true} onChange={() => updateFormData('will_info', 'distributions_equal', true)} />
            <label className="form-check-label">Yes</label>
          </div>
          <div className="form-check form-check-inline">
            <input className="form-check-input" type="radio" name="willDistributionsEqual" checked={wi.distributions_equal === false} onChange={() => updateFormData('will_info', 'distributions_equal', false)} />
            <label className="form-check-label">No</label>
          </div>
        </div>

        {dist.map((d, index) => (
          <div key={index} className="card mb-2">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span>Beneficiary {index + 1}</span>
              <button type="button" className="btn btn-sm btn-link p-0" onClick={() => removeWillDistribution(index)}>×</button>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-4 mb-3">
                  <label className="form-label">Beneficiary:</label>
                  <select className="form-select" value={d.recipient} onChange={(e) => updateWillDistribution(index, 'recipient', e.target.value)}>
                    <option value="">Select beneficiary...</option>
                    {beneficiaryOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                  </select>
                </div>
                {!wi.distributions_equal && (
                  <div className="col-md-3 mb-3">
                    <label className="form-label">Share (%)</label>
                    <input type="number" min={0} max={100} className="form-control" value={d.share_percent} onChange={(e) => updateWillDistribution(index, 'share_percent', e.target.value)} />
                  </div>
                )}
                <div className="col-md-3 mb-3">
                  <label className="form-label">How received:</label>
                  <select className="form-select" value={d.how_receive} onChange={(e) => updateWillDistribution(index, 'how_receive', e.target.value)}>
                    <option value="Outright">Outright</option>
                    <option value="In Trust">In Trust (age-based)</option>
                  </select>
                </div>
              </div>
              {d.how_receive === 'In Trust' && renderInTrustDetails('will_info', d, index)}
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-outline-primary" onClick={addWillDistribution}>+ Add Residuary Beneficiary</button>
        {!wi.distributions_equal && dist.length > 0 && (
          <div className={`small mt-2 ${Math.abs(residTotal - 100) < 0.01 ? 'text-success' : 'text-danger'}`}>
            Total: {Math.round(residTotal * 100) / 100}% {Math.abs(residTotal - 100) < 0.01 ? '✓' : '(must equal 100%)'}
          </div>
        )}
        {errors['will_info.residuary_distribution'] && <div className="text-danger small mt-2">{errors['will_info.residuary_distribution']}</div>}
      </div>
    );
  };

  // ============================================================================
  // CHILDREN TRUSTS PAGE (Minor Child plans only)
  // ============================================================================
  const renderChildrenTrustsPage = () => (
    <div className="poa-page">
      <h2>{getStepNumber('children_trusts')}. Children's Trust Provisions</h2>
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
          message: "Second person's address information appears incomplete. Please review the Personal Information page.",
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

    return (
      <div className="poa-page">
        <h2>{getStepNumber('review')}. Review</h2>
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
                  <strong>{formType.includes('powerOfAttorney') ? 'Second Principal' : 'Second Person'}</strong>
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
                    {formData.children_as_agents && (formData.children || []).length > 0 && (
                      <ul className="mb-0">
                        {(formData.children || []).map((child, idx) => (
                          <li key={idx}>
                            {child.first_name} {child.surname}
                            {formType.includes('2Person') && child.parentage && ` - ${child.parentage === 'Joint' ? 'Both persons' : child.parentage === 'Client' ? "First person's child" : "Second person's child"}`}
                            {child.date_of_birth && ` (DOB: ${child.date_of_birth})`}
                            {child.deceased && ' - deceased'}
                            {child.disinherit && ' - omitted from estate'}
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
            <h4 className="mt-4 mb-3 border-bottom pb-2">Revocable Living Trust</h4>
            <div className="row">
              <div className="col-md-6 mb-3">
                <div className="card h-100">
                  <div className="card-header">
                    <strong>Trustees & Distribution</strong>
                    <button
                      type="button"
                      className="btn btn-link btn-sm float-end p-0"
                      onClick={() => setCurrentPage(pages.indexOf('rlt'))}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="card-body">
                    <p className="mb-1"><strong>Successor Trustees:</strong>{' '}
                      {(formData.trust_info?.trustees || [])
                        .map(t => [t.trustee_to_serve, t.second_trustee_person_to_serve].filter(Boolean).join(' & '))
                        .filter(Boolean).join('; ') || 'None named'}</p>
                    {isTwoPerson && (
                      <p className="mb-1"><strong>Marital Trust:</strong> {formData.trust_info?.marital_trust_type || 'Not selected'}</p>
                    )}
                    <p className="mb-1"><strong>Distributions Equal:</strong> {formData.trust_info?.distributions_equal ? 'Yes' : 'No'}</p>
                    <p className="mb-1"><strong>Residuary Beneficiaries:</strong>{' '}
                      {(formData.trust_info?.residuary_distribution || [])
                        .map(d => `${d.recipient || '(unnamed)'}${formData.trust_info?.distributions_equal ? '' : ` (${d.share_percent || 0}%)`}${d.how_receive === 'In Trust' ? ` in trust to age ${d.trust_until_age || '?'}` : ''}`)
                        .join('; ') || 'None named'}</p>
                    {formData.trust_info?.has_specific_bequests && (
                      <p className="mb-0"><strong>Specific Bequests:</strong> {(formData.trust_info?.specific_bequests || []).length} listed</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <div className="card h-100">
                  <div className="card-header">
                    <strong>Tutor & Donation of Residence</strong>
                    <button
                      type="button"
                      className="btn btn-link btn-sm float-end p-0"
                      onClick={() => setCurrentPage(pages.indexOf('dor'))}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="card-body">
                    <p className="mb-1"><strong>Appoint Tutor:</strong> {formData.trust_info?.appoint_tutor ? 'Yes' : 'No'}</p>
                    {formData.trust_info?.appoint_tutor && (
                      <>
                        <p className="mb-1"><strong>Tutor:</strong> {formData.trust_info?.tutor || 'Not selected'}</p>
                        <p className="mb-1"><strong>Under-Tutor:</strong> {formData.trust_info?.under_tutor || 'Not selected'}</p>
                      </>
                    )}
                    <p className="mb-1"><strong>Parish of Residence:</strong> {formData.dor?.parish_where_home_is_located || 'Not provided'}</p>
                    <p className="mb-0"><strong>Legal Description:</strong> {formData.dor?.have_full_legal_description_for_home || 'Not provided'}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ===== EXECUTORS (Will & Trust plans — trust plans have a pourover will) ===== */}
        {pages.includes('executors') && (
          <>
            <h4 className="mt-4 mb-3 border-bottom pb-2">Executors</h4>
            <div className="row">
              <div className={isTwoPerson ? 'col-md-6 mb-3' : 'col-12 mb-3'}>
                <div className="card h-100">
                  <div className="card-header">
                    <strong>Executors in {getPrincipalFullName()}'s Will</strong>
                    <button
                      type="button"
                      className="btn btn-link btn-sm float-end p-0"
                      onClick={() => setCurrentPage(pages.indexOf('executors'))}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="card-body">
                    <p className="mb-1"><strong>Primary Executor:</strong> {formData.will_info?.primary_executor || 'Not selected'}</p>
                    <p className="mb-0"><strong>Successor Executor:</strong> {formData.will_info?.successor_executor || 'Not selected'}</p>
                  </div>
                </div>
              </div>
              {isTwoPerson && (
                <div className="col-md-6 mb-3">
                  <div className="card h-100">
                    <div className="card-header">
                      <strong>Executors in {[formData.spouse_info.first_name, formData.spouse_info.middle_name, formData.spouse_info.surname].filter(Boolean).join(' ') || 'Second Person'}'s Will</strong>
                      <button
                        type="button"
                        className="btn btn-link btn-sm float-end p-0"
                        onClick={() => setCurrentPage(pages.indexOf('executors'))}
                      >
                        Edit
                      </button>
                    </div>
                    <div className="card-body">
                      <p className="mb-1"><strong>Primary Executor:</strong> {formData.will_info?.spouse_primary_executor || 'Not selected'}</p>
                      <p className="mb-0"><strong>Successor Executor:</strong> {formData.will_info?.spouse_successor_executor || 'Not selected'}</p>
                    </div>
                  </div>
                </div>
              )}
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
                    <p className="mb-1"><strong>Residuary Distribution:</strong>{' '}
                      {(formData.will_info?.residuary_distribution || []).length > 0
                        ? (formData.will_info?.distributions_equal
                            ? `Equally among ${(formData.will_info?.residuary_distribution || []).map((d) => d.recipient).filter(Boolean).join(', ')}`
                            : (formData.will_info?.residuary_distribution || []).map((d) => `${d.recipient || '—'} (${d.share_percent || '0'}%)`).join(', '))
                        : 'Not specified'}
                    </p>
                    {formData.will_info?.has_specific_bequests && (formData.will_info?.specific_bequests || []).length > 0 && (
                      <p className="mb-1"><strong>Specific Bequests:</strong> {(formData.will_info?.specific_bequests || []).map((b) => `${b.description || '—'} → ${b.recipient || '—'}`).join('; ')}</p>
                    )}
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
                  <strong>Second Person's FPOA</strong>
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
                  <strong>Second Person's HCPOA</strong>
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
              </div>
            </div>
          </div>
          {isTwoPerson && (
            <div className="col-md-6 mb-3">
              <div className="card h-100">
                <div className="card-header">
                  <strong>Second Person's Directive</strong>
                </div>
                <div className="card-body">
                  <p className="mb-1"><strong>Life Support Preference:</strong> {getLifeSupportLabel(formData.spouse_hcd?.life_support_option)}</p>
                  {formData.spouse_hcd?.life_support_option === 'CHOOSE' && (
                    <p className="mb-1"><strong>Withhold:</strong> {getHCDChoices(formData.spouse_hcd?.spouse_hcds || [])}</p>
                  )}
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
      case 'agents': return renderOtherPartiesPage();
      case 'plan_contents': return renderPlanContentsPage();
      // POA pages
      case 'fpoa': return renderFPOAPage();
      case 'hcpoa': return renderHCPOAPage();
      case 'hcd': return renderHCDPage();
      // Trust pages
      case 'rlt': return renderRLTPage();
      case 'dor': return renderDORPage();
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
            {/* Editing Submission Notice */}
            {submissionId ? (
              <div className="alert alert-info mb-4">
                <strong onClick={handleTitleClick} style={{ cursor: 'default' }}>Editing Submission</strong>
                <p className="mb-0 mt-1">
                  You are editing an existing form submission. Your progress is automatically saved as you move between pages.
                  Changes will be finalized when you complete the form. <a href="/dashboard">Back to Dashboard</a>
                </p>
              </div>
            ) : (
              <div className="alert alert-light border mb-4" onClick={handleTitleClick} style={{ cursor: 'default' }}>
                <strong>New Submission</strong>
                <p className="mb-0 mt-1">
                  Your progress will be saved as you move between pages.
                </p>
              </div>
            )}

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
