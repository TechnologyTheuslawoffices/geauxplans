import React from 'react';

const PrivacyPolicy: React.FC = () => {
  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <h1 style={{ textAlign: 'center', marginBottom: '40px' }}>Privacy Policy</h1>

          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <p style={{ marginBottom: '20px', color: '#707070' }}>
              <em>Last updated: January 2024</em>
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Introduction</h2>
            <p style={{ marginBottom: '20px' }}>
              GeauxPlans ("we," "our," or "us") respects your privacy and is committed to protecting your personal
              information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information
              when you visit our website or use our services.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Information We Collect</h2>
            <p style={{ marginBottom: '15px' }}>We may collect information about you in a variety of ways, including:</p>
            <ul style={{ marginBottom: '20px', paddingLeft: '30px' }}>
              <li style={{ marginBottom: '10px' }}>
                <strong>Personal Data:</strong> Name, email address, phone number, mailing address, and other
                information you provide when creating an account or completing our interview process.
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong>Financial Information:</strong> Payment card details and billing information processed
                through secure third-party payment processors.
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong>Estate Planning Information:</strong> Information you provide during the estate planning
                interview, including family information, asset details, and beneficiary designations.
              </li>
            </ul>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>How We Use Your Information</h2>
            <p style={{ marginBottom: '15px' }}>We use the information we collect to:</p>
            <ul style={{ marginBottom: '20px', paddingLeft: '30px' }}>
              <li style={{ marginBottom: '10px' }}>Provide, operate, and maintain our services</li>
              <li style={{ marginBottom: '10px' }}>Process your transactions and send related information</li>
              <li style={{ marginBottom: '10px' }}>Prepare your estate planning documents</li>
              <li style={{ marginBottom: '10px' }}>Communicate with you about your account and our services</li>
              <li style={{ marginBottom: '10px' }}>Respond to your comments, questions, and requests</li>
              <li style={{ marginBottom: '10px' }}>Comply with legal obligations</li>
            </ul>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Information Security</h2>
            <p style={{ marginBottom: '20px' }}>
              We implement appropriate technical and organizational security measures designed to protect the security
              of any personal information we process. However, please note that no electronic transmission or storage
              of information can be guaranteed to be 100% secure.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Attorney-Client Privilege</h2>
            <p style={{ marginBottom: '20px' }}>
              Information shared with GeauxPlans in connection with the preparation of estate planning documents may
              be protected by attorney-client privilege. We maintain the confidentiality of all such communications
              in accordance with applicable professional responsibility rules.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Third-Party Services</h2>
            <p style={{ marginBottom: '20px' }}>
              We may use third-party service providers to help us operate our business and provide our services.
              These third parties have access to your personal information only to perform specific tasks on our
              behalf and are obligated not to disclose or use your information for any other purpose.
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Your Rights</h2>
            <p style={{ marginBottom: '15px' }}>You have the right to:</p>
            <ul style={{ marginBottom: '20px', paddingLeft: '30px' }}>
              <li style={{ marginBottom: '10px' }}>Access the personal information we hold about you</li>
              <li style={{ marginBottom: '10px' }}>Request correction of inaccurate information</li>
              <li style={{ marginBottom: '10px' }}>Request deletion of your personal information</li>
              <li style={{ marginBottom: '10px' }}>Opt out of marketing communications</li>
            </ul>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Contact Us</h2>
            <p style={{ marginBottom: '20px' }}>
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <p style={{ marginBottom: '10px' }}>
              <strong>Phone:</strong> +1 (855) 213-6300
            </p>
            <p style={{ marginBottom: '10px' }}>
              <strong>Hours:</strong> Monday - Friday, 8:00 AM - 5:00 PM CST
            </p>

            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>Changes to This Policy</h2>
            <p style={{ marginBottom: '20px' }}>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting
              the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default PrivacyPolicy;
