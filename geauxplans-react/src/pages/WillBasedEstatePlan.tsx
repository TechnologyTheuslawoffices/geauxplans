import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/estate-plan-page.css';

const WillBasedEstatePlan: React.FC = () => {
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  const toggleDoc = (id: string) => {
    setExpandedDoc(expandedDoc === id ? null : id);
  };

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  return (
    <main className="estate-plan-page">
      {/* Hero Banner */}
      <section className="ep-hero">
        <div className="container">
          <div className="ep-hero-grid">
            <div className="ep-hero-content">
              <p className="ep-hero-subtitle"><em>Estate Planning in <strong>Louisiana</strong></em></p>
              <h1><em className="text-blue">Will-Based</em> <strong>Estate Plan</strong></h1>
              <p className="ep-hero-description">
                <em>Create a Will-Based Estate Plan in minutes to determine who will control your affairs during life, as well as your final wishes for the distribution of assets if something should ever happen to you. This plan is suitable for both single and married individuals with or without children.</em>
              </p>
              <div className="ep-hero-buttons pill-group">
                <Link to="/checkout?product=673" className="btn btn-pill-left">Start My Plan</Link>
                <Link to="/estate-planning" className="btn btn-pill-right">Is this plan right for me?</Link>
              </div>
            </div>
            <div className="ep-hero-image">
              <img src="/wp-content/uploads/2022/02/Will-Based-Estate-Plan-1024x683.jpg" alt="Will-Based Estate Plan" />
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
              <h2><strong><em>Build your</em></strong><br /><span className="text-blue"><em><strong>Will-Based Estate Plan</strong></em></span></h2>
              <Link to="/checkout?product=673" className="btn btn-solid btn-lg">Get Started</Link>
              <p className="guarantee-text"><em><strong>Money-Back Guarantee!</strong> If you are unsatisfied with your completed documents, contact us within 30-days of your purchase to request a refund under our Refund Policy.</em></p>
            </div>
            <div className="ep-documents">
              <div className="documents-header">
                <h2><strong>Included </strong><em className="text-blue">documents</em></h2>
                <p><em>Simply download or order mailing</em></p>
              </div>
              <div className="documents-accordion">
                <div className={`doc-item ${expandedDoc === 'will' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('will')}>
                    <span>Last Will and Testament</span>
                    <span className="toggle-icon">{expandedDoc === 'will' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>The centerpiece of your estate plan dictates your final wishes for the disposition of assets and arrangements.</p>
                  </div>
                </div>
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
                <li><i className="fas fa-check"></i> Decide who will control your affairs</li>
                <li><i className="fas fa-check"></i> Leave specific gifts of money, possessions, property, etc.</li>
                <li><i className="fas fa-check"></i> Decide when and how your assets will be distributed</li>
                <li><i className="fas fa-check"></i> Decide who will benefit from your estate</li>
                <li><i className="fas fa-check"></i> Exclude individuals from receiving assets</li>
                <li><i className="fas fa-check"></i> Designate a financial agent to make decisions about your property</li>
                <li><i className="fas fa-check"></i> Designate a medical agent to make healthcare decisions for you</li>
                <li><i className="fas fa-check"></i> Grant someone you trust access to critical medical records</li>
                <li><i className="fas fa-check"></i> Decide what happens in a medical emergency</li>
                <li><i className="fas fa-check"></i> Nominate Guardians or Tutors for minor children</li>
                <li><i className="fas fa-check"></i> Establish protective trusts for beneficiaries</li>
              </ul>
            </div>
            <div className="benefits-images">
              <img src="/wp-content/uploads/2022/02/Will-Based-Estate-Plan-1.jpg" alt="" />
              <img src="/wp-content/uploads/2022/02/Will-Based-Estate-Plan-2.jpg" alt="" />
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
                <div className={`faq-item ${expandedFaq === 'legal-edge' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleFaq('legal-edge')}>
                    <span>What's included in the <em>Legal Edge plan for $9.99/month</em>?</span>
                    <span className="toggle-icon">{expandedFaq === 'legal-edge' ? '−' : '+'}</span>
                  </button>
                  <div className="faq-answer">
                    <p><strong><em className="text-blue">Forever Revisions</em></strong><br />Unlimited revisions to your GeauxPlan at any time and for any reason!</p>
                    <p><strong><em className="text-blue">Anytime Upgrade to an Advanced Estate Plan</em></strong><br />Upgrade your GeauxPlan to an Advanced Estate Plan at any time and for any reason with an affiliated estate planning law firm and receive a 100% credit of your original GeauxPlans Fee!</p>
                    <p><strong><em className="text-blue">Maintenance for Life</em></strong><br />Any estate plan needs to be maintained, or eventually it may not work. Legal Edge Plan entitles you to an annual meeting with an affiliated estate planning law firm to review your GeauxPlan to make sure it still works for you - so you are "all set"!</p>
                    <Link to="/legal-edge-plan" className="btn btn-outline-blue btn-sm">Learn more about Legal Edge</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default WillBasedEstatePlan;
