import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      const header = document.getElementById('site-header');
      const shouldBeSticky = window.scrollY > 100;
      setIsSticky(shouldBeSticky);

      // Add padding to body to prevent content jump when header becomes fixed
      if (header) {
        const headerHeight = header.offsetHeight;
        document.body.style.paddingTop = shouldBeSticky ? `${headerHeight}px` : '0';
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.body.style.paddingTop = '0';
    };
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
              <Link to="/" className="site-logo" style={{ marginRight: '30px' }}>
                <img src="/img/logo.svg" alt="GeauxPlans" style={{ height: '32px' }} />
              </Link>
              <div id="place_for_menu">
                <nav id="header_navigation" className="header_navigation">
                  <ul className="primary-menu list-reset d-none d-lg-block">
                    {/* Estate Planning Mega Menu */}
                    <li className="menu-item menu-item-has-children gp_mega_menu">
                      <Link to="/estate-planning">Estate Planning</Link>
                      <ul className="sub-menu estate-planning-mega">
                        <li className="mega-col mega-col-left">
                          <Link to="/estate-planning" className="mega-title">Easy &amp; Affordable Estate Planning</Link>
                          <p className="mega-description">Take the quiz and find out which Estate Plan is best for you.</p>
                          <Link to="/estate-planning" className="mega-cta">Take the quiz &rarr;</Link>
                        </li>
                        <li className="mega-col mega-col-right">
                          <ul className="plans-list">
                            <li>
                              <span className="plan-price">From $199</span>
                              <Link to="/minor-child-centered-estate-plan" className="plan-name">Minor Child-Centered Estate Plan</Link>
                              <p className="plan-desc">For families with young children</p>
                            </li>
                            <li>
                              <span className="plan-price">From $99</span>
                              <Link to="/power-of-attorney-plan" className="plan-name">Power of Attorney Plan</Link>
                              <p className="plan-desc">For your college student or aging parent</p>
                            </li>
                            <li>
                              <span className="plan-price">From $199</span>
                              <Link to="/will-based-estate-plan" className="plan-name">Will-Based Estate Plan</Link>
                              <p className="plan-desc">To control your legacy</p>
                            </li>
                            <li>
                              <span className="plan-price">From $399</span>
                              <Link to="/trust-based-estate-plan" className="plan-name">Trust-Based Estate Plan</Link>
                              <p className="plan-desc">To avoid probate and transfer assets</p>
                            </li>
                            <li>
                              <span className="plan-price">$9.99/month</span>
                              <Link to="/legal-edge-plan" className="plan-name">Legal Edge Plan</Link>
                              <p className="plan-desc">Premium membership with benefits</p>
                            </li>
                          </ul>
                          <Link to="/estate-planning" className="view-all-plans">View All Plans <span>&#9662;</span></Link>
                        </li>
                      </ul>
                    </li>
                    {/* Business Planning Mega Menu */}
                    <li className="menu-item menu-item-has-children gp_mega_menu gpx_mega_menu_one_line">
                      <Link to="/start-business-llc">Business Planning</Link>
                      <ul className="sub-menu">
                        <li>
                          <Link to="/start-business-llc">Start an LLC</Link>
                          <p className="description">Find out if an LLC is right for you – enter your preferred business name to get started <span>From $89</span></p>
                        </li>
                        <li>
                          <Link to="/operating-agreement-llc">Operating Agreement for LLC</Link>
                          <p className="description">Document that outlines the ownership and member duties of your LLC <span>From $149</span></p>
                        </li>
                      </ul>
                    </li>
                    {/* Learn Dropdown */}
                    <li className="menu-item menu-item-has-children">
                      <Link to="/learn">Learn</Link>
                      <ul className="sub-menu">
                        <li><Link to="/category/estate-planning-articles">Estate Planning</Link></li>
                        <li><Link to="/category/business-planning-articles">Business Planning</Link></li>
                      </ul>
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
                  <li><Link to="/minor-child-centered-estate-plan" onClick={closeMobileMenu}>Minor Child-Centered Estate Plan</Link></li>
                  <li><Link to="/power-of-attorney-plan" onClick={closeMobileMenu}>Power of Attorney Plan</Link></li>
                  <li><Link to="/will-based-estate-plan" onClick={closeMobileMenu}>Will-Based Estate Plan</Link></li>
                  <li><Link to="/trust-based-estate-plan" onClick={closeMobileMenu}>Trust-Based Estate Plan</Link></li>
                  <li><Link to="/legal-edge-plan" onClick={closeMobileMenu}>Legal Edge Plan</Link></li>
                </ul>
              </li>
              <li className="menu-item menu-item-has-children">
                <Link to="/start-business-llc" onClick={closeMobileMenu}>Business Planning</Link>
                <ul className="sub-menu">
                  <li><Link to="/start-business-llc" onClick={closeMobileMenu}>Start an LLC</Link></li>
                  <li><Link to="/operating-agreement-llc" onClick={closeMobileMenu}>Operating Agreement for LLC</Link></li>
                </ul>
              </li>
              <li className="menu-item menu-item-has-children">
                <Link to="/learn" onClick={closeMobileMenu}>Learn</Link>
                <ul className="sub-menu">
                  <li><Link to="/category/estate-planning-articles" onClick={closeMobileMenu}>Estate Planning</Link></li>
                  <li><Link to="/category/business-planning-articles" onClick={closeMobileMenu}>Business Planning</Link></li>
                </ul>
              </li>
              <li><Link to="/my-account" onClick={closeMobileMenu}>My Account</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
