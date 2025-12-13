import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsSticky(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
    document.body.classList.toggle('overflow-none');
    document.body.classList.toggle('is_mobile_menu');
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    document.body.classList.remove('overflow-none', 'is_mobile_menu');
  };

  return (
    <>
      <header id="site-header" className={`site-header header py-2 py-md-3 ${isSticky ? 'sticky' : ''}`}>
        <div className="container">
          <div id="logo_and_menu" className="d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center">
              <span id="show_mobile_menu" className="mobile_menu_toggle" onClick={toggleMobileMenu}>
                <img src="/img/mobile_menu.svg" alt="Menu" />
              </span>
              <div id="place_for_menu">
                <nav id="header_navigation" className="header_navigation">
                  <ul className="primary-menu list-reset d-none d-lg-block">
                    <li className="menu-item menu-item-has-children gp_mega_menu">
                      <Link to="/estate-planning">Estate Planning</Link>
                      <ul className="sub-menu">
                        <li>
                          <Link to="/estate-planning/will-based">Will-Based Estate Plan</Link>
                          <p className="description">Simple estate planning with a Last Will and Testament</p>
                        </li>
                        <li>
                          <Link to="/estate-planning/trust-based">Trust-Based Estate Plan</Link>
                          <p className="description">Comprehensive planning with a Living Trust to avoid probate</p>
                        </li>
                        <li>
                          <Link to="/estate-planning/minor-child">Minor Child-Centered Plan</Link>
                          <p className="description">Planning focused on providing for minor children</p>
                        </li>
                        <li>
                          <Link to="/estate-planning/power-of-attorney">Power of Attorney Supplement</Link>
                          <p className="description">Healthcare and financial powers of attorney</p>
                        </li>
                      </ul>
                    </li>
                    <li className="menu-item menu-item-has-children gp_mega_menu">
                      <Link to="/business-planning">Business Planning</Link>
                      <ul className="sub-menu">
                        <li>
                          <Link to="/business-planning/llc-formation">LLC Formation</Link>
                          <p className="description">Form your Louisiana LLC online</p>
                        </li>
                        <li>
                          <Link to="/business-planning/operating-agreement">Operating Agreement</Link>
                          <p className="description">Create a custom operating agreement</p>
                        </li>
                        <li>
                          <Link to="/business-planning/ein-registration">EIN Registration</Link>
                          <p className="description">Get your Employer Identification Number</p>
                        </li>
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
            </div>
            <div className="d-flex align-items-center">
              {!isAuthenticated ? (
                <div id="place_for_my_account" className="d-flex align-items-center">
                  <p className="mb-0">
                    <Link to="/my-account" className="btn btn_geaux" style={{ marginLeft: '20px' }}>
                      <span><span className="d-none d-sm-inline">My </span>Account</span>
                    </Link>
                  </p>
                </div>
              ) : (
                <ul id="gpx_loggedin_menu">
                  <li>
                    <div className="d-flex align-items-center">
                      <img src="/img/account.svg" alt="Account" />
                      <Link to="#"><span className="d-none d-sm-inline">{user?.firstName || user?.email}</span></Link>
                    </div>
                    <ul>
                      <li><Link to="/my-account/my-estate-planning">My Estate Plans</Link></li>
                      <li><Link to="/my-account/my-business-planning">My Companies</Link></li>
                      <li><Link to="/my-account/edit-account">Edit Profile</Link></li>
                      <li><Link to="/my-account/orders">View Orders</Link></li>
                      <li>
                        <p className="mb-2"><strong>Need Help or Advice?</strong></p>
                        <strong>Call us:</strong><br />
                        +1 (855) 213-6300<br />
                        M-F, 8am-5pm CST
                        <br /><br />
                        <button onClick={logout} className="btn btn_geaux" style={{ width: '100%' }}>Logout</button>
                      </li>
                    </ul>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Site Overflow */}
      <div id="site-oveflow" className="close_mobile_menu" onClick={closeMobileMenu} />

      {/* Mobile Sidenav */}
      <div id="sidenav" className="sidenav p-0">
        <div style={{ position: 'relative' }}>
          <div className="p-2 px-3 canvas_brand d-flex justify-content-between align-items-center" style={{ background: '#fff', top: 0, left: 0, position: 'sticky', borderBottom: '1px solid #eaeaea' }}>
            <Link to="/" onClick={closeMobileMenu}>
              <img src="/img/logo.svg" alt="GeauxPlans" style={{ height: '40px' }} />
            </Link>
            <div className="close_mobile_menu" onClick={closeMobileMenu}>
              <img src="/img/mobile_menu_close.svg" alt="Close" />
            </div>
          </div>
          <div id="place_for_mobile_menu" className="py-2 px-3">
            <ul className="primary-menu-mobile list-reset">
              <li className="menu-item menu-item-has-children">
                <Link to="/estate-planning" onClick={closeMobileMenu}>Estate Planning</Link>
                <ul className="sub-menu">
                  <li><Link to="/estate-planning/will-based" onClick={closeMobileMenu}>Will-Based Estate Plan</Link></li>
                  <li><Link to="/estate-planning/trust-based" onClick={closeMobileMenu}>Trust-Based Estate Plan</Link></li>
                  <li><Link to="/estate-planning/minor-child" onClick={closeMobileMenu}>Minor Child-Centered Plan</Link></li>
                  <li><Link to="/estate-planning/power-of-attorney" onClick={closeMobileMenu}>Power of Attorney Supplement</Link></li>
                </ul>
              </li>
              <li className="menu-item menu-item-has-children">
                <Link to="/business-planning" onClick={closeMobileMenu}>Business Planning</Link>
                <ul className="sub-menu">
                  <li><Link to="/business-planning/llc-formation" onClick={closeMobileMenu}>LLC Formation</Link></li>
                  <li><Link to="/business-planning/operating-agreement" onClick={closeMobileMenu}>Operating Agreement</Link></li>
                  <li><Link to="/business-planning/ein-registration" onClick={closeMobileMenu}>EIN Registration</Link></li>
                </ul>
              </li>
              <li><Link to="/pricing" onClick={closeMobileMenu}>Pricing</Link></li>
              <li><Link to="/faq" onClick={closeMobileMenu}>FAQ</Link></li>
              <li><Link to="/my-account" onClick={closeMobileMenu}>My Account</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
