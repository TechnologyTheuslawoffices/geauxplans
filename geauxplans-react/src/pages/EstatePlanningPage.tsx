import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/estate-planning-page.css';

const EstatePlanningPage: React.FC = () => {
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    state: 'LA',
    isMarried: null as boolean | null,
    planForDeath: null as boolean | null,
    ownsRealEstate: null as boolean | null,
    assetsOver125k: null as boolean | null,
    hasMinorChildren: null as boolean | null,
    wantsIncapacityPlanning: null as boolean | null,
  });

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  const handleYesNo = (field: string, value: boolean) => {
    setFormData({ ...formData, [field]: value });
  };

  const nextStep = () => setCurrentStep(currentStep + 1);
  const prevStep = () => setCurrentStep(currentStep - 1);

  const plans = [
    {
      id: 'minor-child',
      price: 'From $199',
      name: 'Minor Child-Centered Estate Plan',
      description: 'For families with young children',
      time: '15 min',
      link: '/minor-child-centered-estate-plan',
      formLink: '/checkout?product=606'
    },
    {
      id: 'poa',
      price: 'From $99',
      name: 'Power of Attorney Plan',
      description: 'For your college student or aging parent',
      time: '5 min',
      link: '/power-of-attorney-plan',
      formLink: '/checkout?product=614'
    },
    {
      id: 'will',
      price: 'From $199',
      name: 'Will-Based Estate Plan',
      description: 'To control your legacy',
      time: '15 min',
      link: '/will-based-estate-plan',
      formLink: '/checkout?product=673'
    },
    {
      id: 'trust',
      price: 'From $399',
      name: 'Trust-Based Estate Plan',
      description: 'To avoid probate and transfer assets',
      time: '20 min',
      link: '/trust-based-estate-plan',
      formLink: '/checkout?product=676'
    },
    {
      id: 'legal-edge',
      price: '$9.99/month',
      name: 'Legal Edge Plan',
      description: 'Premium membership with benefits',
      time: '',
      link: '/legal-edge-plan',
      formLink: '/legal-edge-plan'
    }
  ];

  const faqs = [
    { id: 'faq1', question: 'What is a Will?', answer: 'A Will is a legal document that expresses your wishes regarding the distribution of your property and the care of any minor children after your death.' },
    { id: 'faq2', question: 'What is Probate?', answer: 'Probate is the legal process of administering a deceased person\'s estate, including validating the will, paying debts, and distributing assets to beneficiaries.' },
    { id: 'faq3', question: 'What is a Trust?', answer: 'A Trust is a legal arrangement where one party (the trustee) holds property for the benefit of another (the beneficiary). Trusts can help avoid probate and provide more control over asset distribution.' },
    { id: 'faq4', question: 'What happens if I die without a Will in Louisiana?', answer: 'If you die without a Will in Louisiana (intestate), state law determines how your assets are distributed, which may not align with your wishes.' },
    { id: 'faq5', question: 'What is a Power of Attorney?', answer: 'A Power of Attorney is a legal document that allows you to appoint someone to manage your financial or healthcare decisions if you become incapacitated.' },
    { id: 'faq6', question: 'Do I need a Trust or a Will?', answer: 'The choice depends on your assets, family situation, and goals. A Trust offers probate avoidance and privacy, while a Will is simpler and less expensive to create.' },
    { id: 'faq7', question: 'What is a Healthcare Directive?', answer: 'A Healthcare Directive (Living Will) documents your wishes regarding medical treatment if you become unable to communicate your decisions.' },
    { id: 'faq8', question: 'How often should I update my estate plan?', answer: 'Review your estate plan every 3-5 years or after major life events like marriage, divorce, birth of children, or significant changes in assets.' },
  ];

  return (
    <main className="estate-planning-page-main">
      {/* Hero Section */}
      <section className="epp-hero">
        <div className="container">
          <div className="epp-hero-content">
            <h1><em className="text-blue">Easy & Affordable</em><br /><strong>Estate Planning</strong></h1>
            <p className="epp-hero-subtitle"><em>Protecting everything you own and everyone you love has never been so simple.</em></p>
            <p className="epp-hero-price">Starting from <strong>$99</strong></p>
            <button onClick={() => setShowQuiz(true)} className="btn btn-solid btn-lg">Match me with the right plan!</button>
          </div>
        </div>
      </section>

      {/* Plans Section */}
      <section className="epp-plans">
        <div className="container">
          <h2 className="section-title"><strong>Choose </strong><em className="text-blue">your plan</em></h2>
          <p className="section-subtitle"><em>Select the estate plan that fits your needs</em></p>

          <div className="plans-grid">
            {plans.map((plan) => (
              <div key={plan.id} className="plan-card">
                <div className="plan-price">{plan.price}</div>
                <h3 className="plan-name">{plan.name}</h3>
                <p className="plan-description"><em>{plan.description}</em></p>
                {plan.time && <p className="plan-time"><i className="far fa-clock"></i> {plan.time}</p>}
                <div className="plan-buttons pill-group">
                  <Link to={plan.formLink} className="btn btn-pill-left">Start My Plan</Link>
                  <Link to={plan.link} className="btn btn-pill-right">Is this plan right for me?</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="epp-process">
        <div className="container">
          <h2 className="section-title"><strong>The </strong><em className="text-blue">simplest</em><strong> process</strong></h2>
          <p className="section-subtitle"><em>Three easy steps and everything is online</em></p>

          <div className="process-grid">
            <div className="process-step">
              <div className="step-number">1</div>
              <h3><strong>Select your plan and pay</strong></h3>
              <p><em>Choose the estate plan that fits your needs and complete your purchase securely online.</em></p>
            </div>
            <div className="process-step">
              <div className="step-number">2</div>
              <h3><strong>Complete questionnaire</strong></h3>
              <p><em>Answer simple questions online to customize your documents to your specific situation.</em></p>
            </div>
            <div className="process-step">
              <div className="step-number">3</div>
              <h3><strong>Receive your documents</strong></h3>
              <p><em>Download immediately or have printed documents shipped to your door.</em></p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="epp-testimonials">
        <div className="container">
          <h2 className="section-title"><strong>What our </strong><em className="text-blue">clients</em><strong> say</strong></h2>
          <p className="section-subtitle"><em>Don't take our word for it</em></p>

          <div className="testimonials-grid">
            <div className="testimonial-card">
              <div className="testimonial-rating">★★★★★</div>
              <p><em>"The process was incredibly simple. I completed my estate plan in less than 30 minutes!"</em></p>
              <p className="testimonial-author"><strong>— Sarah M.</strong></p>
            </div>
            <div className="testimonial-card">
              <div className="testimonial-rating">★★★★★</div>
              <p><em>"Professional documents at an affordable price. The support team was very helpful."</em></p>
              <p className="testimonial-author"><strong>— Michael R.</strong></p>
            </div>
            <div className="testimonial-card">
              <div className="testimonial-rating">★★★★★</div>
              <p><em>"Finally, estate planning that doesn't require an expensive attorney visit. Highly recommend!"</em></p>
              <p className="testimonial-author"><strong>— Jennifer L.</strong></p>
            </div>
          </div>
        </div>
      </section>

      {/* Guarantee Section */}
      <section className="epp-guarantee">
        <div className="container">
          <h2 className="section-title"><strong>Our </strong><em className="text-blue">guarantees</em></h2>

          <div className="guarantee-grid">
            <div className="guarantee-item">
              <div className="guarantee-icon"><i className="fas fa-redo"></i></div>
              <h4><strong>Free 30-Day Modifications</strong></h4>
              <p><em>Make unlimited changes to your documents within 30 days of purchase.</em></p>
            </div>
            <div className="guarantee-item">
              <div className="guarantee-icon"><i className="fas fa-user-tie"></i></div>
              <h4><strong>Attorney Consultation</strong></h4>
              <p><em>Complimentary consultation with a licensed Louisiana attorney.</em></p>
            </div>
            <div className="guarantee-item">
              <div className="guarantee-icon"><i className="fas fa-dollar-sign"></i></div>
              <h4><strong>Full Credit Toward Services</strong></h4>
              <p><em>Apply your full fee toward professional legal services within one year.</em></p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="epp-faq">
        <div className="container">
          <h2 className="section-title"><strong>Frequently Asked </strong><em className="text-blue">Questions</em></h2>

          <div className="faq-accordion">
            {faqs.map((faq) => (
              <div key={faq.id} className={`faq-item ${expandedFaq === faq.id ? 'expanded' : ''}`}>
                <button onClick={() => toggleFaq(faq.id)}>
                  <span>{faq.question}</span>
                  <span className="toggle-icon">{expandedFaq === faq.id ? '−' : '+'}</span>
                </button>
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="epp-cta">
        <div className="container">
          <div className="cta-content">
            <h2><strong>Ready to protect your </strong><em className="text-blue">loved ones</em><strong>?</strong></h2>
            <p><em>Start your estate plan today in as little as 15 minutes.</em></p>
            <button onClick={() => setShowQuiz(true)} className="btn btn-solid btn-lg">Get Started</button>
          </div>
        </div>
      </section>

      {/* Quiz Modal */}
      {showQuiz && (
        <div className="quiz-modal-overlay" onClick={() => setShowQuiz(false)}>
          <div className="quiz-modal" onClick={(e) => e.stopPropagation()}>
            <button className="quiz-modal-close" onClick={() => setShowQuiz(false)}>×</button>
            <div className="quiz-modal-header">
              <h2>Find Your Perfect Plan</h2>
              <p>Answer a few questions to get a personalized recommendation.</p>
            </div>
            <div className="quiz-progress">
              <div className="progress-bar" style={{ width: `${(currentStep / 7) * 100}%` }}></div>
            </div>
            <div className="quiz-modal-body">
              {currentStep === 1 && (
                <div className="quiz-step">
                  <h3>What state do you live in?</h3>
                  <select
                    className="form-select"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  >
                    <option value="LA">Louisiana</option>
                    <option value="other">Other State</option>
                  </select>
                  {formData.state !== 'LA' && (
                    <p className="alert-warning">Currently, our services are only available for Louisiana residents.</p>
                  )}
                  <div className="quiz-buttons">
                    <button className="btn btn-solid" onClick={nextStep} disabled={formData.state !== 'LA'}>Continue</button>
                  </div>
                </div>
              )}
              {currentStep === 2 && (
                <div className="quiz-step">
                  <h3>Are you married?</h3>
                  <div className="quiz-options">
                    <button className={`quiz-option ${formData.isMarried === true ? 'selected' : ''}`} onClick={() => handleYesNo('isMarried', true)}>Yes</button>
                    <button className={`quiz-option ${formData.isMarried === false ? 'selected' : ''}`} onClick={() => handleYesNo('isMarried', false)}>No</button>
                  </div>
                  <div className="quiz-buttons">
                    <button className="btn btn-outline" onClick={prevStep}>Back</button>
                    <button className="btn btn-solid" onClick={nextStep} disabled={formData.isMarried === null}>Continue</button>
                  </div>
                </div>
              )}
              {currentStep === 3 && (
                <div className="quiz-step">
                  <h3>Do you want to plan for what happens when you die?</h3>
                  <div className="quiz-options">
                    <button className={`quiz-option ${formData.planForDeath === true ? 'selected' : ''}`} onClick={() => handleYesNo('planForDeath', true)}>Yes</button>
                    <button className={`quiz-option ${formData.planForDeath === false ? 'selected' : ''}`} onClick={() => handleYesNo('planForDeath', false)}>No, only incapacity planning</button>
                  </div>
                  <div className="quiz-buttons">
                    <button className="btn btn-outline" onClick={prevStep}>Back</button>
                    <button className="btn btn-solid" onClick={nextStep} disabled={formData.planForDeath === null}>Continue</button>
                  </div>
                </div>
              )}
              {currentStep === 4 && formData.planForDeath && (
                <div className="quiz-step">
                  <h3>Do you own real estate in Louisiana?</h3>
                  <div className="quiz-options">
                    <button className={`quiz-option ${formData.ownsRealEstate === true ? 'selected' : ''}`} onClick={() => handleYesNo('ownsRealEstate', true)}>Yes</button>
                    <button className={`quiz-option ${formData.ownsRealEstate === false ? 'selected' : ''}`} onClick={() => handleYesNo('ownsRealEstate', false)}>No</button>
                  </div>
                  <div className="quiz-buttons">
                    <button className="btn btn-outline" onClick={prevStep}>Back</button>
                    <button className="btn btn-solid" onClick={nextStep} disabled={formData.ownsRealEstate === null}>Continue</button>
                  </div>
                </div>
              )}
              {currentStep === 4 && !formData.planForDeath && (
                <div className="quiz-step">
                  <h3>Do you want someone to make decisions if you're incapacitated?</h3>
                  <div className="quiz-options">
                    <button className={`quiz-option ${formData.wantsIncapacityPlanning === true ? 'selected' : ''}`} onClick={() => { handleYesNo('wantsIncapacityPlanning', true); setCurrentStep(7); }}>Yes</button>
                    <button className={`quiz-option ${formData.wantsIncapacityPlanning === false ? 'selected' : ''}`} onClick={() => handleYesNo('wantsIncapacityPlanning', false)}>No</button>
                  </div>
                  <div className="quiz-buttons">
                    <button className="btn btn-outline" onClick={prevStep}>Back</button>
                  </div>
                </div>
              )}
              {currentStep === 5 && formData.ownsRealEstate && (
                <div className="quiz-step">
                  <h3>Are your probate assets worth more than $125,000?</h3>
                  <p className="quiz-hint">(Excluding retirement accounts and life insurance)</p>
                  <div className="quiz-options">
                    <button className={`quiz-option ${formData.assetsOver125k === true ? 'selected' : ''}`} onClick={() => { handleYesNo('assetsOver125k', true); setCurrentStep(7); }}>Yes</button>
                    <button className={`quiz-option ${formData.assetsOver125k === false ? 'selected' : ''}`} onClick={() => { handleYesNo('assetsOver125k', false); setCurrentStep(7); }}>No</button>
                  </div>
                  <div className="quiz-buttons">
                    <button className="btn btn-outline" onClick={prevStep}>Back</button>
                  </div>
                </div>
              )}
              {currentStep === 5 && formData.ownsRealEstate === false && (
                <div className="quiz-step">
                  <h3>Do you have minor children?</h3>
                  <div className="quiz-options">
                    <button className={`quiz-option ${formData.hasMinorChildren === true ? 'selected' : ''}`} onClick={() => { handleYesNo('hasMinorChildren', true); setCurrentStep(7); }}>Yes</button>
                    <button className={`quiz-option ${formData.hasMinorChildren === false ? 'selected' : ''}`} onClick={() => { handleYesNo('hasMinorChildren', false); setCurrentStep(7); }}>No</button>
                  </div>
                  <div className="quiz-buttons">
                    <button className="btn btn-outline" onClick={prevStep}>Back</button>
                  </div>
                </div>
              )}
              {currentStep === 7 && (
                <div className="quiz-step quiz-result">
                  <h3>Your Recommended Plan</h3>
                  {formData.assetsOver125k === true && (
                    <div className="recommended-plan">
                      <h4>Trust-Based Estate Plan</h4>
                      <p className="plan-price">$399</p>
                      <p>Avoid probate and transfer assets smoothly with a comprehensive trust.</p>
                      <Link to="/checkout?product=676" className="btn btn-solid btn-lg">Get Started</Link>
                    </div>
                  )}
                  {formData.assetsOver125k === false && formData.ownsRealEstate && (
                    <div className="recommended-plan">
                      <h4>Will-Based Estate Plan</h4>
                      <p className="plan-price">$199</p>
                      <p>Control your legacy with a comprehensive will-based plan.</p>
                      <Link to="/checkout?product=673" className="btn btn-solid btn-lg">Get Started</Link>
                    </div>
                  )}
                  {formData.hasMinorChildren === true && (
                    <div className="recommended-plan">
                      <h4>Minor Child-Centered Estate Plan</h4>
                      <p className="plan-price">$199</p>
                      <p>Protect your children with tutor appointments and guardianship provisions.</p>
                      <Link to="/checkout?product=606" className="btn btn-solid btn-lg">Get Started</Link>
                    </div>
                  )}
                  {formData.hasMinorChildren === false && !formData.ownsRealEstate && (
                    <div className="recommended-plan">
                      <h4>Will-Based Estate Plan</h4>
                      <p className="plan-price">$199</p>
                      <p>Control your legacy with a comprehensive will-based plan.</p>
                      <Link to="/checkout?product=673" className="btn btn-solid btn-lg">Get Started</Link>
                    </div>
                  )}
                  {formData.wantsIncapacityPlanning === true && !formData.planForDeath && (
                    <div className="recommended-plan">
                      <h4>Power of Attorney Plan</h4>
                      <p className="plan-price">$99</p>
                      <p>Designate someone to handle your affairs if you become incapacitated.</p>
                      <Link to="/checkout?product=614" className="btn btn-solid btn-lg">Get Started</Link>
                    </div>
                  )}
                  <button className="btn btn-outline" onClick={() => { setCurrentStep(1); setFormData({ state: 'LA', isMarried: null, planForDeath: null, ownsRealEstate: null, assetsOver125k: null, hasMinorChildren: null, wantsIncapacityPlanning: null }); }}>Start Over</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default EstatePlanningPage;
