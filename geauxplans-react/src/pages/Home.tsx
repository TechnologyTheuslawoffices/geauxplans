import React from 'react';
import { Link } from 'react-router-dom';

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
              <div className="hero-image-wrapper">
                <img src="/img/welcome.svg" alt="" className="hero-swoosh" />
                <img
                  src="https://images.unsplash.com/photo-1609220136736-443140cffec6?w=600&h=600&fit=crop"
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
