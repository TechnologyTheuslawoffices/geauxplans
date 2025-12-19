import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/legal-edge-plan.css';

const LegalEdgePlan: React.FC = () => {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setExpandedItem(expandedItem === id ? null : id);
  };

  return (
    <main className="legal-edge-page">
      {/* Main Content Section */}
      <section className="lep-main-section">
        <div className="container">
          <div className="lep-grid">
            {/* Left Card - Legal Edge Plan Details */}
            <div className="lep-card">
              <h1><strong><em>Legal Edge Plan</em></strong></h1>
              <p className="lep-subtitle">Protect your GeauxPlan for life just for $9.99/month</p>

              <div className="lep-icon">
                <img src="/wp-content/uploads/2022/02/Legal-Edge-Plan-Icon.jpg" alt="Legal Edge Plan" />
              </div>

              <div className="lep-features">
                <p>
                  <strong><em className="text-blue">Forever Revisions</em></strong><br />
                  Unlimited revisions to your GeauxPlan at any time and for any reason!
                </p>
                <p>
                  <strong><em className="text-blue">Anytime Upgrade to an Advanced Estate Plan</em></strong><br />
                  Upgrade your GeauxPlan to an Advanced Estate Plan <em>at any time and for any reason</em> with an affiliated estate planning law firm and receive a 100% credit of your original GeauxPlans Fee!
                </p>
                <p>
                  <strong><em className="text-blue">Maintenance for Life</em></strong><br />
                  Any estate plan needs to be maintained, or eventually it may not work. Legal Edge Plan entitles you to an annual meeting with an affiliated estate planning law firm to review your GeauxPlan to make sure it still works for you - so you are "all set"!
                </p>
              </div>

              <Link to="/shop" className="btn btn-solid btn-lg">Subscribe Now - $9.99/month</Link>
              <p className="cancel-text"><em>You may cancel anytime.</em></p>
            </div>

            {/* Right Column - Life Happens */}
            <div className="lep-content">
              <h2><strong className="text-blue">Life happens!</strong></h2>
              <h3><em>Circumstances change and so do estate planning needs.</em></h3>

              <p className="lep-description">
                The Legal Edge Plan allows upgrading to an Advanced Estate Plan and applies a full (100%) credit of your original GeauxPlan fee toward the upgrade with an affiliated estate planning law firm!
              </p>
              <p className="lep-description">
                Protect your investment with the Legal Edge Plan!
              </p>
              <p className="lep-description">
                The following are some instances that may warrant upgrading to an Advanced Estate Plan:
              </p>

              <div className="lep-accordion">
                <div className={`lep-item ${expandedItem === 'asset' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleItem('asset')}>
                    <span>Lifetime Asset Protection</span>
                    <span className="toggle-icon">{expandedItem === 'asset' ? '−' : '+'}</span>
                  </button>
                  <div className="lep-answer">
                    <p>You seek lifetime asset protection from future creditors, lawsuits, unforeseeable liabilities, or nursing home poverty.</p>
                  </div>
                </div>

                <div className={`lep-item ${expandedItem === 'nursing' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleItem('nursing')}>
                    <span>Nursing Home Poverty</span>
                    <span className="toggle-icon">{expandedItem === 'nursing' ? '−' : '+'}</span>
                  </button>
                  <div className="lep-answer">
                    <p>You or a loved one is likely to need assisted living or long-term care, or you may lose a spouse soon due to a terminal illness.</p>
                  </div>
                </div>

                <div className={`lep-item ${expandedItem === 'spouse' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleItem('spouse')}>
                    <span>Disagreement with Spouse</span>
                    <span className="toggle-icon">{expandedItem === 'spouse' ? '−' : '+'}</span>
                  </button>
                  <div className="lep-answer">
                    <p>You do not agree with your spouse on the plans he or she wants.</p>
                  </div>
                </div>

                <div className={`lep-item ${expandedItem === 'remarriage' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleItem('remarriage')}>
                    <span>Restrictions Upon Remarriage or Co-Habitation</span>
                    <span className="toggle-icon">{expandedItem === 'remarriage' ? '−' : '+'}</span>
                  </button>
                  <div className="lep-answer">
                    <p>You have concerns about your spouse remarrying or partnering up after you die and diverting your assets to someone you do not wish to include in your estate plan, such as a future spouse or life-partner.</p>
                  </div>
                </div>

                <div className={`lep-item ${expandedItem === 'special' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleItem('special')}>
                    <span>Special Needs Beneficiary</span>
                    <span className="toggle-icon">{expandedItem === 'special' ? '−' : '+'}</span>
                  </button>
                  <div className="lep-answer">
                    <p>You have a beneficiary that is disabled or has special needs.</p>
                  </div>
                </div>

                <div className={`lep-item ${expandedItem === 'problem' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleItem('problem')}>
                    <span>Problem Child</span>
                    <span className="toggle-icon">{expandedItem === 'problem' ? '−' : '+'}</span>
                  </button>
                  <div className="lep-answer">
                    <p>You have a beneficiary who is unable to manage money, has a high risk of being sued, is in a bad marriage, has creditor issues, abuses drugs or alcohol, is likely to need long-term care in the future, is currently receiving need-based governmental benefits such as Medicaid.</p>
                  </div>
                </div>

                <div className={`lep-item ${expandedItem === 'tax' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleItem('tax')}>
                    <span>Federal Estate Tax Planning</span>
                    <span className="toggle-icon">{expandedItem === 'tax' ? '−' : '+'}</span>
                  </button>
                  <div className="lep-answer">
                    <p>Your assets exceed the current Federal estate tax exemption, which is $12.06 million per person (as of January 1, 2022), subject to any future amendments, modifications, or indexing after January 1, 2022.</p>
                  </div>
                </div>

                <div className={`lep-item ${expandedItem === 'nextgen' ? 'expanded' : ''}`}>
                  <button onClick={() => toggleItem('nextgen')}>
                    <span>Next Generation Asset Protection</span>
                    <span className="toggle-icon">{expandedItem === 'nextgen' ? '−' : '+'}</span>
                  </button>
                  <div className="lep-answer">
                    <p>You need a protective trust for your spouse, children, grandchildren, or other heirs to provide continuing asset protection rather than staged outright distributions.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="lep-contact-section">
        <div className="container">
          <h2><strong>Do you have </strong><em className="text-blue">any</em><strong> questions?</strong></h2>
          <div className="lep-contact-grid">
            <div className="lep-contact-info">
              <p><strong>Support team:</strong> M-F, 8am-5pm CST<br /><strong>Call us:</strong> +1 (855) 213-6300</p>
            </div>
            <div className="lep-contact-btn">
              <Link to="/contact" className="btn btn-solid">Drop us a message</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default LegalEdgePlan;
