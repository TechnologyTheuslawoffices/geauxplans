import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/estate-plan-page.css';

const PowerOfAttorneyPlan: React.FC = () => {
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [numPersons, setNumPersons] = useState<'1' | '2'>('1');
  const navigate = useNavigate();

  const toggleDoc = (id: string) => {
    setExpandedDoc(expandedDoc === id ? null : id);
  };

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  const getPrice = () => {
    return numPersons === '1' ? 99 : 149;
  };

  const handlePurchase = () => {
    // Product 614 = POA Plan
    const type = numPersons === '1' ? 'solo' : '2person';
    navigate(`/checkout?product=614&type=${type}`);
  };

  return (
    <main className="estate-plan-page">
      {/* Hero Banner */}
      <section className="ep-hero">
        <div className="container">
          <div className="ep-hero-grid">
            <div className="ep-hero-content">
              <p className="ep-hero-subtitle"><em>Estate Planning in <strong>Louisiana</strong></em></p>
              <h1>Power of Attorney<br /><em className="text-blue">Supplement</em> <strong>Plan</strong></h1>
              <p className="ep-hero-description">
                <em>Create Power of Attorney documents for your college student or aging family members to handle financial and healthcare decisions. This plan provides essential incapacity planning without a full estate plan.</em>
              </p>
              <div className="ep-hero-buttons pill-group">
                <button onClick={() => setShowPurchaseModal(true)} className="btn btn-pill-left">Start My Plan</button>
                <Link to="/estate-planning" className="btn btn-pill-right">Is this plan right for me?</Link>
              </div>
            </div>
            <div className="ep-hero-image">
              <img src="/img/power-of-attorney-banner.jpg" alt="Power of Attorney Supplement Plan" />
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="ep-process">
        <div className="container">
          <h2 className="section-title"><strong>The </strong><em className="text-blue">simplest</em><strong> process</strong></h2>
          <p className="section-subtitle"><em>Three easy steps and everything is online</em></p>
          <div className="process-grid">
            <div className="process-step">
              <h3><em className="text-blue">#1</em> <strong>Answer a few easy questions</strong></h3>
              <p><em>Create your documents by answering questions that will allow you to tailor your documents to suit your specific needs.</em></p>
            </div>
            <div className="process-step">
              <h3><em className="text-blue">#2</em> <strong>Download or ship documents</strong></h3>
              <p><em>Download your documents from your private account dashboard, or request shipping at checkout.</em></p>
            </div>
            <div className="process-step">
              <h3><em className="text-blue">#3</em> <strong>Sign documents at your convenience</strong></h3>
              <p><em>Follow specific instructions to finalize your documents with a notary and two witnesses to make them legally binding.</em></p>
            </div>
          </div>
        </div>
      </section>

      {/* Build Plan Section */}
      <section className="ep-build-section">
        <div className="container">
          <div className="ep-build-grid">
            <div className="ep-build-card">
              <h2><strong><em>Build your</em></strong><br /><span className="text-blue"><em><strong>Power of Attorney Supplement Plan</strong></em></span></h2>
              <button onClick={() => setShowPurchaseModal(true)} className="btn btn-solid btn-lg">Get Started</button>
              <p className="guarantee-text"><em><strong>Money-Back Guarantee!</strong> If you are unsatisfied with your completed documents, contact us within 30-days of your purchase to request a refund under our Refund Policy.</em></p>
            </div>
            <div className="ep-documents">
              <div className="documents-header">
                <h2><strong>Included </strong><em className="text-blue">documents</em></h2>
                <p><em>Simply download or order mailing</em></p>
              </div>
              <div className="documents-accordion">
                <div className={`doc-item ${expandedDoc === 'financial-poa' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('financial-poa')}>
                    <span>Durable Financial Power of Attorney</span>
                    <span className="toggle-icon">{expandedDoc === 'financial-poa' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>Appoint someone you know and trust to manage assets and make financial decisions for you if you become incapacitated or are unavailable.</p>
                  </div>
                </div>
                <div className={`doc-item ${expandedDoc === 'medical-poa' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('medical-poa')}>
                    <span>Durable Medical Power of Attorney</span>
                    <span className="toggle-icon">{expandedDoc === 'medical-poa' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>Appoint someone you know and trust to make medical decisions for you if you become incapacitated or are unavailable.</p>
                  </div>
                </div>
                <div className={`doc-item ${expandedDoc === 'living-will' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('living-will')}>
                    <span>Advance Healthcare Directive (a/k/a Living Will)</span>
                    <span className="toggle-icon">{expandedDoc === 'living-will' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>State your wishes in advance regarding what types of medical life support measures you prefer if you cannot express your preferences yourself.</p>
                  </div>
                </div>
                <div className={`doc-item ${expandedDoc === 'hipaa' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('hipaa')}>
                    <span>HIPAA Release</span>
                    <span className="toggle-icon">{expandedDoc === 'hipaa' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>Authorize someone to access your Protected Health Information for quick assistance or decisions if you become incapacitated.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="ep-benefits">
        <div className="container">
          <div className="benefits-grid">
            <div className="benefits-content">
              <h2><strong>Premium </strong><em className="text-blue">benefits</em></h2>
              <p className="benefits-subtitle"><em>Practical, affordable, and complete solutions for you</em></p>
              <ul className="benefits-list">
                <li><i className="fas fa-check"></i> Perfect for college students heading off to school</li>
                <li><i className="fas fa-check"></i> Essential for aging parents or family members</li>
                <li><i className="fas fa-check"></i> Designate a financial agent to make decisions about your property</li>
                <li><i className="fas fa-check"></i> Designate a medical agent to make healthcare decisions for you</li>
                <li><i className="fas fa-check"></i> Grant someone you trust access to critical medical records</li>
                <li><i className="fas fa-check"></i> Decide what happens in a medical emergency</li>
                <li><i className="fas fa-check"></i> Affordable incapacity planning without a full estate plan</li>
              </ul>
            </div>
            <div className="benefits-images">
              <img src="/wp-content/uploads/2022/02/Power-of-Attorney-1.jpg" alt="" />
              <img src="/wp-content/uploads/2022/02/Power-of-Attorney-2.jpg" alt="" />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ and Contact Section */}
      <section className="ep-faq-contact">
        <div className="container">
          <div className="faq-contact-grid">
            <div className="contact-card">
              <h2>What if I have another question?</h2>
              <p><strong>Support team:</strong> M-F, 8am-5pm CST<br /><strong>Call us:</strong> +1 (855) 213-6300</p>
              <Link to="/contact" className="btn btn-secondary">Drop us a message</Link>
            </div>
            <div className="faq-content">
              <h2><strong>Common </strong><em className="text-blue">questions</em></h2>
              <p className="faq-subtitle"><em>Practical, affordable, and complete solutions for you</em></p>
              <div className="faq-accordion">
                <div className={`faq-item ${expandedFaq === 'handle' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleFaq('handle')}>
                    <span>Can I really handle documents myself?</span>
                    <span className="toggle-icon">{expandedFaq === 'handle' ? '−' : '+'}</span>
                  </button>
                  <div className="faq-answer">
                    <p><strong><span className="text-blue">Yes</span>, but you need to understand:</strong> You answer the questions and submit responses when complete. Your documents will be prepared and delivered to you within three (3) business days. Your responses will not be reviewed by anyone.</p>
                  </div>
                </div>
                <div className={`faq-item ${expandedFaq === 'who-needs' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleFaq('who-needs')}>
                    <span>Who needs a Power of Attorney Supplement Plan?</span>
                    <span className="toggle-icon">{expandedFaq === 'who-needs' ? '−' : '+'}</span>
                  </button>
                  <div className="faq-answer">
                    <p>This plan is perfect for:</p>
                    <p><strong>College Students:</strong> When your child turns 18, you no longer have automatic legal authority to make decisions for them. A POA ensures you can help if needed.</p>
                    <p><strong>Aging Parents:</strong> Help ensure your parents have designated trusted individuals to manage their affairs if they become incapacitated.</p>
                    <p><strong>Anyone who wants basic incapacity planning</strong> without needing a full estate plan.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <div className="modal-overlay" onClick={() => setShowPurchaseModal(false)}>
          <div className="modal-content purchase-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPurchaseModal(false)}>&times;</button>

            <div className="text-center mb-4">
              <img
                src="https://geauxplans.com/wp-content/uploads/2022/01/Plan-Builder-Icon.png"
                alt="Plan Builder"
                style={{ width: '48px', marginBottom: '20px' }}
              />
              <h2 style={{ color: '#0000ff' }}>Power of Attorney Plan</h2>
              <p className="text-muted fst-italic">
                Create durable powers of attorney and other important documents for your college student, an aging parent, or any other person you need to assist if something happens.
              </p>
              <p className="mb-4">Average time to build a plan: <strong style={{ color: '#0000ff' }}>5 minutes</strong></p>
            </div>

            <h4 className="mb-3">Build your plan</h4>
            <p className="text-muted fst-italic mb-4">
              After the purchase at your convenience, you will answer a series of questions to prepare your documents.
            </p>

            <div className="mb-3">
              <label className="form-label"><strong>1.</strong> For how many people do you want to prepare documents?</label>
              <select
                className="form-select"
                value={numPersons}
                onChange={(e) => setNumPersons(e.target.value as '1' | '2')}
              >
                <option value="1">For one person</option>
                <option value="2">For two people</option>
              </select>
            </div>

            <div className="mb-4">
              <p className="text-muted fst-italic">
                <strong>2.</strong> Would you like to subscribe to the <a href="/legal-edge-plan" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Legal Edge Plan</a> for $9.99/month to be protected from any mistakes?
              </p>
            </div>

            <div className="mb-4">
              <strong>Final Price:</strong> <strong style={{ fontSize: '1.25rem' }}>${getPrice()}</strong>
            </div>

            <button
              onClick={handlePurchase}
              className="btn btn-solid btn-lg w-100"
            >
              Purchase
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default PowerOfAttorneyPlan;
