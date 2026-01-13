import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import '../styles/business-llc.css';

interface AvailabilityResult {
  available: boolean | null;
  message: string;
  similar?: Array<{ name: string; type: string; status: string }>;
}

interface BusinessFormData {
  llcName: string;
  whenStart: string;
  firstLLC: string;
  whatWillDo: string;
  whereSelling: string;
  employees: string;
  registeredAgent: string;
  operatingPackage: string;
  llcPackage: string;
}

const StartBusinessLLC: React.FC = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [businessName, setBusinessName] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<AvailabilityResult | null>(null);

  // Multi-step wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [showWizard, setShowWizard] = useState(false);
  const [formData, setFormData] = useState<BusinessFormData>({
    llcName: '',
    whenStart: 'Soon (1-2 months)',
    firstLLC: 'Yes',
    whatWillDo: '',
    whereSelling: 'In Person',
    employees: 'No',
    registeredAgent: 'Yes',
    operatingPackage: 'gpx_og_2',
    llcPackage: 'gpx_llc_3'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkAvailability = async () => {
    if (!businessName.trim()) {
      setResult({
        available: null,
        message: 'Please enter a business name to check availability.'
      });
      return;
    }

    setIsChecking(true);
    setResult(null);

    try {
      const response = await fetch('/api/business/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: businessName.trim(), state: 'LA' })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          if (data.data.available) {
            // Name is available - show wizard
            setFormData(prev => ({ ...prev, llcName: businessName.trim() }));
            setShowWizard(true);
            setCurrentStep(2);
          } else {
            setResult({
              available: false,
              message: data.data.message || 'LLC with this name already exists!',
              similar: data.data.similar
            });
          }
        } else {
          throw new Error(data.error);
        }
      } else {
        // Backend not available - assume available for demo
        setFormData(prev => ({ ...prev, llcName: businessName.trim() }));
        setShowWizard(true);
        setCurrentStep(2);
      }
    } catch (error) {
      // Fallback - assume available for demo
      setFormData(prev => ({ ...prev, llcName: businessName.trim() }));
      setShowWizard(true);
      setCurrentStep(2);
    } finally {
      setIsChecking(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      checkAvailability();
    }
  };

  const goBack = () => {
    if (currentStep === 2) {
      setShowWizard(false);
      setCurrentStep(1);
    } else if (currentStep > 2) {
      setCurrentStep(currentStep - 1);
    }
  };

  const goNext = () => {
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePurchase = async () => {
    setIsSubmitting(true);

    try {
      // Calculate total based on selections
      const llcPrices: Record<string, { price: number; filing: number; name: string }> = {
        'gpx_llc_1': { price: 89, filing: 100, name: 'Economy LLC Package' },
        'gpx_llc_2': { price: 329, filing: 100, name: 'Standard LLC Package' },
        'gpx_llc_3': { price: 349, filing: 130, name: 'Express Gold LLC Package' }
      };

      const operatingPrices: Record<string, { price: number; name: string }> = {
        'gpx_og_1': { price: 149, name: 'Operating Agreement' },
        'gpx_og_2': { price: 199, name: 'Operating Agreement + EIN' },
        'gpx_og_3': { price: 299, name: 'Operating Agreement + EIN + Licenses' }
      };

      const selectedLLC = llcPrices[formData.llcPackage];
      const selectedOperating = formData.operatingPackage !== 'none' ? operatingPrices[formData.operatingPackage] : null;
      const registeredAgentPrice = formData.registeredAgent === 'Yes' ? 249 : 0;

      // Add LLC package to cart
      addToCart({
        id: `llc-${formData.llcPackage}-${Date.now()}`,
        name: `${selectedLLC.name} - ${formData.llcName}, LLC`,
        price: selectedLLC.price + selectedLLC.filing,
        quantity: 1,
        type: 'llc-formation',
        metadata: {
          ...formData,
          packageType: formData.llcPackage,
          filingFee: selectedLLC.filing
        }
      });

      // Add registered agent if selected
      if (formData.registeredAgent === 'Yes') {
        addToCart({
          id: `ra-${Date.now()}`,
          name: `Registered Agent Service - ${formData.llcName}, LLC`,
          price: registeredAgentPrice,
          quantity: 1,
          type: 'registered-agent',
          metadata: { llcName: formData.llcName }
        });
      }

      // Add operating package if selected
      if (selectedOperating) {
        addToCart({
          id: `op-${formData.operatingPackage}-${Date.now()}`,
          name: `${selectedOperating.name} - ${formData.llcName}, LLC`,
          price: selectedOperating.price,
          quantity: 1,
          type: 'operating-package',
          metadata: { llcName: formData.llcName, packageType: formData.operatingPackage }
        });
      }

      // Navigate to checkout
      navigate('/checkout');
    } catch (error) {
      console.error('Error adding to cart:', error);
      alert('There was an error processing your request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get operating package display info
  const getOperatingPackageInfo = () => {
    switch (formData.operatingPackage) {
      case 'gpx_og_1':
        return { price: 149, description: 'An operating agreement is your company\'s constitution. Set guidelines, settle disputes, and protect your assets.' };
      case 'gpx_og_2':
        return { price: 199, description: 'An EIN is your LLC\'s Social Security number. Use it to file taxes, build your staff, and access financial resources.' };
      case 'gpx_og_3':
        return { price: 299, description: 'Licenses keep your business compliant and running smoothly. Ensure you have what\'s required for your specific industry and state.' };
      default:
        return { price: 199, description: '' };
    }
  };

  // Get LLC package display info
  const getLLCPackageInfo = () => {
    switch (formData.llcPackage) {
      case 'gpx_llc_1':
        return { price: 89, filing: 100, description: 'Est. processing time: 30 business days.' };
      case 'gpx_llc_2':
        return { price: 329, filing: 100, description: 'Est. processing time: 15 business days. Includes Economy package + Founder\'s kit, embosser & certificates' };
      case 'gpx_llc_3':
        return { price: 349, filing: 130, description: 'Est. processing time: 10 business days. Includes Standard package + VIP processing & express shipping' };
      default:
        return { price: 349, filing: 130, description: '' };
    }
  };

  // Render Step 1: Initial Search Form
  const renderStep1 = () => (
    <>
      <section className="llc-hero-section">
        <div className="container">
          <h1><strong>Start </strong><em className="text-blue">your business</em><strong> in Louisiana</strong></h1>
          <p className="hero-tagline"><em>We've got you covered. Let's Geaux!</em></p>
          <p className="hero-description">
            Find out if an LLC is right for you – enter your preferred business name to get started. <strong>Starts at $89</strong> + filing fees.
          </p>
          <div className="llc-search-form">
            <input
              type="text"
              placeholder="What do you want to call LLC?"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              onKeyPress={handleKeyPress}
              className="llc-search-input"
            />
            <button
              type="button"
              className="llc-check-btn"
              onClick={checkAvailability}
              disabled={isChecking}
              style={{
                display: 'block',
                background: isChecking ? '#6666ff' : '#0000ff',
                color: '#fff',
                border: 'none',
                borderRadius: '0 50px 50px 0',
                padding: '14px 35px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: isChecking ? 'wait' : 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {isChecking ? 'Checking...' : 'Check'}
            </button>
          </div>

          {/* Error Result (name not available) */}
          {result && result.available === false && (
            <div className="availability-result unavailable">
              <div className="result-icon">
                <span className="icon-x">✗</span>
              </div>
              <div className="result-content">
                <p className="result-message">{result.message}</p>
                {result.similar && result.similar.length > 0 && (
                  <div className="similar-names">
                    <p><strong>Similar registered names:</strong></p>
                    <ul>
                      {result.similar.map((item, index) => (
                        <li key={index}>{item.name} ({item.type})</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {result && result.available === null && (
            <div className="availability-result neutral">
              <div className="result-icon">
                <span className="icon-info">ℹ</span>
              </div>
              <div className="result-content">
                <p className="result-message">{result.message}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="llc-features-section">
        <div className="container">
          <div className="llc-features-card">
            <div className="llc-features-grid">
              <div className="llc-feature">
                <h3><span className="feature-star">★</span> <strong>Asset Protection</strong></h3>
                <p><em>Protect yourself from personal liability for business risks.</em></p>
              </div>
              <div className="llc-feature">
                <h3><span className="feature-star">★</span> <strong>Keep It Simple</strong></h3>
                <p><em>LLCs have fewer formalities compared to corporations.</em></p>
              </div>
              <div className="llc-feature">
                <h3><span className="feature-star">★</span> <strong>Optimize Taxes</strong></h3>
                <p><em>You decide how your LLC is taxed – as disregarded entity, partnership, or corporation.</em></p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );

  // Render Step 2: Great News! Confirmation
  const renderStep2 = () => (
    <section className="wizard-step step-2">
      <div className="container">
        <div className="wizard-content">
          <div className="text-center mb-4">
            <h2 className="wizard-title">
              <strong>Great News!</strong>{' '}
              <em className="text-blue">{formData.llcName}</em>{' '}
              <strong>is available for<br />registration in Louisiana as LLC</strong>
            </h2>
            <p className="wizard-disclaimer">
              <small>This is based on a preliminary search. A more thorough search will be performed during the LLC formation process<br />
              and we will then confirm the availability of your preferred business name.</small>
            </p>
            <p className="wizard-tagline">
              <em><strong>Let's lock it in.</strong> We have formed hundreds of businesses, so count on us to give your LLC the best start!</em>
            </p>
          </div>

          <div className="process-cards">
            <div className="process-card">
              <h6><span className="step-number">#1</span> <strong>Tell us about your business</strong></h6>
              <p><em>Answer a few questions to help us get to know you and make sure you set up your LLC correctly.</em></p>
            </div>
            <div className="process-card">
              <h6><span className="step-number">#2</span> <strong>See your personalized offers</strong></h6>
              <p><em>Based on your answers and our 20+ years of experience, you'll see offers tailored to your unique business.</em></p>
            </div>
            <div className="process-card">
              <h6><span className="step-number">#3</span> <strong>Form with total peace of mind</strong></h6>
              <p><em>Let us take care of the legal documents and ongoing requirements so you can focus on building your business.</em></p>
            </div>
          </div>

          <div className="wizard-actions text-center">
            <button onClick={goNext} className="btn btn-primary btn-lg">
              Tell us about <span className="llc-name">{formData.llcName}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );

  // Render Step 3: Business Questions
  const renderStep3 = () => (
    <section className="wizard-step step-3">
      <div className="container">
        <div className="wizard-content">
          <div className="text-center mb-5">
            <h2 className="wizard-title">
              <strong>Tell us about</strong>{' '}
              <em className="text-blue">{formData.llcName}</em>{' '}
              <strong>more</strong>
            </h2>
          </div>

          <div className="business-questions-grid">
            <div className="questions-column">
              <div className="question-group">
                <h6><span className="question-number">#1</span> When do you want to start your business?</h6>
                <select name="whenStart" value={formData.whenStart} onChange={handleInputChange}>
                  <option value="I already did">I already did</option>
                  <option value="Soon (1-2 months)">Soon (1-2 months)</option>
                  <option value="One day in the future (2+ months)">One day in the future (2+ months)</option>
                </select>
              </div>

              <div className="question-group">
                <h6><span className="question-number">#2</span> Is <span className="llc-name">{formData.llcName}</span> your first LLC?</h6>
                <select name="firstLLC" value={formData.firstLLC} onChange={handleInputChange}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div className="question-group">
                <h6><span className="question-number">#3</span> What will <span className="llc-name">{formData.llcName}</span> do?</h6>
                <textarea
                  name="whatWillDo"
                  value={formData.whatWillDo}
                  onChange={handleInputChange}
                  maxLength={60}
                  placeholder="Describe your business activities..."
                  required
                />
              </div>
            </div>

            <div className="questions-column">
              <div className="question-group">
                <h6><span className="question-number">#4</span> Where will <span className="llc-name">{formData.llcName}</span> sell its products or services?</h6>
                <select name="whereSelling" value={formData.whereSelling} onChange={handleInputChange}>
                  <option value="In Person">In Person</option>
                  <option value="Online">Online</option>
                  <option value="Both">Both</option>
                  <option value="Not selling any products or services">Not selling any products/services</option>
                </select>
              </div>

              <div className="question-group">
                <h6><span className="question-number">#5</span> Will you have employees the first 12 months?</h6>
                <select name="employees" value={formData.employees} onChange={handleInputChange}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div className="wizard-actions">
                <button onClick={goNext} className="btn btn-primary btn-lg">Proceed</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  // Render Step 4: Registered Agent
  const renderStep4 = () => (
    <section className="wizard-step step-4">
      <div className="container">
        <div className="wizard-content">
          <div className="text-center mb-5">
            <h2 className="wizard-title"><strong>Choose your registered agent</strong></h2>
          </div>

          <div className="registered-agent-grid">
            <div className="agent-info">
              <h6><strong>What is a registered agent?</strong></h6>
              <p><em>It is a requirement to specify an official address for service of key documents, including service of legal process. Most businesses use a professional service for this.</em></p>

              <h6 className="mt-4"><strong>Can I be my own registered agent?</strong></h6>
              <p><em>Yes, technically you can appoint yourself. However, there are lots of reasons why you may prefer to select a professional registered agent.</em></p>
            </div>

            <div className="agent-selection-card">
              <h6><strong>GeauxPlans as Registered Agent</strong></h6>
              <p>Appoint us as the Registered Agent for <span className="llc-name">{formData.llcName}</span> and get total peace of mind - we can take care of this conveniently and affordably.</p>

              <div className="benefits-section">
                <p className="mb-1"><small><strong>Premium Benefits:</strong></small></p>
                <ul className="benefits-list">
                  <li>Maintain privacy</li>
                  <li>Protect the legal status of your LLC</li>
                  <li>Ensure timely receipt of critical notices</li>
                  <li>Minimize annual compliance hassles</li>
                </ul>
              </div>

              <div className="price-tag">
                Price: <strong>$249.00</strong> annually
              </div>

              <div className="wizard-actions">
                <button
                  onClick={() => { setFormData(prev => ({ ...prev, registeredAgent: 'Yes' })); goNext(); }}
                  className="btn btn-primary btn-lg"
                >
                  Continue with GeauxPlans
                </button>
                <button
                  onClick={() => { setFormData(prev => ({ ...prev, registeredAgent: 'No' })); goNext(); }}
                  className="btn-link"
                >
                  Appoint another agent <strong>at your own risk</strong>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  // Render Step 5: Operating Package
  const renderStep5 = () => {
    const packageInfo = getOperatingPackageInfo();

    return (
      <section className="wizard-step step-5">
        <div className="container">
          <div className="wizard-content">
            <div className="text-center mb-5">
              <h2 className="wizard-title"><strong>Save time and money on essential documents</strong></h2>
              <p><em>From operating to hiring, we'll help you get the right documents, requirements, licenses, and permits to stay compliant.<br />These costs are tax-deductible.</em></p>
            </div>

            <div className="operating-package-grid">
              <div className="package-selection">
                <h4><span className="text-blue">Operating</span> package</h4>
                <select name="operatingPackage" value={formData.operatingPackage} onChange={handleInputChange}>
                  <option value="gpx_og_1">Operating agreement</option>
                  <option value="gpx_og_2">Operating agreement plus EIN</option>
                </select>

                <p className="mt-4"><strong>Description:</strong><br />
                  <em>{packageInfo.description}</em>
                </p>

                <div className="price-tag">
                  Price: <strong>${packageInfo.price}.00</strong>
                </div>

                <div className="wizard-actions mt-4">
                  <button onClick={goNext} className="btn btn-primary btn-lg">
                    Continue with this package
                  </button>
                  <button
                    onClick={() => { setFormData(prev => ({ ...prev, operatingPackage: 'none' })); goNext(); }}
                    className="btn-link"
                  >
                    No, thanks. I'll take care of this on my own
                  </button>
                </div>
              </div>

              <div className="package-features">
                <h6><strong>What's included in package?</strong></h6>
                <ul className="styled-list">
                  <li className={formData.operatingPackage === 'gpx_og_1' || formData.operatingPackage === 'gpx_og_2' || formData.operatingPackage === 'gpx_og_3' ? 'active' : ''}>
                    An OA allows you to set your own rules for your LLC vs. following default state laws
                  </li>
                  <li className={formData.operatingPackage === 'gpx_og_1' || formData.operatingPackage === 'gpx_og_2' || formData.operatingPackage === 'gpx_og_3' ? 'active' : ''}>
                    Becomes a binding contract with partners so you can start with clear eyes and avoid disputes
                  </li>
                  <li className={formData.operatingPackage === 'gpx_og_1' || formData.operatingPackage === 'gpx_og_2' || formData.operatingPackage === 'gpx_og_3' ? 'active' : ''}>
                    Protects your assets by helping maintain your limited liability status
                  </li>
                  <li className={formData.operatingPackage === 'gpx_og_2' || formData.operatingPackage === 'gpx_og_3' ? 'active' : ''}>
                    An EIN helps you open a business bank account, get a line of credit, and apply for loans
                  </li>
                  <li className={formData.operatingPackage === 'gpx_og_2' || formData.operatingPackage === 'gpx_og_3' ? 'active' : ''}>
                    Prevents identity theft by letting you use your EIN for business, rather than your SSN
                  </li>
                  <li className={formData.operatingPackage === 'gpx_og_2' || formData.operatingPackage === 'gpx_og_3' ? 'active' : ''}>
                    Required for taxes if you have employees or partners
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  };

  // Render Step 6: LLC Package Selection
  const renderStep6 = () => {
    const packageInfo = getLLCPackageInfo();

    return (
      <section className="wizard-step step-6">
        <div className="container">
          <div className="wizard-content">
            <div className="text-center mb-5">
              <h2 className="wizard-title"><strong>Select an LLC package below, and you're all done!</strong></h2>
              <p><em>Express Gold gives you the most support in getting your LLC up and running when you're ready.<br />Remember, these costs are often <strong>tax deductible</strong>, so select the best package for your needs.</em></p>
            </div>

            <div className="llc-package-grid">
              <div className="package-selection">
                <h4><span className="text-blue">LLC</span> package</h4>
                <select name="llcPackage" value={formData.llcPackage} onChange={handleInputChange}>
                  <option value="gpx_llc_1">Economy</option>
                  <option value="gpx_llc_2">Standard</option>
                  <option value="gpx_llc_3">Express Gold</option>
                </select>

                <p className="mt-4"><strong>Description:</strong><br />
                  <em>{packageInfo.description}</em>
                </p>

                <div className="price-tag">
                  Price: <strong>${packageInfo.price} + ${packageInfo.filing} Filing fees</strong>
                </div>

                <div className="wizard-actions mt-4">
                  <button
                    onClick={handlePurchase}
                    className="btn btn-primary btn-lg"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Processing...' : 'Proceed to Checkout'}
                  </button>
                </div>
              </div>

              <div className="package-features">
                <h6><strong>What's included in package?</strong></h6>
                <ul className="styled-list">
                  <li className="active">
                    We search the name directory to confirm that your business name is available, complete your LLC paperwork, and submit it with your state.
                  </li>
                  <li className="active">
                    We dot the i's and cross the t's before your paperwork is filed to ensure consistency and completeness.
                  </li>
                  <li className="active">
                    Includes your Louisiana articles of organization, a financial account authorization letter specifying who can open your business bank account, and a step-by-step checklist for after your LLC is formed.
                  </li>
                  <li className="active">
                    Get help when you need it with agents who can answer questions about the business formation process.
                  </li>
                  <li className={formData.llcPackage === 'gpx_llc_2' || formData.llcPackage === 'gpx_llc_3' ? 'active' : ''}>
                    Mark your important business milestone with a worthy place to store your important documents, printed on archival paper, and delivered in a compact and attractive package.
                  </li>
                  <li className={formData.llcPackage === 'gpx_llc_2' || formData.llcPackage === 'gpx_llc_3' ? 'active' : ''}>
                    Includes company membership certificates with your newly secured business name.
                  </li>
                  <li className={formData.llcPackage === 'gpx_llc_3' ? 'active' : ''}>
                    We prioritize your order and rush our process to complete it within 10 business days.
                  </li>
                  <li className={formData.llcPackage === 'gpx_llc_3' ? 'active' : ''}>
                    Receive your filed docs with our fastest shipping option.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  };

  // Render the wizard modal
  const renderWizard = () => (
    <div className="llc-wizard-modal">
      <div className="wizard-container">
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
        {currentStep === 5 && renderStep5()}
        {currentStep === 6 && renderStep6()}

        {/* Step Back Navigation */}
        {currentStep >= 2 && (
          <div className="wizard-back-nav text-center">
            <button onClick={goBack} className="btn-back">
              ← Step Back
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <main className="business-llc-page">
      {!showWizard ? (
        <>
          {renderStep1()}

          {/* Ready Set Geaux Section */}
          <section className="llc-info-section">
            <div className="container">
              <div className="llc-info-grid">
                <div className="llc-info-content">
                  <h2><strong>Ready, Set, Geaux!</strong></h2>
                  <p className="info-subtitle"><em>est. 2020</em></p>
                  <p>Unlike other online sources, GeauxPlans is owned, administered and supported by a <strong>Louisiana law firm</strong>.</p>
                  <p>GeauxPlans documents are developed and continually enhanced by licensed Louisiana attorneys, including a tax law specialist certified by the Louisiana State Board of Legal Specialization.</p>
                  <img src="/wp-content/uploads/2021/12/sign-300x88.png" alt="Signature" className="signature-img" />
                </div>
                <div className="llc-info-images">
                  <img src="/wp-content/uploads/2021/12/b1.jpg" alt="" />
                  <img src="/wp-content/uploads/2021/12/b2-1.jpg" alt="" />
                </div>
              </div>
            </div>
          </section>

          {/* How to Start LLC Section */}
          <section className="llc-process-section">
            <div className="container">
              <h2 className="section-title"><strong>How to start </strong><em className="text-blue">your LLC</em><strong> in minutes</strong></h2>
              <p className="section-subtitle"><em>Complete business solutions</em></p>

              <div className="process-steps">
                <div className="process-step">
                  <div className="step-icon">
                    <img src="/wp-content/uploads/2021/12/290120_account_avatar_man_profile_user_icon.svg" alt="" />
                  </div>
                  <p><em>Tell us your business name, or pick one if you haven't yet</em></p>
                </div>
                <div className="process-step active">
                  <div className="step-icon">
                    <img src="/wp-content/uploads/2021/12/290138_document_extension_file_format_paper_icon.svg" alt="" />
                  </div>
                  <p><em>Answer a few simple questions after purchase</em></p>
                </div>
                <div className="process-step">
                  <div className="step-icon">
                    <img src="/wp-content/uploads/2021/12/290108_achievement_award_badge_medal_prize_icon.svg" alt="" />
                  </div>
                  <p><em>GeauxPlans will complete and file your documents</em></p>
                </div>
              </div>
            </div>
          </section>

          {/* Registered Agent Section */}
          <section className="llc-agent-section">
            <div className="container">
              <div className="agent-grid">
                <div className="agent-image">
                  <img src="/wp-content/uploads/2021/12/b2-2.jpg" alt="" />
                </div>
                <div className="agent-content">
                  <h2><strong>GeauxPlans as</strong><br /><em className="text-blue">Your</em><strong> Registered Agent</strong></h2>
                  <p className="agent-price"><em>Just for $249.00 annually</em></p>

                  <div className="agent-details">
                    <div className="agent-description">
                      <p>Every LLC must maintain a registered agent and physical office in Louisiana to receive critical legal notices and other communications. A registered agent is appointed upon the formation of an LLC. A member of an LLC may serve as a registered agent. However, the physical address of the registered agent is of public record and the continued good standing of an LLC requires prompt attention to avoid dissolution by the Secretary of State.</p>
                      <p><em>Unlike other registered agent options, GeauxPlans is owned, administered, and supported by a Louisiana law firm and maintains a permanent physical address in Louisiana with full-time (8 am to 5 pm) on-site (not remote) staffing to receive critical legal notices on behalf of GeauxPlans' business customers.</em></p>
                    </div>
                    <div className="agent-benefits">
                      <h5><strong>Premium Benefits</strong></h5>
                      <ul className="benefits-list">
                        <li><i className="fas fa-check"></i> Maintain privacy</li>
                        <li><i className="fas fa-check"></i> Protect the legal status of your LLC</li>
                        <li><i className="fas fa-check"></i> Ensure timely receipt of critical notices</li>
                        <li><i className="fas fa-check"></i> Minimize annual compliance hassles</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Testimonials Section */}
          <section className="llc-testimonials-section">
            <div className="container">
              <h2 className="section-title"><strong>What our </strong><em className="text-blue">clients</em><strong> say</strong></h2>
              <p className="section-subtitle"><em>Don't take our word for it, check out what our members have to say about us</em></p>

              <div className="testimonials-grid">
                <div className="testimonial-card">
                  <p><em>I needed an Operating Agreement for my LLC. GeauxPlans delivered a <strong className="text-blue">very detailed agreement</strong> that works well for us.</em></p>
                  <p><em>Definitely recommend.</em></p>
                  <div className="testimonial-rating">★★★★★</div>
                  <p className="testimonial-author"><strong><em>Tim R.</em></strong></p>
                </div>
                <div className="testimonial-card">
                  <p><em>Starting a new business with GeauxPlans is easy. <strong className="text-blue">Just answer a few questions</strong> and let GeauxPlans do the rest!</em></p>
                  <p><em>Easy as 1 2 3!</em></p>
                  <div className="testimonial-rating">★★★★★</div>
                  <p className="testimonial-author"><strong><em>Christian S.</em></strong></p>
                </div>
                <div className="testimonial-card">
                  <p>We started a new business and GeauxPlans told us which names were still available and then prompted us to lock in our best choice. The Secretary of State doesn't even do this. <strong className="text-blue">Amazing!</strong></p>
                  <div className="testimonial-rating">★★★★★</div>
                  <p className="testimonial-author"><strong><em>Paul H.</em></strong></p>
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="llc-cta-section">
            <div className="container">
              <div className="cta-card">
                <h2><strong>Start </strong><em>your business</em><strong> now!</strong></h2>
                <p><em>Experience you can trust. We've got your back</em></p>
                <Link to="#" className="btn btn-solid btn-lg" onClick={() => window.scrollTo(0, 0)}>Ready, Set, Geaux!</Link>
              </div>
            </div>
          </section>
        </>
      ) : (
        renderWizard()
      )}
    </main>
  );
};

export default StartBusinessLLC;
