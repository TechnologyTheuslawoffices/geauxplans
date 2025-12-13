import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import menuIcon from '../assets/icons/mobile_menu.svg';
import closeIcon from '../assets/icons/mobile_menu_close.svg';
import accountIcon from '../assets/icons/account.svg';

const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <>
      <header className="site-header">
        <div className="container">
          <div className="header-content">
            <div className="header-left">
              <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
                <img src={menuIcon} alt="Menu" />
              </button>
              <nav className="header-navigation">
                <ul className="primary-menu">
                  <li className="menu-item has-dropdown">
                    <Link to="/estate-planning">Estate Planning</Link>
                    <ul className="dropdown-menu">
                      <li><Link to="/estate-planning/will-based">Will-Based Estate Plan</Link></li>
                      <li><Link to="/estate-planning/trust-based">Trust-Based Estate Plan</Link></li>
                      <li><Link to="/estate-planning/minor-child">Minor Child-Centered Estate Plan</Link></li>
                      <li><Link to="/estate-planning/power-of-attorney">Power of Attorney Supplement</Link></li>
                    </ul>
                  </li>
                  <li className="menu-item has-dropdown">
                    <Link to="/business-planning">Business Planning</Link>
                    <ul className="dropdown-menu">
                      <li><Link to="/business-planning/llc-formation">LLC Formation</Link></li>
                      <li><Link to="/business-planning/operating-agreement">Operating Agreement</Link></li>
                      <li><Link to="/business-planning/ein-registration">EIN Registration</Link></li>
                    </ul>
                  </li>
                  <li className="menu-item">
                    <Link to="/pricing">Pricing</Link>
                  </li>
                  <li className="menu-item">
                    <Link to="/faq">FAQ</Link>
                  </li>
                </ul>
              </nav>
            </div>
            <div className="header-right">
              {isAuthenticated && user ? (
                <div className="logged-in-menu has-dropdown">
                  <div className="user-info">
                    <img src={accountIcon} alt="Account" className="account-icon" />
                    <span className="user-name">{user.firstName || user.email}</span>
                  </div>
                  <ul className="dropdown-menu user-dropdown">
                    <li><Link to="/my-account/estate-planning">My Estate Plans</Link></li>
                    <li><Link to="/my-account/business-planning">My Companies</Link></li>
                    <li><Link to="/my-account/edit-account">Edit Profile</Link></li>
                    <li><Link to="/my-account/orders">View Orders</Link></li>
                    <li className="dropdown-divider"></li>
                    <li className="help-text">
                      <strong>Need Help or Advice?</strong><br />
                      Call us: +1 (855) 213-6300<br />
                      M-F, 8am-5pm CST
                    </li>
                    <li><button onClick={logout} className="logout-btn">Logout</button></li>
                  </ul>
                </div>
              ) : (
                <Link to="/my-account" className="btn btn_geaux">
                  My Account
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div
        className={`site-overlay ${isMobileMenuOpen ? 'open' : ''}`}
        onClick={toggleMobileMenu}
      />

      {/* Mobile Sidenav */}
      <div className={`sidenav ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="sidenav-header">
          <Link to="/" onClick={toggleMobileMenu}>
            <img src="/img/logo.svg" alt="GeauxPlans" style={{ height: '40px' }} />
          </Link>
          <button className="close-btn" onClick={toggleMobileMenu}>
            <img src={closeIcon} alt="Close" />
          </button>
        </div>
        <nav className="mobile-nav">
          <ul>
            <li className="mobile-dropdown">
              <span className="dropdown-trigger">Estate Planning</span>
              <ul className="mobile-submenu">
                <li><Link to="/estate-planning/will-based" onClick={toggleMobileMenu}>Will-Based Estate Plan</Link></li>
                <li><Link to="/estate-planning/trust-based" onClick={toggleMobileMenu}>Trust-Based Estate Plan</Link></li>
                <li><Link to="/estate-planning/minor-child" onClick={toggleMobileMenu}>Minor Child-Centered Estate Plan</Link></li>
                <li><Link to="/estate-planning/power-of-attorney" onClick={toggleMobileMenu}>Power of Attorney Supplement</Link></li>
              </ul>
            </li>
            <li className="mobile-dropdown">
              <span className="dropdown-trigger">Business Planning</span>
              <ul className="mobile-submenu">
                <li><Link to="/business-planning/llc-formation" onClick={toggleMobileMenu}>LLC Formation</Link></li>
                <li><Link to="/business-planning/operating-agreement" onClick={toggleMobileMenu}>Operating Agreement</Link></li>
                <li><Link to="/business-planning/ein-registration" onClick={toggleMobileMenu}>EIN Registration</Link></li>
              </ul>
            </li>
            <li><Link to="/pricing" onClick={toggleMobileMenu}>Pricing</Link></li>
            <li><Link to="/faq" onClick={toggleMobileMenu}>FAQ</Link></li>
            <li><Link to="/my-account" onClick={toggleMobileMenu}>My Account</Link></li>
          </ul>
        </nav>
      </div>
    </>
  );
};

export default Header;
