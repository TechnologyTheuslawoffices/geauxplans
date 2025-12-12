import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-brand">
            <strong>GeauxPlans&trade;</strong>
            <small>&copy; COPYRIGHT 2020 - {currentYear}</small>
          </div>
          <nav>
            <ul className="footer-nav">
              <li><Link to="/privacy-policy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
            </ul>
          </nav>
          <div className="footer-contact">
            <strong>Support team:</strong> M-F, 8am-5pm CST | <strong>Call us:</strong> +1 (855) 213-6300
          </div>
          <div className="social-links">
            <a href="https://www.facebook.com/GeauxPlans" target="_blank" rel="noopener noreferrer">
              <i className="fab fa-facebook"></i>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
