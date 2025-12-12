import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/estate-planning.css';

interface FormData {
  state: string;
  isMarried: boolean | null;
  planForDeath: boolean | null;
  ownsRealEstate: boolean | null;
  assetsOver125k: boolean | null;
  hasMinorChildren: boolean | null;
  wantsIncapacityPlanning: boolean | null;
}

const US_STATES = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

// Product mappings matching WordPress WooCommerce products
const PRODUCTS = {
  MINOR_CHILD: { id: 606, name: 'Minor Child-Centered Estate Plan', price: 599 },
  POA_SUPPLEMENT: { id: 614, name: 'Power of Attorney Supplement', price: 299 },
  WILL_BASED: { id: 673, name: 'Will-Based Estate Plan', price: 399 },
  TRUST_BASED: { id: 676, name: 'Trust-Based Estate Plan', price: 899 },
};

const EstatePlanning: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    state: 'LA',
    isMarried: null,
    planForDeath: null,
    ownsRealEstate: null,
    assetsOver125k: null,
    hasMinorChildren: null,
    wantsIncapacityPlanning: null,
  });
  const [recommendedProduct, setRecommendedProduct] = useState<typeof PRODUCTS.MINOR_CHILD | null>(null);

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData({ ...formData, state: e.target.value });
  };

  const handleYesNo = (field: keyof FormData, value: boolean) => {
    setFormData({ ...formData, [field]: value });
  };

  const nextStep = () => {
    setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const determineProduct = () => {
    // Logic based on WordPress form flow
    if (formData.planForDeath) {
      if (formData.ownsRealEstate) {
        if (formData.assetsOver125k) {
          return PRODUCTS.TRUST_BASED;
        }
        return PRODUCTS.WILL_BASED;
      } else {
        if (formData.hasMinorChildren) {
          return PRODUCTS.MINOR_CHILD;
        }
        return PRODUCTS.WILL_BASED;
      }
    } else {
      if (formData.wantsIncapacityPlanning) {
        return PRODUCTS.POA_SUPPLEMENT;
      }
      return null;
    }
  };

  const handleGetStarted = (product: typeof PRODUCTS.MINOR_CHILD) => {
    // Navigate to the appropriate form based on product and marital status
    const formType = formData.isMarried ? '2person' : 'solo';
    navigate(`/poa-form?product=${product.id}&type=${formType}`);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="ep-step">
            <h2>Step 1: Choose Your State</h2>
            <p>Estate planning laws vary by state. Please select your state of residence.</p>
            <select
              className="form-select form-select-lg"
              value={formData.state}
              onChange={handleStateChange}
            >
              {US_STATES.map((state) => (
                <option key={state.value} value={state.value}>
                  {state.label}
                </option>
              ))}
            </select>
            {formData.state !== 'LA' && (
              <div className="alert alert-warning mt-3">
                <i className="fas fa-exclamation-triangle me-2"></i>
                Currently, our estate planning services are only available for Louisiana residents.
                We're working on expanding to other states soon!
              </div>
            )}
            <div className="ep-buttons mt-4">
              <button
                className="btn btn-primary btn-lg"
                onClick={nextStep}
                disabled={formData.state !== 'LA'}
              >
                Continue <i className="fas fa-arrow-right ms-2"></i>
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="ep-step">
            <h2>Step 2: Are You Married?</h2>
            <p>This helps us determine the right plan for your situation.</p>
            <div className="ep-options">
              <button
                className={`ep-option-btn ${formData.isMarried === true ? 'selected' : ''}`}
                onClick={() => handleYesNo('isMarried', true)}
              >
                <i className="fas fa-ring me-2"></i>
                Yes, I'm Married
              </button>
              <button
                className={`ep-option-btn ${formData.isMarried === false ? 'selected' : ''}`}
                onClick={() => handleYesNo('isMarried', false)}
              >
                <i className="fas fa-user me-2"></i>
                No, I'm Single
              </button>
            </div>
            <div className="ep-buttons mt-4">
              <button className="btn btn-outline-secondary btn-lg" onClick={prevStep}>
                <i className="fas fa-arrow-left me-2"></i> Back
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={nextStep}
                disabled={formData.isMarried === null}
              >
                Continue <i className="fas fa-arrow-right ms-2"></i>
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="ep-step">
            <h2>Step 3: Planning for What Happens When You Die?</h2>
            <p>Do you want to create a plan for distributing your assets after you pass away?</p>
            <div className="ep-options">
              <button
                className={`ep-option-btn ${formData.planForDeath === true ? 'selected' : ''}`}
                onClick={() => handleYesNo('planForDeath', true)}
              >
                <i className="fas fa-file-signature me-2"></i>
                Yes, I want to plan for after I'm gone
              </button>
              <button
                className={`ep-option-btn ${formData.planForDeath === false ? 'selected' : ''}`}
                onClick={() => handleYesNo('planForDeath', false)}
              >
                <i className="fas fa-heart-pulse me-2"></i>
                No, I only need incapacity planning
              </button>
            </div>
            <div className="ep-buttons mt-4">
              <button className="btn btn-outline-secondary btn-lg" onClick={prevStep}>
                <i className="fas fa-arrow-left me-2"></i> Back
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={nextStep}
                disabled={formData.planForDeath === null}
              >
                Continue <i className="fas fa-arrow-right ms-2"></i>
              </button>
            </div>
          </div>
        );

      case 4:
        if (formData.planForDeath) {
          return (
            <div className="ep-step">
              <h2>Step 4: Do You Own Real Estate in Louisiana?</h2>
              <p>Property ownership affects how your estate should be structured.</p>
              <div className="ep-options">
                <button
                  className={`ep-option-btn ${formData.ownsRealEstate === true ? 'selected' : ''}`}
                  onClick={() => handleYesNo('ownsRealEstate', true)}
                >
                  <i className="fas fa-home me-2"></i>
                  Yes, I own real estate
                </button>
                <button
                  className={`ep-option-btn ${formData.ownsRealEstate === false ? 'selected' : ''}`}
                  onClick={() => handleYesNo('ownsRealEstate', false)}
                >
                  <i className="fas fa-building me-2"></i>
                  No, I don't own real estate
                </button>
              </div>
              <div className="ep-buttons mt-4">
                <button className="btn btn-outline-secondary btn-lg" onClick={prevStep}>
                  <i className="fas fa-arrow-left me-2"></i> Back
                </button>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={nextStep}
                  disabled={formData.ownsRealEstate === null}
                >
                  Continue <i className="fas fa-arrow-right ms-2"></i>
                </button>
              </div>
            </div>
          );
        } else {
          // Incapacity planning path
          return (
            <div className="ep-step">
              <h2>Step 4: Incapacity Planning</h2>
              <p>
                If you lose capacity, do you want someone to make financial and healthcare
                decisions on your behalf?
              </p>
              <div className="ep-options">
                <button
                  className={`ep-option-btn ${formData.wantsIncapacityPlanning === true ? 'selected' : ''}`}
                  onClick={() => {
                    handleYesNo('wantsIncapacityPlanning', true);
                    setRecommendedProduct(PRODUCTS.POA_SUPPLEMENT);
                    setCurrentStep(7);
                  }}
                >
                  <i className="fas fa-user-shield me-2"></i>
                  Yes, I want Power of Attorney documents
                </button>
                <button
                  className={`ep-option-btn ${formData.wantsIncapacityPlanning === false ? 'selected' : ''}`}
                  onClick={() => handleYesNo('wantsIncapacityPlanning', false)}
                >
                  <i className="fas fa-times me-2"></i>
                  No, not at this time
                </button>
              </div>
              <div className="ep-buttons mt-4">
                <button className="btn btn-outline-secondary btn-lg" onClick={prevStep}>
                  <i className="fas fa-arrow-left me-2"></i> Back
                </button>
              </div>
            </div>
          );
        }

      case 5:
        if (formData.ownsRealEstate) {
          return (
            <div className="ep-step">
              <h2>Step 5: Probate Assets Value</h2>
              <p>
                Are your probate assets (excluding retirement accounts and life insurance)
                worth more than $125,000?
              </p>
              <div className="ep-options">
                <button
                  className={`ep-option-btn ${formData.assetsOver125k === true ? 'selected' : ''}`}
                  onClick={() => {
                    handleYesNo('assetsOver125k', true);
                    setRecommendedProduct(PRODUCTS.TRUST_BASED);
                    setCurrentStep(7);
                  }}
                >
                  <i className="fas fa-dollar-sign me-2"></i>
                  Yes, over $125,000
                </button>
                <button
                  className={`ep-option-btn ${formData.assetsOver125k === false ? 'selected' : ''}`}
                  onClick={() => {
                    handleYesNo('assetsOver125k', false);
                    setRecommendedProduct(PRODUCTS.WILL_BASED);
                    setCurrentStep(7);
                  }}
                >
                  <i className="fas fa-coins me-2"></i>
                  No, under $125,000
                </button>
              </div>
              <div className="ep-buttons mt-4">
                <button className="btn btn-outline-secondary btn-lg" onClick={prevStep}>
                  <i className="fas fa-arrow-left me-2"></i> Back
                </button>
              </div>
            </div>
          );
        } else {
          return (
            <div className="ep-step">
              <h2>Step 5: Do You Have Minor Children?</h2>
              <p>This determines if you need special provisions for guardianship.</p>
              <div className="ep-options">
                <button
                  className={`ep-option-btn ${formData.hasMinorChildren === true ? 'selected' : ''}`}
                  onClick={() => {
                    handleYesNo('hasMinorChildren', true);
                    setRecommendedProduct(PRODUCTS.MINOR_CHILD);
                    setCurrentStep(7);
                  }}
                >
                  <i className="fas fa-child me-2"></i>
                  Yes, I have minor children
                </button>
                <button
                  className={`ep-option-btn ${formData.hasMinorChildren === false ? 'selected' : ''}`}
                  onClick={() => {
                    handleYesNo('hasMinorChildren', false);
                    setRecommendedProduct(PRODUCTS.WILL_BASED);
                    setCurrentStep(7);
                  }}
                >
                  <i className="fas fa-user-check me-2"></i>
                  No minor children
                </button>
              </div>
              <div className="ep-buttons mt-4">
                <button className="btn btn-outline-secondary btn-lg" onClick={prevStep}>
                  <i className="fas fa-arrow-left me-2"></i> Back
                </button>
              </div>
            </div>
          );
        }

      case 7:
        const product = recommendedProduct || determineProduct();
        if (!product) {
          return (
            <div className="ep-step">
              <h2>Thank You</h2>
              <p>
                Based on your answers, you may not need our services at this time.
                If you change your mind, please start the questionnaire again.
              </p>
              <div className="ep-buttons mt-4">
                <button className="btn btn-primary btn-lg" onClick={() => setCurrentStep(1)}>
                  Start Over
                </button>
              </div>
            </div>
          );
        }
        return (
          <div className="ep-step ep-result">
            <h2>Your Recommended Plan</h2>
            <div className="ep-product-card">
              <div className="ep-product-icon">
                <i className="fas fa-file-contract fa-3x"></i>
              </div>
              <h3>{product.name}</h3>
              <p className="ep-product-price">${product.price}</p>
              <ul className="ep-product-features">
                {product.id === PRODUCTS.TRUST_BASED.id && (
                  <>
                    <li><i className="fas fa-check me-2"></i>Revocable Living Trust</li>
                    <li><i className="fas fa-check me-2"></i>Pour-Over Will</li>
                    <li><i className="fas fa-check me-2"></i>Financial Power of Attorney</li>
                    <li><i className="fas fa-check me-2"></i>Healthcare Power of Attorney</li>
                    <li><i className="fas fa-check me-2"></i>Living Will</li>
                    <li><i className="fas fa-check me-2"></i>Avoids Probate</li>
                  </>
                )}
                {product.id === PRODUCTS.WILL_BASED.id && (
                  <>
                    <li><i className="fas fa-check me-2"></i>Last Will and Testament</li>
                    <li><i className="fas fa-check me-2"></i>Financial Power of Attorney</li>
                    <li><i className="fas fa-check me-2"></i>Healthcare Power of Attorney</li>
                    <li><i className="fas fa-check me-2"></i>Living Will</li>
                  </>
                )}
                {product.id === PRODUCTS.MINOR_CHILD.id && (
                  <>
                    <li><i className="fas fa-check me-2"></i>Last Will with Guardian Nominations</li>
                    <li><i className="fas fa-check me-2"></i>Children's Trust Provisions</li>
                    <li><i className="fas fa-check me-2"></i>Financial Power of Attorney</li>
                    <li><i className="fas fa-check me-2"></i>Healthcare Power of Attorney</li>
                    <li><i className="fas fa-check me-2"></i>Living Will</li>
                  </>
                )}
                {product.id === PRODUCTS.POA_SUPPLEMENT.id && (
                  <>
                    <li><i className="fas fa-check me-2"></i>Financial Power of Attorney</li>
                    <li><i className="fas fa-check me-2"></i>Healthcare Power of Attorney</li>
                    <li><i className="fas fa-check me-2"></i>Advance Healthcare Directive</li>
                    <li><i className="fas fa-check me-2"></i>Living Will</li>
                  </>
                )}
              </ul>
              <button
                className="btn btn-success btn-lg w-100"
                onClick={() => handleGetStarted(product)}
              >
                <i className="fas fa-edit me-2"></i>
                Get Started - Fill Out Your Form
              </button>
            </div>
            <div className="ep-buttons mt-4">
              <button className="btn btn-outline-secondary" onClick={() => setCurrentStep(1)}>
                <i className="fas fa-redo me-2"></i> Start Over
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const totalSteps = 7;
  const progressPercent = (currentStep / totalSteps) * 100;

  return (
    <div className="estate-planning-page">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className="ep-header text-center mb-4">
              <h1>Estate Planning Questionnaire</h1>
              <p className="lead">
                Answer a few questions to find the right estate plan for your needs.
              </p>
            </div>

            <div className="ep-progress mb-4">
              <div className="progress" style={{ height: '8px' }}>
                <div
                  className="progress-bar bg-success"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              <small className="text-muted">
                Step {currentStep} of {totalSteps}
              </small>
            </div>

            <div className="ep-form-container card">
              <div className="card-body p-4">{renderStep()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EstatePlanning;
