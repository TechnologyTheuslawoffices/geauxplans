import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/business-llc.css';

const OperatingAgreementLLC: React.FC = () => {
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const toggleDoc = (id: string) => {
    setExpandedDoc(expandedDoc === id ? null : id);
  };

  return (
    <main className="business-llc-page">
      {/* Hero Section */}
      <section className="oa-hero">
        <div className="container">
          <div className="oa-hero-grid">
            <div className="oa-hero-content">
              <p className="oa-hero-subtitle"><em>Business Planning in <strong>Louisiana</strong></em></p>
              <h1><em className="text-blue">Operating Agreement</em><br /><strong>for LLC</strong></h1>
              <p className="oa-hero-description">
                <em>Create a customized Operating Agreement for your Louisiana LLC. Protect your business, define member roles, and establish clear guidelines for operations.</em>
              </p>
              <div className="oa-hero-buttons pill-group">
                <Link to="/poa-form?product=oa" className="btn btn-pill-left">Start My Agreement</Link>
                <Link to="/start-business-llc" className="btn btn-pill-right">Need to form an LLC first?</Link>
              </div>
            </div>
            <div className="oa-hero-image">
              <img src="/wp-content/uploads/2021/12/b2-2.jpg" alt="Operating Agreement" />
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="oa-process">
        <div className="container">
          <h2 className="section-title"><strong>The </strong><em className="text-blue">simplest</em><strong> process</strong></h2>
          <p className="section-subtitle"><em>Three easy steps and everything is online</em></p>
          <div className="process-grid">
            <div className="process-step">
              <h3><em className="text-blue">#1</em> <strong>Answer a few easy questions</strong></h3>
              <p><em>Create your Operating Agreement by answering questions that will allow you to tailor your document to suit your specific needs.</em></p>
            </div>
            <div className="process-step">
              <h3><em className="text-blue">#2</em> <strong>Download or ship documents</strong></h3>
              <p><em>Download your documents from your private account dashboard, or request shipping at checkout.</em></p>
            </div>
            <div className="process-step">
              <h3><em className="text-blue">#3</em> <strong>Sign and keep on file</strong></h3>
              <p><em>Follow specific instructions to finalize your Operating Agreement and keep it with your company records.</em></p>
            </div>
          </div>
        </div>
      </section>

      {/* Build Section */}
      <section className="oa-build-section">
        <div className="container">
          <div className="oa-build-grid">
            <div className="oa-build-card">
              <h2><strong><em>Build your</em></strong><br /><span className="text-blue"><em><strong>Operating Agreement</strong></em></span></h2>
              <Link to="/poa-form?product=oa" className="btn btn-solid btn-lg">Get Started</Link>
              <p className="guarantee-text"><em><strong>Money-Back Guarantee!</strong> If you are unsatisfied with your completed documents, contact us within 30-days of your purchase to request a refund under our Refund Policy.</em></p>
            </div>
            <div className="oa-documents">
              <div className="documents-header">
                <h2><strong>What's </strong><em className="text-blue">included</em></h2>
                <p><em>Comprehensive Operating Agreement coverage</em></p>
              </div>
              <div className="documents-accordion">
                <div className={`doc-item ${expandedDoc === 'formation' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('formation')}>
                    <span>Formation and Organization</span>
                    <span className="toggle-icon">{expandedDoc === 'formation' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>Details about the LLC's name, principal place of business, registered agent, and purpose.</p>
                  </div>
                </div>
                <div className={`doc-item ${expandedDoc === 'members' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('members')}>
                    <span>Members and Ownership</span>
                    <span className="toggle-icon">{expandedDoc === 'members' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>Defines membership interests, capital contributions, and ownership percentages for all members.</p>
                  </div>
                </div>
                <div className={`doc-item ${expandedDoc === 'management' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('management')}>
                    <span>Management Structure</span>
                    <span className="toggle-icon">{expandedDoc === 'management' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>Specifies whether the LLC is member-managed or manager-managed and outlines decision-making authority.</p>
                  </div>
                </div>
                <div className={`doc-item ${expandedDoc === 'distributions' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('distributions')}>
                    <span>Profits and Distributions</span>
                    <span className="toggle-icon">{expandedDoc === 'distributions' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>How profits and losses are allocated among members and when distributions will be made.</p>
                  </div>
                </div>
                <div className={`doc-item ${expandedDoc === 'transfer' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('transfer')}>
                    <span>Transfer of Interests</span>
                    <span className="toggle-icon">{expandedDoc === 'transfer' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>Rules governing the sale, transfer, or assignment of membership interests.</p>
                  </div>
                </div>
                <div className={`doc-item ${expandedDoc === 'dissolution' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleDoc('dissolution')}>
                    <span>Dissolution and Winding Up</span>
                    <span className="toggle-icon">{expandedDoc === 'dissolution' ? '−' : '+'}</span>
                  </button>
                  <div className="doc-content">
                    <p>Procedures for dissolving the LLC and distributing remaining assets to members.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="oa-benefits">
        <div className="container">
          <div className="benefits-grid">
            <div className="benefits-content">
              <h2><strong>Why you need an </strong><em className="text-blue">Operating Agreement</em></h2>
              <p className="benefits-subtitle"><em>Protect your business and define clear guidelines</em></p>
              <ul className="benefits-list">
                <li><i className="fas fa-check"></i> Establishes ownership structure and member roles</li>
                <li><i className="fas fa-check"></i> Protects your limited liability status</li>
                <li><i className="fas fa-check"></i> Prevents disputes between members</li>
                <li><i className="fas fa-check"></i> Defines profit and loss distribution</li>
                <li><i className="fas fa-check"></i> Sets rules for adding or removing members</li>
                <li><i className="fas fa-check"></i> Outlines decision-making procedures</li>
                <li><i className="fas fa-check"></i> Provides flexibility for tax elections</li>
                <li><i className="fas fa-check"></i> Creates a professional business structure</li>
              </ul>
            </div>
            <div className="benefits-images">
              <img src="/wp-content/uploads/2021/12/b1.jpg" alt="" />
              <img src="/wp-content/uploads/2021/12/b2-1.jpg" alt="" />
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="oa-contact-section">
        <div className="container">
          <h2><strong>Do you have </strong><em className="text-blue">any</em><strong> questions?</strong></h2>
          <div className="contact-grid">
            <div className="contact-info">
              <p><strong>Support team:</strong> M-F, 8am-5pm CST<br /><strong>Call us:</strong> +1 (855) 213-6300</p>
            </div>
            <div className="contact-btn">
              <Link to="/contact" className="btn btn-solid">Drop us a message</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default OperatingAgreementLLC;
