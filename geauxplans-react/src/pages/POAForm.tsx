import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/poa-form.css';

// Page display names for progress bar
const PAGE_NAMES: Record<string, string> = {
  start: 'Start',
  personal_info: 'Personal',
  spouse_info: 'Other Parties',
  agents: 'Agents',
  plan_contents: 'Contents',
  fpoa: 'FPOA',
  hcpoa: 'HCPOA',
  hcd: 'HCD',
  trust_info: 'Trust',
};

// Form type configurations matching WordPress
const FORM_TYPES: Record<string, { title: string; pages: string[] }> = {
  powerOfAttorneyForm: {
    title: 'Power of Attorney Supplement for One Person',
    pages: ['start', 'personal_info', 'agents', 'plan_contents', 'fpoa', 'hcpoa', 'hcd'],
  },
  powerOfAttorneyForm2Person: {
    title: 'Power of Attorney Supplement for Two Persons',
    pages: ['start', 'personal_info', 'spouse_info', 'agents', 'plan_contents', 'fpoa', 'hcpoa', 'hcd'],
  },
  trustBasedEstatePlanSolo: {
    title: 'Trust-Based Estate Plan',
    pages: ['start', 'personal_info', 'agents', 'plan_contents', 'fpoa', 'hcpoa', 'hcd', 'trust_info'],
  },
  trustBasedEstatePlan2Person: {
    title: 'Trust-Based Estate Plan for 2 Persons',
    pages: ['start', 'personal_info', 'spouse_info', 'agents', 'plan_contents', 'fpoa', 'hcpoa', 'hcd', 'trust_info'],
  },
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
    primary_beneficiaries: string[];
    contingent_beneficiaries: string[];
    successor_trustees: string[];
    specific_bequests: string;
    special_instructions: string;
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
    primary_beneficiaries: [],
    contingent_beneficiaries: [],
    successor_trustees: [],
    specific_bequests: '',
    special_instructions: '',
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
          setFormData(response.data.formData);
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
        parties: [...prev.people_or_entities_who_will_serve_as_agents.parties, createEmptyParty()],
      },
    }));
  };

  const removeParty = (index: number) => {
    setFormData(prev => ({
      ...prev,
      people_or_entities_who_will_serve_as_agents: {
        parties: prev.people_or_entities_who_will_serve_as_agents.parties.filter((_, i) => i !== index),
      },
    }));
  };

  const updateParty = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      people_or_entities_who_will_serve_as_agents: {
        parties: prev.people_or_entities_who_will_serve_as_agents.parties.map((party, i) =>
          i === index ? { ...party, [field]: value } : party
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
      if (formData.people_or_entities_who_will_serve_as_agents.parties.length === 0) {
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

  const renderStartPage = () => (
    <div className="poa-page">
      <h2>1. {formConfig.title}</h2>
      <div className="alert alert-info">
        <h5>Welcome to the {formConfig.title} Interview</h5>
        <p>This interview will guide you through creating your Power of Attorney documents. Please have the following information ready:</p>
        <ul>
          <li>Your personal information (name, date of birth, address)</li>
          <li>Information about the people or entities you want to appoint as agents</li>
          <li>Your preferences for healthcare decisions</li>
        </ul>
        <p><strong>Your progress is saved automatically.</strong> You can return and complete this form at any time.</p>
      </div>

      {/* Governing Law */}
      <div className="mb-4">
        <label className="form-label"><strong>Governing Law</strong></label>
        <p className="text-muted small">Select the state whose laws will govern your Power of Attorney documents.</p>
        <select
          className="form-select"
          value={formData.governing_law}
          onChange={(e) => setFormData(prev => ({ ...prev, governing_law: e.target.value }))}
        >
          <option value="Louisiana">Louisiana</option>
          <option value="Alabama">Alabama</option>
          <option value="Alaska">Alaska</option>
          <option value="Arizona">Arizona</option>
          <option value="Arkansas">Arkansas</option>
          <option value="California">California</option>
          <option value="Colorado">Colorado</option>
          <option value="Connecticut">Connecticut</option>
          <option value="Delaware">Delaware</option>
          <option value="Florida">Florida</option>
          <option value="Georgia">Georgia</option>
          <option value="Hawaii">Hawaii</option>
          <option value="Idaho">Idaho</option>
          <option value="Illinois">Illinois</option>
          <option value="Indiana">Indiana</option>
          <option value="Iowa">Iowa</option>
          <option value="Kansas">Kansas</option>
          <option value="Kentucky">Kentucky</option>
          <option value="Maine">Maine</option>
          <option value="Maryland">Maryland</option>
          <option value="Massachusetts">Massachusetts</option>
          <option value="Michigan">Michigan</option>
          <option value="Minnesota">Minnesota</option>
          <option value="Mississippi">Mississippi</option>
          <option value="Missouri">Missouri</option>
          <option value="Montana">Montana</option>
          <option value="Nebraska">Nebraska</option>
          <option value="Nevada">Nevada</option>
          <option value="New Hampshire">New Hampshire</option>
          <option value="New Jersey">New Jersey</option>
          <option value="New Mexico">New Mexico</option>
          <option value="New York">New York</option>
          <option value="North Carolina">North Carolina</option>
          <option value="North Dakota">North Dakota</option>
          <option value="Ohio">Ohio</option>
          <option value="Oklahoma">Oklahoma</option>
          <option value="Oregon">Oregon</option>
          <option value="Pennsylvania">Pennsylvania</option>
          <option value="Rhode Island">Rhode Island</option>
          <option value="South Carolina">South Carolina</option>
          <option value="South Dakota">South Dakota</option>
          <option value="Tennessee">Tennessee</option>
          <option value="Texas">Texas</option>
          <option value="Utah">Utah</option>
          <option value="Vermont">Vermont</option>
          <option value="Virginia">Virginia</option>
          <option value="Washington">Washington</option>
          <option value="West Virginia">West Virginia</option>
          <option value="Wisconsin">Wisconsin</option>
          <option value="Wyoming">Wyoming</option>
        </select>
      </div>

      {/* Electronic Signature */}
      <div className="mb-4">
        <div className="form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id="esign"
            checked={formData.esign}
            onChange={(e) => setFormData(prev => ({ ...prev, esign: e.target.checked }))}
          />
          <label className="form-check-label" htmlFor="esign">
            <strong>Include digital signature language</strong> in documents that may be executed by electronic signature.
          </label>
        </div>
      </div>

      {/* Married / Life Partner */}
      <div className="mb-4">
        <label className="form-label"><strong>Is the person granting the power of attorney married or do they have a life partner?</strong></label>
        <div className="form-check">
          <input
            type="radio"
            className="form-check-input"
            id="married-yes"
            name="married"
            checked={formData.married === true}
            onChange={() => setFormData(prev => ({ ...prev, married: true }))}
          />
          <label className="form-check-label" htmlFor="married-yes">Yes</label>
        </div>
        <div className="form-check">
          <input
            type="radio"
            className="form-check-input"
            id="married-no"
            name="married"
            checked={formData.married === false}
            onChange={() => setFormData(prev => ({ ...prev, married: false }))}
          />
          <label className="form-check-label" htmlFor="married-no">No</label>
        </div>
      </div>

      {/* Children as Agents */}
      <div className="mb-4">
        <label className="form-label"><strong>Will you name any children as a Healthcare Agent or Financial Agent?</strong></label>
        <div className="form-check">
          <input
            type="radio"
            className="form-check-input"
            id="children-yes"
            name="children_as_agents"
            checked={formData.children_as_agents === true}
            onChange={() => setFormData(prev => ({ ...prev, children_as_agents: true }))}
          />
          <label className="form-check-label" htmlFor="children-yes">Yes</label>
        </div>
        <div className="form-check">
          <input
            type="radio"
            className="form-check-input"
            id="children-no"
            name="children_as_agents"
            checked={formData.children_as_agents === false}
            onChange={() => setFormData(prev => ({ ...prev, children_as_agents: false }))}
          />
          <label className="form-check-label" htmlFor="children-no">No</label>
        </div>
      </div>
    </div>
  );

  const renderPersonalInfoPage = () => (
    <div className="poa-page">
      <h2>2. Personal Information</h2>
      <p className="text-muted">Enter your personal information below.</p>

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
            <option value="Jr.">Jr.</option>
            <option value="Sr.">Sr.</option>
            <option value="II">II</option>
            <option value="III">III</option>
            <option value="IV">IV</option>
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
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non-binary">Non-binary</option>
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
          <input
            type="text"
            className={`form-control ${errors['personal_info.state'] ? 'is-invalid' : ''}`}
            value={formData.personal_info.state}
            onChange={(e) => updateFormData('personal_info', 'state', e.target.value)}
          />
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
          <label className="form-label">Parish <span className="text-danger">*</span></label>
          <input
            type="text"
            className={`form-control ${errors['personal_info.parish'] ? 'is-invalid' : ''}`}
            value={formData.personal_info.parish}
            onChange={(e) => updateFormData('personal_info', 'parish', e.target.value)}
            placeholder="e.g., Orleans"
          />
          {errors['personal_info.parish'] && <div className="invalid-feedback">{errors['personal_info.parish']}</div>}
          <small className="text-muted">Do not include the word "Parish"</small>
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-md-6">
          <label className="form-label">Phone Number <span className="text-danger">*</span></label>
          <input
            type="tel"
            className={`form-control ${errors['personal_info.phone_number'] ? 'is-invalid' : ''}`}
            value={formData.personal_info.phone_number}
            onChange={(e) => updateFormData('personal_info', 'phone_number', e.target.value)}
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
    </div>
  );

  const renderAgentsPage = () => (
    <div className="poa-page">
      <h2>3. People or Entities Who Will Serve as Agents</h2>
      <p className="text-muted">Add the people or entities you want to serve as your agents (attorneys-in-fact).</p>

      {errors['agents'] && <div className="alert alert-danger">{errors['agents']}</div>}

      {formData.people_or_entities_who_will_serve_as_agents.parties.map((party, index) => (
        <div key={party.id} className="card mb-3">
          <div className="card-header d-flex justify-content-between align-items-center">
            <strong>Party {index + 1}: {getPartyDisplayName(party)}</strong>
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
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="non-binary">Non-binary</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Relationship <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={party.relationship_with_person}
                      onChange={(e) => updateParty(index, 'relationship_with_person', e.target.value)}
                      placeholder="e.g., Spouse, Child, Friend"
                    />
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
                  <input
                    type="text"
                    className="form-control"
                    value={party.state}
                    onChange={(e) => updateParty(index, 'state', e.target.value)}
                  />
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
                  <label className="form-label">Parish</label>
                  <input
                    type="text"
                    className="form-control"
                    value={party.parish}
                    onChange={(e) => updateParty(index, 'parish', e.target.value)}
                  />
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

  const renderPlanContentsPage = () => (
    <div className="poa-page">
      <h2>4. Plan Contents</h2>
      <div className="alert alert-info">
        <p>Your Power of Attorney plan will include the following documents:</p>
        <ul>
          <li><strong>Financial Power of Attorney (FPOA)</strong> - Allows your agent to manage your financial affairs</li>
          <li><strong>Healthcare Power of Attorney (HCPOA)</strong> - Allows your agent to make healthcare decisions</li>
          <li><strong>Healthcare Directive (HCD)</strong> - Your wishes regarding end-of-life care</li>
        </ul>
        <p>In the following pages, you'll designate agents for each document and specify your preferences.</p>
      </div>
    </div>
  );

  const renderFPOAPage = () => {
    const parties = formData.people_or_entities_who_will_serve_as_agents.parties;
    const isTwoPerson = formType.includes('2Person');

    return (
      <div className="poa-page">
        <h2>5. Financial Power of Attorney for {getPrincipalFullName()}</h2>
        <p className="text-muted">Select who will serve as your agents for financial matters.</p>

        {/* POA Type Options */}
        <div className="card mb-3">
          <div className="card-header">Power of Attorney Options</div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">When should this POA take effect?</label>
                <div>
                  <div className="form-check">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="fpoa_springing"
                      value="No"
                      checked={formData.fpoa.springing_poa === 'No'}
                      onChange={(e) => updateNestedFormData('fpoa.springing_poa', e.target.value)}
                    />
                    <label className="form-check-label">
                      <strong>Immediate</strong> - Takes effect when signed
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="fpoa_springing"
                      value="Yes"
                      checked={formData.fpoa.springing_poa === 'Yes'}
                      onChange={(e) => updateNestedFormData('fpoa.springing_poa', e.target.value)}
                    />
                    <label className="form-check-label">
                      <strong>Springing</strong> - Takes effect only upon incapacity
                    </label>
                  </div>
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Do you have a prior Financial POA to revoke?</label>
                <div>
                  <div className="form-check form-check-inline">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="fpoa_revoke"
                      value="Yes"
                      checked={formData.fpoa.revoke_prior_poa === 'Yes'}
                      onChange={(e) => updateNestedFormData('fpoa.revoke_prior_poa', e.target.value)}
                    />
                    <label className="form-check-label">Yes</label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="fpoa_revoke"
                      value="No"
                      checked={formData.fpoa.revoke_prior_poa === 'No'}
                      onChange={(e) => updateNestedFormData('fpoa.revoke_prior_poa', e.target.value)}
                    />
                    <label className="form-check-label">No</label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card mb-3">
          <div className="card-header">Initial Agents</div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Initial Agent <span className="text-danger">*</span></label>
                <select
                  className="form-select"
                  value={formData.fpoa.fpoa_initial_agents.person_to_serve}
                  onChange={(e) => updateNestedFormData('fpoa.fpoa_initial_agents.person_to_serve', e.target.value)}
                >
                  <option value="">Select Initial Agent...</option>
                  {isTwoPerson && (
                    <option value="spouse">My Spouse</option>
                  )}
                  {parties.map((party) => (
                    <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Initial Co-Agent (if any)</label>
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
          <label className="form-label">Do you want to appoint successor agents? <span className="text-danger">*</span></label>
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

        {/* Spouse FPOA Section for 2-person forms */}
        {isTwoPerson && (
          <>
            <hr className="my-4" />
            <h3>Financial Power of Attorney for {formData.spouse_info.first_name || 'Spouse'}</h3>

            <div className="card mb-3">
              <div className="card-header">Spouse's POA Options</div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">When should this POA take effect?</label>
                    <div>
                      <div className="form-check">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="spouse_fpoa_springing"
                          value="No"
                          checked={formData.spouse_fpoa.springing_poa === 'No'}
                          onChange={(e) => updateNestedFormData('spouse_fpoa.springing_poa', e.target.value)}
                        />
                        <label className="form-check-label">Immediate</label>
                      </div>
                      <div className="form-check">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="spouse_fpoa_springing"
                          value="Yes"
                          checked={formData.spouse_fpoa.springing_poa === 'Yes'}
                          onChange={(e) => updateNestedFormData('spouse_fpoa.springing_poa', e.target.value)}
                        />
                        <label className="form-check-label">Springing</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card mb-3">
              <div className="card-header">Spouse's Initial Agents</div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Initial Agent <span className="text-danger">*</span></label>
                    <select
                      className="form-select"
                      value={formData.spouse_fpoa.fpoa_initial_agents.person_to_serve}
                      onChange={(e) => updateNestedFormData('spouse_fpoa.fpoa_initial_agents.person_to_serve', e.target.value)}
                    >
                      <option value="">Select Initial Agent...</option>
                      <option value="client">My Spouse ({formData.personal_info.first_name || 'Client'})</option>
                      {parties.map((party) => (
                        <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Initial Co-Agent (if any)</label>
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
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Does spouse want successor agents?</label>
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
          </>
        )}
      </div>
    );
  };

  const renderHCPOAPage = () => {
    const parties = formData.people_or_entities_who_will_serve_as_agents.parties;
    const isTwoPerson = formType.includes('2Person');

    return (
      <div className="poa-page">
        <h2>6. Healthcare Power of Attorney for {getPrincipalFullName()}</h2>
        <p className="text-muted">Select who will serve as your agents for healthcare decisions.</p>

        <div className="card mb-3">
          <div className="card-header">Healthcare Preferences</div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-4 mb-3">
                <label className="form-label">Do you wish to be an organ donor? <span className="text-danger">*</span></label>
                <div>
                  <div className="form-check">
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
                  <div className="form-check">
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
              <div className="col-md-4 mb-3">
                <label className="form-label">Donate body to science? <span className="text-danger">*</span></label>
                <div>
                  <div className="form-check">
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
                  <div className="form-check">
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
              <div className="col-md-4 mb-3">
                <label className="form-label">Refuse blood transfusions?</label>
                <div>
                  <div className="form-check">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="no_blood"
                      value="Yes"
                      checked={formData.hcpoa.no_blood_transfusion === 'Yes'}
                      onChange={(e) => updateNestedFormData('hcpoa.no_blood_transfusion', e.target.value)}
                    />
                    <label className="form-check-label">Yes - I refuse blood transfusions</label>
                  </div>
                  <div className="form-check">
                    <input
                      type="radio"
                      className="form-check-input"
                      name="no_blood"
                      value="No"
                      checked={formData.hcpoa.no_blood_transfusion === 'No'}
                      onChange={(e) => updateNestedFormData('hcpoa.no_blood_transfusion', e.target.value)}
                    />
                    <label className="form-check-label">No - Allow transfusions</label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card mb-3">
          <div className="card-header">Healthcare Agents</div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Initial Healthcare Agent <span className="text-danger">*</span></label>
                <select
                  className="form-select"
                  value={formData.hcpoa.hcpoa_initial_agents.person_to_serve}
                  onChange={(e) => updateNestedFormData('hcpoa.hcpoa_initial_agents.person_to_serve', e.target.value)}
                >
                  <option value="">Select Initial Agent...</option>
                  {isTwoPerson && (
                    <option value="spouse">My Spouse</option>
                  )}
                  {parties.map((party) => (
                    <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Initial Co-Agent (if any)</label>
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
          <label className="form-label">Do you want to appoint successor agents? <span className="text-danger">*</span></label>
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

        {/* Spouse HCPOA Section for 2-person forms */}
        {isTwoPerson && (
          <>
            <hr className="my-4" />
            <h3>Healthcare Power of Attorney for {formData.spouse_info.first_name || 'Spouse'}</h3>

            <div className="card mb-3">
              <div className="card-header">Spouse's Healthcare Preferences</div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-4 mb-3">
                    <label className="form-label">Organ donor?</label>
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
                  <div className="col-md-4 mb-3">
                    <label className="form-label">Donate to science?</label>
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
                  <div className="col-md-4 mb-3">
                    <label className="form-label">Refuse blood transfusions?</label>
                    <div>
                      <div className="form-check form-check-inline">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="spouse_no_blood"
                          value="Yes"
                          checked={formData.spouse_hcpoa.no_blood_transfusion === 'Yes'}
                          onChange={(e) => updateNestedFormData('spouse_hcpoa.no_blood_transfusion', e.target.value)}
                        />
                        <label className="form-check-label">Yes</label>
                      </div>
                      <div className="form-check form-check-inline">
                        <input
                          type="radio"
                          className="form-check-input"
                          name="spouse_no_blood"
                          value="No"
                          checked={formData.spouse_hcpoa.no_blood_transfusion === 'No'}
                          onChange={(e) => updateNestedFormData('spouse_hcpoa.no_blood_transfusion', e.target.value)}
                        />
                        <label className="form-check-label">No</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card mb-3">
              <div className="card-header">Spouse's Healthcare Agents</div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Initial Agent</label>
                    <select
                      className="form-select"
                      value={formData.spouse_hcpoa.hcpoa_initial_agents.person_to_serve}
                      onChange={(e) => updateNestedFormData('spouse_hcpoa.hcpoa_initial_agents.person_to_serve', e.target.value)}
                    >
                      <option value="">Select Initial Agent...</option>
                      <option value="client">{formData.personal_info.first_name || 'Client'} (My Spouse)</option>
                      {parties.map((party) => (
                        <option key={party.id} value={getPartyDisplayName(party)}>{getPartyDisplayName(party)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">Initial Co-Agent (if any)</label>
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
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Does spouse want successor agents?</label>
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
          </>
        )}
      </div>
    );
  };

  const renderHCDPage = () => {
    const isTwoPerson = formType.includes('2Person');

    return (
      <div className="poa-page">
        <h2>7. Healthcare Directive for {getPrincipalFullName()}</h2>
        <p className="text-muted">Enter your preferences for end-of-life care.</p>

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

        {/* Spouse HCD Section for 2-person forms */}
        {isTwoPerson && (
          <>
            <hr className="my-4" />
            <h3>Healthcare Directive for {formData.spouse_info.first_name || 'Spouse'}</h3>

            <div className="mb-3">
              <label className="form-label">Life Support Preference</label>
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
                <div className="card-header">Spouse's Specific Preferences</div>
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

      {formData.people_or_entities_who_will_serve_as_agents.parties.length > 0 && (
        <>
          {formData.people_or_entities_who_will_serve_as_agents.parties.map((party, index) => (
            <div key={party.id} className="card mb-3">
              <div className="card-header d-flex justify-content-between align-items-center">
                <strong>Party {index + 1}: {getPartyDisplayName(party)}</strong>
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
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="non-binary">Non-binary</option>
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Relationship <span className="text-danger">*</span></label>
                        <input
                          type="text"
                          className="form-control"
                          value={party.relationship_with_person}
                          onChange={(e) => updateParty(index, 'relationship_with_person', e.target.value)}
                          placeholder="e.g., Spouse, Child, Friend"
                        />
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
                      <input
                        type="text"
                        className="form-control"
                        value={party.state}
                        onChange={(e) => updateParty(index, 'state', e.target.value)}
                      />
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
                      <label className="form-label">Parish</label>
                      <input
                        type="text"
                        className="form-control"
                        value={party.parish}
                        onChange={(e) => updateParty(index, 'parish', e.target.value)}
                      />
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

      <div className="alert alert-success mt-4">
        <h5><i className="fas fa-check-circle me-2"></i>Review and Submit</h5>
        <p>You have completed all sections of the form. Please review your information and click "Submit Form" when ready.</p>
        <p className="mb-0"><strong>After submission, your documents will be generated and available for download.</strong></p>
      </div>
    </div>
  );

  const renderCurrentPage = () => {
    const pageName = pages[currentPage];
    switch (pageName) {
      case 'start': return renderStartPage();
      case 'personal_info': return renderPersonalInfoPage();
      case 'spouse_info': return renderOtherPartiesPage();
      case 'agents': return renderAgentsPage();
      case 'plan_contents': return renderPlanContentsPage();
      case 'fpoa': return renderFPOAPage();
      case 'hcpoa': return renderHCPOAPage();
      case 'hcd': return renderHCDPage();
      case 'trust_info': return renderTrustInfoPage();
      default: return <div>Page not found</div>;
    }
  };

  const progress = ((currentPage + 1) / pages.length) * 100;

  return (
    <div className="poa-form-page">
      <div className="container py-4">
        <div className="row justify-content-center">
          <div className="col-lg-10">
            <div className="poa-header text-center mb-4">
              <h1>{formConfig.title}</h1>
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
                    title={PAGE_NAMES[page] || page}
                  >
                    <span className="step-number">{index + 1}</span>
                    <span className="step-name">{PAGE_NAMES[page] || page}</span>
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
