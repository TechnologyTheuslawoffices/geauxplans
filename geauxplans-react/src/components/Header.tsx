import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/icons/logo.svg';
import menuIcon from '../assets/icons/mobile_menu.svg';
import closeIcon from '../assets/icons/mobile_menu_close.svg';

const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <>
      <header className="site-header">
        <div className="container">
          <div className="header-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
                <img src={menuIcon} alt="Menu" />
              </button>
              <Link to="/">
                <img src={logo} alt="GeauxPlans" className="logo" />
              </Link>
              <nav>
                <ul className="nav-menu">
                  <li><Link to="/">Home</Link></li>
                  <li><Link to="/learn">Learn</Link></li>
                  <li><Link to="/shop">Shop</Link></li>
                  <li><Link to="/about">About Us</Link></li>
                  <li><Link to="/contact">Contact</Link></li>
                </ul>
              </nav>
            </div>
            <div>
              <Link to="/my-account" className="btn btn-primary">
                My Account
              </Link>
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
            <img src={logo} alt="GeauxPlans" style={{ height: '40px' }} />
          </Link>
          <button className="close-btn" onClick={toggleMobileMenu}>
            <img src={closeIcon} alt="Close" />
          </button>
        </div>
        <nav className="mobile-nav">
          <ul>
            <li><Link to="/" onClick={toggleMobileMenu}>Home</Link></li>
            <li><Link to="/learn" onClick={toggleMobileMenu}>Learn</Link></li>
            <li><Link to="/shop" onClick={toggleMobileMenu}>Shop</Link></li>
            <li><Link to="/about" onClick={toggleMobileMenu}>About Us</Link></li>
            <li><Link to="/contact" onClick={toggleMobileMenu}>Contact</Link></li>
            <li><Link to="/my-account" onClick={toggleMobileMenu}>My Account</Link></li>
          </ul>
        </nav>
      </div>
    </>
  );
};

export default Header;
