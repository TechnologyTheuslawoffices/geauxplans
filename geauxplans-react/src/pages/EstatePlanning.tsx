import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

const PRODUCTS = {
  MINOR_CHILD: { id: 606, name: 'Minor Child-Centered Estate Plan', price: 599 },
  POA_SUPPLEMENT: { id: 614, name: 'Power of Attorney Supplement', price: 299 },
  WILL_BASED: { id: 673, name: 'Will-Based Estate Plan', price: 399 },
  TRUST_BASED: { id: 676, name: 'Trust-Based Estate Plan', price: 899 },
};

const EstatePlanning: React.FC = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [expandedPlan, setExpandedPlan] = useState<string | null>('minor-child');
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

  const openModal = () => {
    setShowModal(true);
    setCurrentStep(1);
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    setShowModal(false);
    document.body.style.overflow = 'auto';
  };

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
    const formType = formData.isMarried ? '2person' : 'solo';
    closeModal();
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
              <h3>{product.name}</h3>
              <p className="ep-product-price">${product.price}</p>
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
    <main>
      {/* Hero Section */}
      <section className="hero-home">
        <div className="container">
          <div className="hero-grid">
            <div className="hero-text">
              <p className="hero-subtitle">Complete solutions for</p>
              <h1 className="hero-title">
                Estate <span className="text-blue">&amp;</span> Business Planning
              </h1>
              <p className="hero-local">
                <em>Geaux</em> Local <span className="fleur-de-lis">⚜</span>
              </p>
              <p className="hero-description">
                <em>Whether planning your estate, your business, or your future, we are here
                to make your experience simple, smooth, and affordable, so you can rest
                easy knowing that all will be right in the world — </em>
                <strong>and you can get back to that gumbo.</strong> <em>Let's Geaux!</em>
              </p>
              <div className="hero-buttons pill-group">
                <button onClick={openModal} className="btn btn-pill-left">Estate Plans</button>
                <Link to="/start-business-llc" className="btn btn-pill-right">Business Planning</Link>
              </div>
            </div>
            <div className="hero-image">
              <div className="hero-image-wrapper">
                <img src="/img/welcome.svg" alt="" className="hero-swoosh" />
                <img
                  src="/img/field-family.jpg"
                  alt="Happy family"
                  className="hero-family"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hello Section */}
      <section className="hello-section">
        <div className="container">
          <div className="hello-grid">
            <div className="hello-title">
              <h2><span className="text-blue">hello</span>.</h2>
            </div>
            <div className="hello-content">
              <h3>Legal Help for Businesses and Families in Louisiana</h3>
            </div>
            <div className="hello-description">
              <p><em>Business is complex, and we've made it easier for business owners to manage risk, taxes, and relations with other owners, customers, and employees to get more work done while facing fewer roadblocks.</em></p>
              <Link to="/about" className="read-more">Read more →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Easy & Affordable Estate Planning Section */}
      <section className="estate-planning-section">
        <div className="container">
          <div className="ep-landing-grid">
            <div className="ep-landing-content">
              <div className="ep-icon">
                <img src="/img/document-icon.svg" alt="" />
              </div>
              <h2>Easy <span className="text-blue">&amp;</span> Affordable<br />Estate Planning</h2>
              <p className="ep-landing-subtitle"><em>Not sure where to start?</em></p>
              <p><em>Tell us about yourself and we'll match you with the right plan!</em></p>
              <button onClick={openModal} className="btn btn-solid btn-lg">Take the quiz</button>
            </div>
            <div className="ep-landing-plans">
              <div className="plans-accordion">
                <div className={`plan-accordion-item ${expandedPlan === 'minor-child' ? 'expanded' : ''}`}>
                  <button
                    className="plan-accordion-header"
                    onClick={() => setExpandedPlan(expandedPlan === 'minor-child' ? null : 'minor-child')}
                  >
                    <span>Minor Child-Centered Estate Plan</span>
                    <span className="accordion-icon">{expandedPlan === 'minor-child' ? '−' : '+'}</span>
                  </button>
                  {expandedPlan === 'minor-child' && (
                    <div className="plan-accordion-content">
                      <p>Create a will-based plan to appoint a Tutor for a minor child to act as surrogate parent for you if something should ever happen to you.</p>
                      <Link to="/minor-child-centered-estate-plan" className="btn btn-details">Details →</Link>
                    </div>
                  )}
                </div>
                <div className={`plan-accordion-item ${expandedPlan === 'poa' ? 'expanded' : ''}`}>
                  <button
                    className="plan-accordion-header"
                    onClick={() => setExpandedPlan(expandedPlan === 'poa' ? null : 'poa')}
                  >
                    <span>Power of Attorney Supplement Plan</span>
                    <span className="accordion-icon">{expandedPlan === 'poa' ? '−' : '+'}</span>
                  </button>
                  {expandedPlan === 'poa' && (
                    <div className="plan-accordion-content">
                      <p>Legal documents for your college student or aging family members to handle financial and healthcare decisions.</p>
                      <Link to="/power-of-attorney-plan" className="btn btn-details">Details →</Link>
                    </div>
                  )}
                </div>
                <div className={`plan-accordion-item ${expandedPlan === 'will' ? 'expanded' : ''}`}>
                  <button
                    className="plan-accordion-header"
                    onClick={() => setExpandedPlan(expandedPlan === 'will' ? null : 'will')}
                  >
                    <span>Will-Based Estate Plan</span>
                    <span className="accordion-icon">{expandedPlan === 'will' ? '−' : '+'}</span>
                  </button>
                  {expandedPlan === 'will' && (
                    <div className="plan-accordion-content">
                      <p>Control your legacy with a comprehensive will-based estate plan.</p>
                      <Link to="/will-based-estate-plan" className="btn btn-details">Details →</Link>
                    </div>
                  )}
                </div>
                <div className={`plan-accordion-item ${expandedPlan === 'trust' ? 'expanded' : ''}`}>
                  <button
                    className="plan-accordion-header"
                    onClick={() => setExpandedPlan(expandedPlan === 'trust' ? null : 'trust')}
                  >
                    <span>Trust-Based Estate Plan</span>
                    <span className="accordion-icon">{expandedPlan === 'trust' ? '−' : '+'}</span>
                  </button>
                  {expandedPlan === 'trust' && (
                    <div className="plan-accordion-content">
                      <p>Avoid probate and transfer assets smoothly with a trust-based estate plan.</p>
                      <Link to="/trust-based-estate-plan" className="btn btn-details">Details →</Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GeauxPlans in Numbers Section */}
      <section className="numbers-section">
        <div className="container">
          <h3>GeauxPlans in numbers</h3>
          <p className="numbers-subtitle">In the course of our work</p>
          <div className="numbers-grid">
            <div className="number-card">
              <span className="number">140</span>
              <p>Years total experience of our specialists in the field of law</p>
            </div>
            <div className="number-card">
              <span className="number">#1</span>
              <p>Online Estate and Business planning company in Louisiana</p>
            </div>
            <div className="number-card">
              <span className="number">5k</span>
              <p>Happy clients across the United States</p>
            </div>
          </div>
        </div>
      </section>

      {/* Louisiana Business Section */}
      <section className="louisiana-business-section">
        <div className="container">
          <div className="louisiana-grid">
            <div className="louisiana-content">
              <h2>Your Louisiana Business is in good hands</h2>
              <p><em>Unlike other online sources, GeauxPlans is owned, administered, and supported by a Louisiana law firm.</em></p>
              <div className="louisiana-buttons">
                <Link to="/start-business-llc" className="btn btn-solid">Start brand new LLC</Link>
                <Link to="/operating-agreement-llc" className="btn btn_geaux">Get Operating Agreement</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Learning Center Section */}
      <section className="learning-section">
        <div className="container">
          <h3>The Learning Center</h3>
          <p className="learning-subtitle"><em>Made in Louisiana for Louisiana</em></p>
          <div className="learning-grid">
            <div className="learning-column">
              <h4>#1 Business Planning</h4>
              <p>Find out how to start your Limited Liability Company.</p>
              <ul className="article-list">
                <li>
                  <span className="article-date">March 29, 2023</span>
                  <Link to="/learn">The Ultimate Guide to Starting a Business</Link>
                </li>
                <li>
                  <span className="article-date">January 27, 2023</span>
                  <Link to="/learn">Do I Need an LLC?</Link>
                </li>
                <li>
                  <span className="article-date">September 16, 2022</span>
                  <Link to="/learn">How Does an LLC Provide Asset Protection and Why Do I Need One?</Link>
                </li>
              </ul>
            </div>
            <div className="learning-column">
              <h4>#2 Estate Planning</h4>
              <p>Learn everything you need to know about estate planning.</p>
              <ul className="article-list">
                <li>
                  <span className="article-date">February 8, 2023</span>
                  <Link to="/learn">Make a Will Online in 3 Easy Steps</Link>
                </li>
                <li>
                  <span className="article-date">January 26, 2023</span>
                  <Link to="/learn">Five of the Most Useful Limited Powers of Attorney</Link>
                </li>
                <li>
                  <span className="article-date">January 23, 2023</span>
                  <Link to="/learn">The Difference Between a General, Limited, Durable, and Springing Power of Attorney</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="contact-section">
        <div className="container">
          <h3>Do you have any questions?</h3>
          <p><strong>Support team:</strong> M-F, 8am-5pm CST</p>
          <p><strong>Call us:</strong> +1 (855) 213-6300</p>
        </div>
      </section>

      {/* Quiz Modal */}
      {showModal && (
        <div className="quiz-modal-overlay" onClick={closeModal}>
          <div className="quiz-modal" onClick={(e) => e.stopPropagation()}>
            <button className="quiz-modal-close" onClick={closeModal}>
              <i className="fas fa-times"></i>
            </button>
            <div className="quiz-modal-header">
              <h2>Estate Planning Questionnaire</h2>
              <p>Answer a few questions to find the right estate plan for your needs.</p>
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
            <div className="quiz-modal-body">
              {renderStep()}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default EstatePlanning;
