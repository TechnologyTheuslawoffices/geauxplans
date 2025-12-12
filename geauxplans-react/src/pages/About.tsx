import React from 'react';
import { Link } from 'react-router-dom';

const About: React.FC = () => {
  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <h1 style={{ textAlign: 'center', marginBottom: '40px' }}>About GeauxPlans</h1>

          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <p style={{ marginBottom: '25px', fontSize: '18px' }}>
              GeauxPlans&trade; is a revolutionary platform designed exclusively for residents of the Bayou State.
              Unlike other online sources for simple estate planning documents, GeauxPlans is supported and operated
              by a Louisiana law firm specializing in estate, business and asset protection.
            </p>

            <h2 style={{ marginTop: '50px', marginBottom: '20px' }}>Why Choose GeauxPlans?</h2>

            <div style={{ marginBottom: '30px' }}>
              <h3>Made in Louisiana for Louisiana</h3>
              <p>
                Our documents are specifically designed to comply with Louisiana's unique legal requirements,
                which are based on the Napoleonic Code and differ significantly from other states.
              </p>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <h3>Attorney-Backed Documents</h3>
              <p>
                Every estate plan is reviewed by licensed Louisiana attorneys to ensure accuracy and
                compliance with state laws.
              </p>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <h3>Simple and Affordable</h3>
              <p>
                We've made estate planning accessible to everyone with our straightforward online interview
                process and competitive pricing.
              </p>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <h3>Secure and Confidential</h3>
              <p>
                Your personal information is protected with industry-standard security measures, and all
                communications are kept strictly confidential.
              </p>
            </div>

            <h2 style={{ marginTop: '50px', marginBottom: '20px' }}>About Theus Law Offices, L.L.C.</h2>
            <p style={{ marginBottom: '25px' }}>
              GeauxPlans is operated by Theus Law Offices, L.L.C., a Louisiana law firm with extensive
              experience in estate planning, business law, and asset protection. Our team of attorneys
              is dedicated to helping Louisiana families protect their assets and their loved ones.
            </p>

            <div style={{ textAlign: 'center', marginTop: '50px', marginBottom: '50px' }}>
              <Link to="/shop" className="btn btn-primary btn-lg">
                Start Your Estate Plan Today
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="louisiana-banner">
        <div className="container">
          <p><em>Made with love by Louisiana attorneys exclusively for Louisiana!</em></p>
        </div>
      </section>
    </main>
  );
};

export default About;
