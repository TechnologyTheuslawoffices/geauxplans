import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <div className="bottom_line">
      <div className="container">
        <div className="d-flex align-items-center justify-content-between bottom_line_holder flex-wrap">
          <div className="footer-brand">
            <strong>GeauxPlans&trade;</strong><br />
            <small>&copy; COPYRIGHT 2020 - {currentYear}</small>
          </div>
          <div className="footer-links">
            <ul className="footer-menu list-reset">
              <li><Link to="/learn">Learn</Link></li>
              <li><Link to="/about">About &amp; Contacts</Link></li>
              {/* Keep the two legal links together so "Terms of Use" never
                  wraps onto its own line apart from "Privacy Policy". */}
              <li className="footer-legal">
                <Link to="/privacy-policy">Privacy Policy</Link>
                <Link to="/terms">Terms of Use</Link>
              </li>
            </ul>
          </div>
          {/* Support text and social links share a row so that on smaller
              screens they fall into two side-by-side columns rather than
              stacking into separate centered lines. */}
          <div className="footer-contact">
            <div className="footer-support">
              <strong>Support team:</strong> M-F, 8am-5pm CST <span className="d-none d-sm-inline">|</span>
              <span className="d-block d-sm-none"></span> <strong>Call us:</strong> +1 (855) 213-6300
            </div>
            <div className="footer-social">
              <a target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/GeauxPlans">
                <span className="icon-facebook">f</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Footer;
