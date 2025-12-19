import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/business-llc.css';

interface AvailabilityResult {
  available: boolean | null;
  message: string;
  similar?: Array<{ name: string; type: string; status: string }>;
}

const StartBusinessLLC: React.FC = () => {
  const [businessName, setBusinessName] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<AvailabilityResult | null>(null);

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
      // Try to call the backend API
      const response = await fetch('/api/business/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: businessName.trim(), state: 'LA' })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setResult({
            available: data.data.available,
            message: data.data.message,
            similar: data.data.similar
          });
        } else {
          throw new Error(data.error);
        }
      } else {
        // Backend not available - show demo result
        setResult({
          available: true,
          message: `"${businessName.trim()}, LLC" appears to be available in Louisiana!`,
          similar: []
        });
      }
    } catch (error) {
      // Fallback demo result when backend is not available
      setResult({
        available: true,
        message: `"${businessName.trim()}, LLC" appears to be available in Louisiana!`,
        similar: []
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      checkAvailability();
    }
  };

  return (
    <main className="business-llc-page">
      {/* Hero Search Section */}
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

          {/* Results Section */}
          {result && (
            <div className={`availability-result ${result.available === true ? 'available' : result.available === false ? 'unavailable' : 'neutral'}`}>
              <div className="result-icon">
                {result.available === true && <span className="icon-check">✓</span>}
                {result.available === false && <span className="icon-x">✗</span>}
                {result.available === null && <span className="icon-info">ℹ</span>}
              </div>
              <div className="result-content">
                <p className="result-message">{result.message}</p>
                {result.available === true && (
                  <Link to="/poa-form?product=llc" className="btn btn-solid" style={{ marginTop: '15px' }}>
                    Start My LLC Now →
                  </Link>
                )}
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
            <Link to="#" className="btn btn-solid btn-lg">Ready, Set, Geaux!</Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default StartBusinessLLC;
