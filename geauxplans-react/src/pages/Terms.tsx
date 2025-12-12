import React from 'react';

const Terms: React.FC = () => {
  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <h1 style={{ textAlign: 'center', marginBottom: '40px' }}>Terms of Service</h1>

          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <p style={{ marginBottom: '20px', color: '#707070' }}>
              <em>Last updated: January 2024</em>
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Agreement to Terms</h2>
            <p style={{ marginBottom: '20px' }}>
              By accessing or using GeauxPlans services, you agree to be bound by these Terms of Service. If you
              do not agree to these terms, please do not use our services.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Description of Services</h2>
            <p style={{ marginBottom: '20px' }}>
              GeauxPlans provides online estate planning document preparation services for Louisiana residents.
              Our services include the preparation of wills, trusts, powers of attorney, and other estate planning
              documents based on information you provide through our online interview process.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Louisiana-Specific Services</h2>
            <p style={{ marginBottom: '20px' }}>
              Our services are designed specifically for Louisiana residents and are based on Louisiana law.
              Louisiana has unique legal requirements based on the Napoleonic Code that differ from other states.
              Do not use GeauxPlans if you are not a Louisiana resident or if your primary residence is outside
              of Louisiana.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Legal Services Disclaimer</h2>
            <p style={{ marginBottom: '20px' }}>
              GeauxPlans is operated by Theus Law Offices, L.L.C., a Louisiana law firm. However, the use of our
              online document preparation services does not create an attorney-client relationship unless you
              specifically engage our firm for additional legal services.
            </p>
            <p style={{ marginBottom: '20px' }}>
              The documents prepared through GeauxPlans are based on the information you provide. You are
              responsible for the accuracy and completeness of that information.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>User Responsibilities</h2>
            <p style={{ marginBottom: '15px' }}>By using our services, you agree to:</p>
            <ul style={{ marginBottom: '20px', paddingLeft: '30px' }}>
              <li style={{ marginBottom: '10px' }}>Provide accurate and complete information</li>
              <li style={{ marginBottom: '10px' }}>Be a Louisiana resident</li>
              <li style={{ marginBottom: '10px' }}>Be at least 18 years of age</li>
              <li style={{ marginBottom: '10px' }}>Have the legal capacity to enter into contracts</li>
              <li style={{ marginBottom: '10px' }}>Keep your account credentials secure</li>
              <li style={{ marginBottom: '10px' }}>Review your documents carefully before signing</li>
            </ul>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Payment Terms</h2>
            <p style={{ marginBottom: '20px' }}>
              All fees for our services are due at the time of purchase. Prices are subject to change without notice.
              Refunds may be available in certain circumstances as described in our refund policy.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Document Execution</h2>
            <p style={{ marginBottom: '20px' }}>
              Estate planning documents must be properly executed (signed) to be legally valid. GeauxPlans provides
              detailed instructions for executing your documents. You are responsible for following these instructions
              and ensuring your documents are properly witnessed and notarized as required by Louisiana law.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Limitation of Liability</h2>
            <p style={{ marginBottom: '20px' }}>
              GeauxPlans and Theus Law Offices, L.L.C. shall not be liable for any damages arising from your use
              of our services, including but not limited to errors in information you provide, failure to properly
              execute documents, or changes in your circumstances after document preparation.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Intellectual Property</h2>
            <p style={{ marginBottom: '20px' }}>
              All content on this website, including text, graphics, logos, and software, is the property of
              GeauxPlans or its content suppliers and is protected by copyright and trademark laws.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Governing Law</h2>
            <p style={{ marginBottom: '20px' }}>
              These Terms of Service shall be governed by and construed in accordance with the laws of the
              State of Louisiana. Any disputes arising from these terms shall be resolved in the courts of Louisiana.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Changes to Terms</h2>
            <p style={{ marginBottom: '20px' }}>
              We reserve the right to modify these Terms of Service at any time. Changes will be effective
              immediately upon posting to this page. Your continued use of our services after any changes
              indicates your acceptance of the modified terms.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Contact Information</h2>
            <p style={{ marginBottom: '20px' }}>
              If you have questions about these Terms of Service, please contact us:
            </p>
            <p style={{ marginBottom: '10px' }}>
              <strong>Phone:</strong> +1 (855) 213-6300
            </p>
            <p style={{ marginBottom: '10px' }}>
              <strong>Hours:</strong> Monday - Friday, 8:00 AM - 5:00 PM CST
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Terms;
