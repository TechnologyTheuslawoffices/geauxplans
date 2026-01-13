import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/confirmation-pages.css';

const ThankYouReservation: React.FC = () => {
  return (
    <main className="confirmation-page">
      <div className="container">
        <div className="confirmation-content">
          <div className="shield-icon">
            <Link to="/">
              <img
                src="/wp-content/uploads/2020/11/shield.png"
                alt="GeauxPlans Shield"
              />
            </Link>
          </div>

          <h1>Thank You For Your Reservation!</h1>
          <h2>Check Your Inbox Now to Confirm Your Email</h2>

          <div className="confirmation-details">
            <p>
              Click the link inside that confirmation email to login to the webinar at your
              scheduled time. You will need this to access the webinar! We will also send
              event reminders to you, so stay tuned.
            </p>

            <p><strong>See you at the webinar!</strong></p>
          </div>

          <div className="arrows-decoration">
            <img
              src="/wp-content/uploads/2021/12/arrows-300x281.png"
              alt=""
            />
          </div>

          <div className="gift-section">
            <img
              src="/wp-content/uploads/2021/12/Gift-600-x-600.png"
              alt="Gift"
              className="gift-image"
            />
            <p>Also, watch your inbox (and spam folder) for a complimentary gift!</p>
          </div>

          <div className="action-buttons">
            <Link to="/" className="btn btn-primary btn-lg">
              Check Our GeauxPlans!
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
          <Link to="/">
            <img
              src="/wp-content/uploads/2021/12/GeauxPlansLogo-07-1024x168.png"
              alt="GeauxPlans Logo"
              className="footer-logo"
            />
          </Link>
          <p>Copyright &copy; GeauxPlans.com, L.L.C. All Rights Reserved.</p>
        </div>
      </div>
    </main>
  );
};

export default ThankYouReservation;
