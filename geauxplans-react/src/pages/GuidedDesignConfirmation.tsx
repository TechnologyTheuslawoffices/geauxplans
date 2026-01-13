import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/confirmation-pages.css';

const GuidedDesignConfirmation: React.FC = () => {
  return (
    <main className="confirmation-page">
      <div className="container">
        <div className="confirmation-content">
          <div className="shield-icon">
            <img
              src="/wp-content/uploads/2020/11/shield.png"
              alt="GeauxPlans Shield"
            />
          </div>

          <h1>Your Guided Design Appointment is Confirmed!</h1>
          <h2>Check Your Inbox Now to Confirm Details</h2>
          <h3>(Now click the My Account link above to start your Interview!)</h3>

          <div className="confirmation-details">
            <p>
              We've sent a confirmation email to your inbox. Click the link inside that email
              to login to the design session at your scheduled time. You will need this to
              access your GeauxPlans design meeting! We will also send event reminders to you,
              so stay tuned.
            </p>

            <p><strong>See you soon!</strong></p>

            <p>In the meantime, please feel free to start your interview!</p>

            <p>
              To make the most of your 15 minutes of attorney time, we HIGHLY RECOMMEND that
              you enter all personal information into your GeauxPlans Questionnaire, including
              the name and contact information of everyone you intend to include in your estate
              planning documents.
            </p>

            <p>
              To start or continue your Questionnaire, click the My Account link, above, and
              select the appropriate Estate Planning or Business Planning tab.
            </p>
          </div>

          <div className="action-buttons">
            <Link to="/my-account" className="btn btn-primary btn-lg">
              Go to My Account
            </Link>
          </div>

          <div className="connect-section">
            <h2>Let's Connect</h2>
            <p>Connect with us on Facebook</p>
            <a
              href="https://www.facebook.com/GeauxPlans"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
            >
              <i className="fab fa-facebook-f"></i> GeauxPlans on Facebook
            </a>
          </div>
        </div>

        <div className="confirmation-footer">
          <img
            src="/wp-content/uploads/2021/12/GeauxPlansLogo-07-1024x168.png"
            alt="GeauxPlans Logo"
            className="footer-logo"
          />
          <p>Copyright &copy; GeauxPlans.com, L.L.C. All Rights Reserved.</p>
        </div>
      </div>
    </main>
  );
};

export default GuidedDesignConfirmation;
