import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/estate-planning-page.css';

const US_STATES = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District Of Columbia' },
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
  MINOR_CHILD: { id: 606, name: 'Minor Child-Centered Estate Plan', price: 199, slug: '/minor-child-centered-estate-plan' },
  POA_SUPPLEMENT: { id: 614, name: 'Power of Attorney Supplement', price: 99, slug: '/power-of-attorney-plan' },
  WILL_BASED: { id: 673, name: 'Will-Based Estate Plan', price: 199, slug: '/will-based-estate-plan' },
  TRUST_BASED: { id: 676, name: 'Trust-Based Estate Plan', price: 399, slug: '/trust-based-estate-plan' },
};

const EstatePlanningPage: React.FC = () => {
  const navigate = useNavigate();
  const quizRef = useRef<HTMLDivElement>(null);
  const plansRef = useRef<HTMLDivElement>(null);

  // Quiz state
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    state: 'LA',
    isMarried: 'Yes' as string,
    planForDeath: 'Yes' as string,
    ownsRealEstate: 'Yes' as string,
    avoidProbate: 'Yes' as string,
    assetsOver125k: 'Yes' as string,
    hasMinorChildren: 'Yes' as string,
    wantsIncapacityPlanning: 'Yes' as string,
    needsAuthorityForOther: 'Yes' as string,
    seeksPrivacy: 'Yes' as string,
  });
  const [recommendedProduct, setRecommendedProduct] = useState<typeof PRODUCTS.MINOR_CHILD | null>(null);
  const [showResult, setShowResult] = useState(false);

  const scrollToQuiz = () => {
    quizRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToPlans = () => {
    plansRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData({ ...formData, state: e.target.value });
  };

  const handleSelectChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const proceedToNextStep = (nextStep: number, product?: typeof PRODUCTS.MINOR_CHILD) => {
    if (product) {
      setRecommendedProduct(product);
      setShowResult(true);
      setCurrentStep(nextStep);
    } else {
      setCurrentStep(nextStep);
    }
  };

  const handleGetStarted = (product: typeof PRODUCTS.MINOR_CHILD) => {
    const formType = formData.isMarried === 'Yes' ? '2person' : 'solo';
    navigate(`/checkout?product=${product.id}&type=${formType}`);
  };

  const resetQuiz = () => {
    setCurrentStep(1);
    setShowResult(false);
    setRecommendedProduct(null);
    setFormData({
      ...formData,
      isMarried: 'Yes',
      planForDeath: 'Yes',
      ownsRealEstate: 'Yes',
      avoidProbate: 'Yes',
      assetsOver125k: 'Yes',
      hasMinorChildren: 'Yes',
      wantsIncapacityPlanning: 'Yes',
      needsAuthorityForOther: 'Yes',
      seeksPrivacy: 'Yes',
    });
  };

  const plans = [
    {
      id: 'minor-child',
      price: 'From $199',
      name: 'Minor Child-Centered Estate Plan',
      description: 'Create a will-based plan to appoint a Tutor for a minor child to act as a surrogate parent for you if something should ever happen to you.',
      link: '/minor-child-centered-estate-plan',
      formLink: '/checkout?product=606'
    },
    {
      id: 'poa',
      price: 'From $99',
      name: 'Power of Attorney Plan',
      description: 'The Power of Attorney Supplement to your estate plan is well suited for families with a young adult child or student, or with an aging parent or family member so you can help them.',
      link: '/power-of-attorney-plan',
      formLink: '/checkout?product=614'
    },
    {
      id: 'trust',
      price: 'From $399',
      name: 'Trust-Based Estate Plan',
      description: 'The Trust-Based Estate Plan includes a Revocable Living Trust, Pourover Will, Financial Power of Attorney, Medical Power of Attorney, as well as an Advance Healthcare Directive (a/k/a "Living Will").',
      link: '/trust-based-estate-plan',
      formLink: '/checkout?product=676'
    },
    {
      id: 'will',
      price: 'From $199',
      name: 'Will-Based Estate Plan',
      description: 'The Will-Based Estate Plan includes a Last Will and Testament, Financial Power of Attorney, Medical Power of Attorney, as well as an Advance Healthcare Directive (a/k/a "Living Will").',
      link: '/will-based-estate-plan',
      formLink: '/checkout?product=673'
    },
  ];

  return (
    <main className="estate-planning-page-main">
      {/* Hero Section with Inline Quiz */}
      <section className="epp-hero" ref={quizRef}>
        <div className="container">
          <div className="epp-hero-row">
            {/* Left side - Hero content */}
            <div className="epp-hero-content">
              <h1><strong>Easy</strong> <em className="text-blue">&</em> <strong>Affordable<br />Estate Planning</strong></h1>
              <p className="epp-hero-description">
                Protecting everything you own and everyone you love has never been so simple.
                Made in Louisiana for Louisiana. We are here to make your estate planning experience
                easy <em>and affordable</em> with plans starting at <strong>$99</strong>.
              </p>
              <p className="epp-lets-geaux">
                Let's <em className="text-blue">Geaux</em>! <img src="/img/fleur-de-lis.png" alt="" className="fleur-icon" />
              </p>
              <button onClick={scrollToPlans} className="btn btn-dark btn-lg">View All Plans <span>&#9662;</span></button>
            </div>

            {/* Right side - Quiz box */}
            <div className="epp-quiz-wrapper">
              <div className="epp-quiz-box">
              {!showResult && (
                <div className="epp-quiz-header">
                  <h4>Match me with the right plan!</h4>
                  <h6>Tell us about <em className="text-blue">yourself</em> and we'll match you with the right plan!</h6>
                </div>
              )}

              {/* Step 1: Choose Your State */}
              {currentStep === 1 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#1</span> <strong>Choose Your State</strong></h6>
                  <p className="step-description">
                    <em>If you spend time in more than one state, use the state where you are registered to vote,
                    or maintain a driver's license, or intend to return if you are temporarily residing in another state.</em>
                  </p>
                  <select
                    className="form-select"
                    value={formData.state}
                    onChange={handleStateChange}
                  >
                    {US_STATES.map((state) => (
                      <option key={state.value} value={state.value}>{state.label}</option>
                    ))}
                  </select>
                  {formData.state !== 'LA' && (
                    <div className="alert alert-warning mt-3">
                      GeauxPlans is only for Louisiana residents. Please utilize a different estate planning website, or contact GeauxPlans for a referral.
                    </div>
                  )}
                  <div className="epp-quiz-buttons">
                    <button
                      className="btn btn-solid"
                      onClick={() => proceedToNextStep(2)}
                      disabled={formData.state !== 'LA'}
                    >
                      Proceed
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Are you married? */}
              {currentStep === 2 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#2</span> <strong>Are you married?</strong></h6>
                  <select
                    className="form-select"
                    value={formData.isMarried}
                    onChange={(e) => handleSelectChange('isMarried', e.target.value)}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <div className="epp-quiz-buttons">
                    <button className="btn btn-solid" onClick={() => proceedToNextStep(3)}>Proceed</button>
                  </div>
                </div>
              )}

              {/* Step 3: Plan for death? */}
              {currentStep === 3 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#3</span> <strong>Do you want to plan for what happens when you die?</strong></h6>
                  <p className="step-description">
                    <em>You get to decide who's in control after you die, who gets your assets, and when, as well as who cares for children, etc.</em>
                  </p>
                  <select
                    className="form-select"
                    value={formData.planForDeath}
                    onChange={(e) => handleSelectChange('planForDeath', e.target.value)}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <div className="epp-quiz-buttons">
                    <button
                      className="btn btn-solid"
                      onClick={() => proceedToNextStep(formData.planForDeath === 'Yes' ? 4 : 10)}
                    >
                      Proceed
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Own real estate in Louisiana? (if planning for death) */}
              {currentStep === 4 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#4</span> <strong>Do you own any real estate in the state of Louisiana?</strong></h6>
                  <select
                    className="form-select"
                    value={formData.ownsRealEstate}
                    onChange={(e) => handleSelectChange('ownsRealEstate', e.target.value)}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <div className="epp-quiz-buttons">
                    <button
                      className="btn btn-solid"
                      onClick={() => proceedToNextStep(formData.ownsRealEstate === 'Yes' ? 5 : 6)}
                    >
                      Proceed
                    </button>
                  </div>
                </div>
              )}

              {/* Step 5: Avoid probate with Living Trust? (if owns real estate) */}
              {currentStep === 5 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#5</span> <strong>OK, so probate will be required in Louisiana. It's a bit more work, but do you want to avoid the probate process by transferring your assets to a Living Trust?</strong></h6>
                  <p className="step-description">
                    <em>GeauxPlans can walk you through the process - step by step.</em>
                  </p>
                  <select
                    className="form-select"
                    value={formData.avoidProbate}
                    onChange={(e) => handleSelectChange('avoidProbate', e.target.value)}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <div className="epp-quiz-buttons">
                    <button
                      className="btn btn-solid"
                      onClick={() => {
                        if (formData.avoidProbate === 'Yes') {
                          proceedToNextStep(100, PRODUCTS.TRUST_BASED);
                        } else {
                          proceedToNextStep(7);
                        }
                      }}
                    >
                      Proceed
                    </button>
                  </div>
                </div>
              )}

              {/* Step 6: Assets over $125k? (if no real estate) */}
              {currentStep === 6 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#5</span> <strong>Do you own probate assets worth more than $125,000?</strong></h6>
                  <p className="step-description">
                    <em>Probate assets include property that passes by beneficiary designation or that isn't already in a trust.
                    Put another way, probate assets do not include life insurance or annuity proceeds (unless your estate is the beneficiary),
                    retirement assets, usufruct or life estate property, and other assets with named beneficiaries, such as pay on death accounts.</em>
                  </p>
                  <select
                    className="form-select"
                    value={formData.assetsOver125k}
                    onChange={(e) => handleSelectChange('assetsOver125k', e.target.value)}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <div className="epp-quiz-buttons">
                    <button
                      className="btn btn-solid"
                      onClick={() => {
                        if (formData.assetsOver125k === 'Yes') {
                          proceedToNextStep(100, PRODUCTS.TRUST_BASED);
                        } else {
                          proceedToNextStep(7);
                        }
                      }}
                    >
                      Proceed
                    </button>
                  </div>
                </div>
              )}

              {/* Step 7: Minor children? */}
              {currentStep === 7 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#6</span> <strong>Do you have any minor children?</strong></h6>
                  <p className="step-description">
                    <em>Include both biological and legally adopted children.</em>
                  </p>
                  <select
                    className="form-select"
                    value={formData.hasMinorChildren}
                    onChange={(e) => handleSelectChange('hasMinorChildren', e.target.value)}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <div className="epp-quiz-buttons">
                    <button
                      className="btn btn-solid"
                      onClick={() => {
                        if (formData.hasMinorChildren === 'Yes') {
                          proceedToNextStep(100, PRODUCTS.MINOR_CHILD);
                        } else {
                          proceedToNextStep(100, PRODUCTS.WILL_BASED);
                        }
                      }}
                    >
                      Proceed
                    </button>
                  </div>
                </div>
              )}

              {/* Step 10: Incapacity planning (if not planning for death) */}
              {currentStep === 10 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#4</span> <strong>If you lose capacity, do you want someone you trust to make financial or healthcare decisions for you?</strong></h6>
                  <p className="step-description"><em>Incapacity can result from any of the following:</em></p>
                  <div className="row mb-3">
                    <div className="col-md-4">
                      <ul className="simple-list">
                        <li>Accidents</li>
                        <li>Injuries</li>
                        <li>Medical conditions</li>
                      </ul>
                    </div>
                    <div className="col-md-8">
                      <ul className="simple-list">
                        <li>Degenerative diseases</li>
                        <li>Anything that can cause you from acting on your own behalf, whether temporarily or permanently</li>
                      </ul>
                    </div>
                  </div>
                  <p className="step-description">
                    <em>If something happens to you, someone should be able to make medical and financial decisions for you,
                    like taking care of bills and other financial obligations, consenting to medical procedures, making care arrangements,
                    and accessing protected health information.</em>
                  </p>
                  <select
                    className="form-select"
                    value={formData.wantsIncapacityPlanning}
                    onChange={(e) => handleSelectChange('wantsIncapacityPlanning', e.target.value)}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <div className="epp-quiz-buttons">
                    <button
                      className="btn btn-solid"
                      onClick={() => {
                        if (formData.wantsIncapacityPlanning === 'Yes') {
                          proceedToNextStep(100, PRODUCTS.POA_SUPPLEMENT);
                        } else {
                          proceedToNextStep(11);
                        }
                      }}
                    >
                      Proceed
                    </button>
                  </div>
                </div>
              )}

              {/* Step 11: Need authority for another person? */}
              {currentStep === 11 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#5</span> <strong>Do you need authority to make financial or medical decisions for another person?</strong></h6>
                  <p className="step-description">
                    <em>For example, a college student who is no longer a minor, or an elderly person (perhaps a parent) may need assistance with financial or medical decisions.</em>
                  </p>
                  <select
                    className="form-select"
                    value={formData.needsAuthorityForOther}
                    onChange={(e) => handleSelectChange('needsAuthorityForOther', e.target.value)}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <div className="epp-quiz-buttons">
                    <button
                      className="btn btn-solid"
                      onClick={() => {
                        if (formData.needsAuthorityForOther === 'Yes') {
                          proceedToNextStep(100, PRODUCTS.POA_SUPPLEMENT);
                        } else {
                          proceedToNextStep(12);
                        }
                      }}
                    >
                      Proceed
                    </button>
                  </div>
                </div>
              )}

              {/* Step 12: Seeks privacy? */}
              {currentStep === 12 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#6</span> <strong>Do you seek privacy or improved control of your assets during life?</strong></h6>
                  <p className="step-description"><em>For example, do you wish to:</em></p>
                  <ul className="simple-list mb-3">
                    <li>Minimize or avoid any public record or information about personal assets?</li>
                    <li>Shield any public information from creditors or predators?</li>
                    <li>Keep assets segregated as separate property in the event of a second marriage?</li>
                  </ul>
                  <select
                    className="form-select"
                    value={formData.seeksPrivacy}
                    onChange={(e) => handleSelectChange('seeksPrivacy', e.target.value)}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <div className="epp-quiz-buttons">
                    <button
                      className="btn btn-solid"
                      onClick={() => {
                        if (formData.seeksPrivacy === 'Yes') {
                          proceedToNextStep(100, PRODUCTS.TRUST_BASED);
                        } else {
                          proceedToNextStep(13);
                        }
                      }}
                    >
                      Proceed
                    </button>
                  </div>
                </div>
              )}

              {/* Step 13: Needs advice */}
              {currentStep === 13 && (
                <div className="epp-quiz-step">
                  <h6><span className="text-blue">#7</span> <strong>It sounds like you need some advice.</strong></h6>
                  <p className="step-description">
                    <em>GeauxPlans is owned and administered by an estate planning law firm. If you have questions or would like a complimentary consultation, please submit your inquiry.</em>
                  </p>
                  <div className="epp-quiz-buttons">
                    <a href="/contact" className="btn btn-solid">Submit Your Inquiry</a>
                    <button className="btn btn-outline ms-2" onClick={resetQuiz}>Start Over</button>
                  </div>
                </div>
              )}

              {/* Result Step */}
              {showResult && recommendedProduct && (
                <div className="epp-quiz-result">
                  <h4><span className="text-blue">Great news!</span> <strong>We've got you covered</strong></h4>
                  <h6>Based on <em className="text-blue">your responses</em>, this may be a good solution for you:</h6>

                  <div className="recommended-plan-card">
                    <h5>{recommendedProduct.name}</h5>
                    <p className="plan-price">${recommendedProduct.price}</p>
                    <button
                      className="btn btn-solid btn-lg w-100"
                      onClick={() => handleGetStarted(recommendedProduct)}
                    >
                      Get Started
                    </button>
                    <Link to={recommendedProduct.slug} className="read-more-link">
                      Read more about plan &rarr;
                    </Link>
                  </div>

                  <button className="btn btn-outline mt-3" onClick={resetQuiz}>Start Over</button>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* Process Section - 3 Steps */}
      <section className="epp-process">
        <div className="container">
          <div className="epp-process-header">
            <span className="process-label">Louisiana</span>
            <h2><strong>Estate Planning</strong></h2>
            <p className="process-subtitle">The simplest process</p>
            <p><em>Quick, affordable and can be completed in 3 easy steps!</em></p>
          </div>

          <div className="process-grid">
            <div className="process-step">
              <div className="step-number">#1</div>
              <p>Choose your Estate Plan among the available options and submit payment online</p>
            </div>
            <div className="process-step">
              <div className="step-number">#2</div>
              <p>Complete the GeauxPlans interview online. This should take no more than 30 minutes! That's it! It will be so easy and painless that you will wonder why you waited so long.</p>
            </div>
            <div className="process-step">
              <div className="step-number">#3</div>
              <p>Your responses will be electronically transmitted to GeauxPlans and assimilated into a series of estate planning documents.</p>
              <p className="step-note"><em>Your documents will be available for immediate download after you complete your questionnaire, or you may request professional printing and shipping at checkout.</em></p>
            </div>
          </div>

          <div className="text-center mt-4">
            <button onClick={scrollToQuiz} className="btn btn-solid">Help me choose the right plan</button>
          </div>
        </div>
      </section>

      {/* Plans Section */}
      <section className="epp-plans" ref={plansRef}>
        <div className="container">
          <h2 className="section-title">Simply, pick the plan that is right for you</h2>
          <p className="section-subtitle"><em>Practical, affordable, and complete solutions for every occasion</em></p>

          <div className="plans-grid">
            {plans.map((plan) => (
              <div key={plan.id} className="plan-card">
                <div className="plan-card-header">
                  <span className="plan-label">Estate Planning</span>
                  <h3 className="plan-name">{plan.name}</h3>
                </div>
                <div className="plan-card-body">
                  <p className="plan-description">{plan.description}</p>
                </div>
                <div className="plan-card-footer">
                  <Link to={plan.formLink} className="btn btn-solid">Start My Plan</Link>
                  <Link to={plan.link} className="btn btn-link">Learn More &rarr;</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="epp-about">
        <div className="container">
          <h3>Online Estate Planning Exclusively for Louisiana</h3>
          <p className="established">est. 2020</p>
          <p>
            Unlike other online sources, GeauxPlans is owned, administered, and supported by a Louisiana law firm.
          </p>
          <p>
            GeauxPlans documents are developed and continually enhanced by licensed Louisiana attorneys,
            including an estate planning and tax law specialist certified by the Louisiana State Board of Legal Specialization.
          </p>
          <div className="mt-4">
            <p><strong>Don't know what to choose?</strong></p>
            <p>We can help!</p>
            <p>Answer a few simple questions to find out which estate plan is right for your unique life situation.</p>
            <button onClick={scrollToQuiz} className="btn btn-outline">Take the quiz</button>
          </div>
        </div>
      </section>

      {/* Triple Guarantee Section */}
      <section className="epp-guarantee">
        <div className="container">
          <h2 className="section-title"><strong>Triple Guarantee</strong></h2>
          <p className="section-subtitle"><em>Practical, affordable, and complete solutions for every occasion</em></p>

          <div className="guarantee-grid">
            <div className="guarantee-item">
              <div className="guarantee-number">#1</div>
              <h4>Free Changes for 30 Days</h4>
              <p>Any changes to your GeauxPlan within the first thirty (30) days are free!</p>
            </div>
            <div className="guarantee-item">
              <div className="guarantee-number">#2</div>
              <h4>Free Estate Planning Strategy Session</h4>
              <p>You are entitled to a complimentary meeting with a Louisiana estate planning attorney to discuss any issues or concerns you may have regarding your estate plan within thirty (30) days after starting your GeauxPlan.</p>
            </div>
            <div className="guarantee-item">
              <div className="guarantee-number">#3</div>
              <h4>100% Credit of Your GeauxPlans Fee</h4>
              <p>You will receive a 100% credit of your GeauxPlan fee towards an attorney-prepared estate plan with an affiliated Louisiana estate planning law firm at any time within the first year, which means you can test drive your GeauxPlan for an entire year!</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default EstatePlanningPage;
