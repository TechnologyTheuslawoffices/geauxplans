/**
 * TypeScript type declarations for Knackly Schema System
 */

// Gender types
export interface GenderProperties {
  Name: string;
  HeShe: string;
  HimHer: string;
  HisHer: string;
  HisHers: string;
  HimselfHerself: string;
  ManWoman: string;
  HusbandWife: string;
  FatherMother: string;
  SonDaughter: string;
  BrotherSister: string;
  NephewNiece: string;
  UncleAunt: string;
  GrandfatherGrandmother: string;
  GrandsonGranddaughter: string;
  Testator: string;
  Tutor: string;
  UnderTutor: string;
  Executor: string;
  HeSheQualifyQualifies?: string;
  HeSheIsAre?: string;
  HeSheHasHave?: string;
  HeSheWasWere?: string;
}

// Party types
export interface Signer {
  SignerFirstName: string;
  SignerMiddleName: string;
  SignerLastName: string;
  SignerSuffix: string;
  SignerTitle: string;
  SignerFullName?: string;
}

export interface Party {
  // Individual fields
  First?: string;
  Middle?: string;
  Last?: string;
  Suffix?: string;
  Gender?: string | GenderProperties;
  Birthdate?: string;

  // Entity fields
  EntityName?: string;
  EIN?: string;

  // Common fields
  PartyType?: 'Individual' | 'Entity';
  SSN?: string;

  // Address
  StreetAddress1?: string;
  StreetAddress2?: string;
  City?: string;
  State?: string;
  Zip?: string;
  Parish?: string;

  // Relationships
  RelateClient?: string;

  // Entity signers
  GeauxSigners?: Signer[];

  // Computed fields
  NAMECO?: string;
  NameCO?: string;
  IndividualTF?: boolean;
  PartyParishCounty?: string;
  PartyParish?: string;
  PartyState?: string;
  SSNorEIN?: string;
}

// State Law types
export interface StateLaw {
  Name: string;
  GrantorReference: string;
  TrustCodeShortTitle: string;
  TrustCodeStatute: string;
  TrusteePowers: string;
  SpendthriftClause: string;
  Land: string;
  PersonalProperty: string;
  Parish: string;
  Tutor: string;
  UnderTutor: string;
  TutorFemale: string;
  UnderTutorFemale: string;
}

// Distribution types
export interface Distribution {
  DistAge: number | string;
  DistAmount: string;
}

// Term Year types
export interface TermYear {
  AnniversaryYear: number | string;
}

// Agent structure (for POA)
export interface AgentGroup {
  AgentSelect?: string;
  CoAgentSelect?: string;
  TrueAgents?: Party[];
}

// Document data structure
export interface DocumentData {
  Client?: Party;
  Spouse?: Party;
  Children?: Party[];

  // FPOA
  ClientAgentsFPOA?: AgentGroup;
  SpouseAgentsFPOA?: AgentGroup;
  ClientFPOASuccAgents?: AgentGroup;
  SpouseFPOASuccAgents?: AgentGroup;

  // HCPOA
  ClientAgentsHCPOA?: AgentGroup;
  SpouseAgentsHCPOA?: AgentGroup;
  ClientHCPOASuccAgents?: AgentGroup;
  SpouseHCPOASuccAgents?: AgentGroup;

  // Trust specific
  TrueSingleSettlor?: Party;
  InitialTrustees?: Party[];
  SuccessorTrustees?: Party[];
  ResiduaryBenef?: Party | Party[];

  // State law
  StateLawSelect?: StateLaw;

  // Generic
  [key: string]: unknown;
}

// Integration functions
export function preprocessPOAData(data: DocumentData): DocumentData;
export function preprocessTrustData(data: DocumentData): DocumentData;
export function ensureNAMECO(partyData: Party | null): Party | null;
export function getGenderProperties(genderValue: string): GenderProperties;
export function enrichData(data: DocumentData): DocumentData;
export function getStateLaw(state: string): StateLaw;

// Models module
export namespace models {
  namespace party {
    function applyFormulas(party: Party): Party;
    function fromFormData(formParty: Record<string, unknown>): Party | null;
  }

  namespace gender {
    function getGender(gender: string): GenderProperties;
    function getGenderProperty(gender: string, property: string): string;
  }

  namespace distributions {
    function formatDistribution(dist: Distribution): string;
    function formatDistributionList(distributions: Distribution[], separator?: string): string;
    function fromFormData(formDistributions: unknown[]): Distribution[];
  }

  namespace termyears {
    function formatTermYear(term: TermYear): string;
    function formatTermYearList(terms: TermYear[], separator?: string): string;
    function fromFormData(formTerms: unknown[]): TermYear[];
  }
}

// Formulas module
export namespace formulas {
  namespace numberFormulas {
    function formatWithCommas(num: number): string;
    function formatCurrency(num: number): string;
    function toCardinal(num: number): string;
    function toOrdinal(num: number): string;
  }

  namespace dateFormulas {
    function formatDate(date: Date | string, format?: string): string;
    function today(format?: string): string;
  }

  namespace textFormulas {
    function upper(text: string): string;
    function lower(text: string): string;
    function titlecaps(text: string): string;
    function initcap(text: string): string;
    function endsWith(text: string, suffix: string): boolean;
    function contains(text: string, substring: string): boolean;
  }

  namespace listFormulas {
    function formatWithPunctuation(items: unknown[], pattern?: string): string;
    function length(items: unknown[]): number;
    function filter(items: unknown[], field: string, value: unknown): unknown[];
    function any(items: unknown[], field: string, value: unknown): boolean;
    function every(items: unknown[], field: string, value: unknown): boolean;
    function sort(items: unknown[], field: string, direction?: 'asc' | 'desc'): unknown[];
  }

  namespace louisianaFormulas {
    function getParishCounty(state: string): string;
    function getLandTerm(state: string): string;
    function getPersonalPropertyTerm(state: string): string;
    function getTutorTerm(state: string): string;
    function getGrantorReference(state: string): string;
  }
}

// Tables module
export namespace tables {
  namespace stateLaw {
    function getStateLaw(state: string): StateLaw;
    function getStateLawProperty(state: string, property: string): string;
    function getAvailableStates(): string[];
  }
}
