import React from 'react';
import { Link } from 'react-router-dom';

const LegalEdgePlan: React.FC = () => {
  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <h1 style={{ marginBottom: '20px' }}>Legal Edge Plan</h1>
            <p style={{ color: '#707070', fontSize: '18px' }}>
              Premium Membership with Benefits
            </p>
          </div>

          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            {/* Pricing Card */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '2px solid #004d71',
                borderRadius: '12px',
                padding: '40px',
                textAlign: 'center',
                marginBottom: '50px',
                boxShadow: '0 4px 15px rgba(0, 77, 113, 0.1)',
              }}
            >
              <h2 style={{ color: '#004d71', marginBottom: '10px' }}>Monthly Membership</h2>
              <div style={{ marginBottom: '30px' }}>
                <span style={{ fontSize: '24px', color: '#707070' }}>$</span>
                <span style={{ fontSize: '64px', fontWeight: 'bold', color: '#004d71' }}>29</span>
                <span style={{ fontSize: '24px', color: '#707070' }}>/month</span>
              </div>

              <div style={{ textAlign: 'left', maxWidth: '500px', margin: '0 auto 30px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                  }}
                >
                  <i className="fas fa-check-circle" style={{ color: '#28a745', fontSize: '24px', marginRight: '15px', marginTop: '3px' }}></i>
                  <div>
                    <strong style={{ fontSize: '16px' }}>Unlimited Revisions</strong>
                    <p style={{ color: '#707070', margin: '5px 0 0', fontSize: '14px' }}>
                      Make unlimited changes to your GeauxPlans documents at no additional cost
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                  }}
                >
                  <i className="fas fa-check-circle" style={{ color: '#28a745', fontSize: '24px', marginRight: '15px', marginTop: '3px' }}></i>
                  <div>
                    <strong style={{ fontSize: '16px' }}>100% Credit Toward Future Services</strong>
                    <p style={{ color: '#707070', margin: '5px 0 0', fontSize: '14px' }}>
                      Your base GeauxPlans fee is fully credited toward any future legal services
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '15px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                  }}
                >
                  <i className="fas fa-check-circle" style={{ color: '#28a745', fontSize: '24px', marginRight: '15px', marginTop: '3px' }}></i>
                  <div>
                    <strong style={{ fontSize: '16px' }}>Annual Check-Up Meeting</strong>
                    <p style={{ color: '#707070', margin: '5px 0 0', fontSize: '14px' }}>
                      Yearly consultation to review your estate plan and ensure it still meets your needs
                    </p>
                  </div>
                </div>
              </div>

              <Link to="/my-account" className="btn btn-primary btn-lg" style={{ padding: '15px 50px' }}>
                Become a Member
              </Link>
            </div>

            {/* Why Join Section */}
            <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>Why Join the Legal Edge Plan?</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '30px', marginBottom: '50px' }}>
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundColor: '#e8f4f8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                  }}
                >
                  <i className="fas fa-sync-alt" style={{ fontSize: '32px', color: '#004d71' }}></i>
                </div>
                <h3 style={{ marginBottom: '15px' }}>Life Changes</h3>
                <p style={{ color: '#707070' }}>
                  Marriage, divorce, births, deaths, and other life events may require updates to your estate plan.
                  With Legal Edge, you're always covered.
                </p>
              </div>

              <div style={{ textAlign: 'center', padding: '30px' }}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundColor: '#e8f4f8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                  }}
                >
                  <i className="fas fa-balance-scale" style={{ fontSize: '32px', color: '#004d71' }}></i>
                </div>
                <h3 style={{ marginBottom: '15px' }}>Law Changes</h3>
                <p style={{ color: '#707070' }}>
                  Tax laws and estate planning regulations change. Stay protected with documents that reflect
                  current legal requirements.
                </p>
              </div>

              <div style={{ textAlign: 'center', padding: '30px' }}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundColor: '#e8f4f8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                  }}
                >
                  <i className="fas fa-piggy-bank" style={{ fontSize: '32px', color: '#004d71' }}></i>
                </div>
                <h3 style={{ marginBottom: '15px' }}>Save Money</h3>
                <p style={{ color: '#707070' }}>
                  Individual revisions can be costly. Legal Edge membership provides unlimited revisions
                  for one low monthly fee.
                </p>
              </div>
            </div>

            {/* FAQ Section */}
            <div style={{ backgroundColor: '#f8f9fa', padding: '40px', borderRadius: '12px', marginBottom: '50px' }}>
              <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>Common Questions</h2>

              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ marginBottom: '10px' }}>Who is eligible for the Legal Edge Plan?</h4>
                <p style={{ color: '#707070' }}>
                  Any GeauxPlans customer who has purchased an estate plan is eligible to join the Legal Edge Plan.
                  The offer is available at checkout or can be added later through your account dashboard.
                </p>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ marginBottom: '10px' }}>Can I cancel my membership?</h4>
                <p style={{ color: '#707070' }}>
                  Yes, you can cancel your Legal Edge membership at any time. There are no long-term commitments
                  or cancellation fees.
                </p>
              </div>

              <div>
                <h4 style={{ marginBottom: '10px' }}>What counts as a revision?</h4>
                <p style={{ color: '#707070' }}>
                  Revisions include any changes to your existing estate planning documents, such as updating
                  beneficiaries, changing executors, or modifying trust terms. New document types may require
                  separate purchase.
                </p>
              </div>
            </div>

            {/* CTA Section */}
            <div style={{ textAlign: 'center', marginBottom: '50px' }}>
              <h2 style={{ marginBottom: '20px' }}>Ready to Get Started?</h2>
              <p style={{ color: '#707070', marginBottom: '30px' }}>
                Join the Legal Edge Plan today and enjoy peace of mind knowing your estate plan is always up to date.
              </p>
              <Link to="/shop" className="btn btn-primary btn-lg" style={{ marginRight: '15px' }}>
                Start Your Estate Plan
              </Link>
              <Link to="/contact" className="btn btn-white btn-lg" style={{ border: '1px solid #004d71' }}>
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default LegalEdgePlan;
