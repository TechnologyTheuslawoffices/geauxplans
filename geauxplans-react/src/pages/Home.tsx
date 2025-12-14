import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/estate-planning.css';

const Home: React.FC = () => {
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
              <div className="hero-buttons">
                <Link to="/estate-planning" className="btn btn-solid">Estate Plans</Link>
                <Link to="/business-planning" className="btn btn_geaux">Business Planning</Link>
              </div>
            </div>
            <div className="hero-image">
              <img
                src="/img/Estate-and-Business-Planning-Louisiana.png"
                alt="Estate and Business Planning Louisiana"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Hello Section */}
      <section className="hello-section">
        <div className="container">
          <div className="hello-grid">
            <div className="hello-title">
              <h2>hello<span className="text-blue">.</span></h2>
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
              <h2>Easy &amp; Affordable<br /><span className="text-blue">Estate Planning</span></h2>
              <p className="ep-landing-subtitle">Not sure where to start?</p>
              <p>Tell us about yourself and we'll match you with the right plan!</p>
              <Link to="/estate-planning" className="btn btn-solid btn-lg">Take the quiz</Link>
            </div>
            <div className="ep-landing-plans">
              <ul className="plan-list">
                <li><Link to="/minor-child-centered-estate-plan">Minor Child-Centered Estate Plan</Link></li>
                <li><Link to="/power-of-attorney-plan">Power of Attorney Supplement Plan</Link></li>
                <li><Link to="/will-based-estate-plan">Will-Based Estate Plan</Link></li>
                <li><Link to="/trust-based-estate-plan">Trust-Based Estate Plan</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="container">
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <img src="/img/protection.svg" alt="Protection" />
              </div>
              <h4>Estate Planning</h4>
              <p>Protect your family and assets with comprehensive estate planning documents.</p>
              <Link to="/estate-planning" className="btn btn_geaux">Learn More</Link>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <img src="/img/graduation.svg" alt="Education" />
              </div>
              <h4>Power of Attorney</h4>
              <p>Legal documents for your college student or aging family members.</p>
              <Link to="/poa-form" className="btn btn_geaux">Get Started</Link>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <img src="/img/pc.svg" alt="Business" />
              </div>
              <h4>Business Planning</h4>
              <p>Form your LLC, create operating agreements, and protect your business.</p>
              <Link to="/business-planning" className="btn btn_geaux">Learn More</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Louisiana Banner */}
      <section className="louisiana-banner">
        <div className="container">
          <p><em>Made with love by Louisiana attorneys exclusively for Louisiana!</em></p>
        </div>
      </section>
    </main>
  );
};

export default Home;
