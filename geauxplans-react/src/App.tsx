import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Learn from './pages/Learn';
import Shop from './pages/Shop';
import About from './pages/About';
import Contact from './pages/Contact';
import MyAccount from './pages/MyAccount';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Terms from './pages/Terms';
import FAQ from './pages/FAQ';
import LegalEdgePlan from './pages/LegalEdgePlan';
import EstatePlanning from './pages/EstatePlanning';
import EstatePlanningPage from './pages/EstatePlanningPage';
import MinorChildEstatePlan from './pages/MinorChildEstatePlan';
import PowerOfAttorneyPlan from './pages/PowerOfAttorneyPlan';
import WillBasedEstatePlan from './pages/WillBasedEstatePlan';
import TrustBasedEstatePlan from './pages/TrustBasedEstatePlan';
import StartBusinessLLC from './pages/StartBusinessLLC';
import OperatingAgreementLLC from './pages/OperatingAgreementLLC';
import EstatePlanningArticles from './pages/EstatePlanningArticles';
import BusinessPlanningArticles from './pages/BusinessPlanningArticles';
import POAForm from './pages/POAForm';
import VerifyEmail from './pages/VerifyEmail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import CheckoutSuccess from './pages/CheckoutSuccess';
import CheckoutCancelled from './pages/CheckoutCancelled';
import RegisterForWebinar from './pages/RegisterForWebinar';
import GuidedDesignConfirmation from './pages/GuidedDesignConfirmation';
import ThankYouReservation from './pages/ThankYouReservation';
import ThankYouResources from './pages/ThankYouResources';
import LegalEdgePlanContract from './pages/LegalEdgePlanContract';
import Article from './pages/Article';

import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/main.css';

/**
 * Shown for any URL with no matching route.
 *
 * Without a catch-all, an unknown path rendered the header and footer around an
 * empty body — indistinguishable from a page that failed to load. That matters
 * more than usual here: vercel.json redirects a list of legacy WordPress URLs,
 * and anything missed from that list lands on whatever this route renders.
 */
const NotFound: React.FC = () => (
  <main className="not-found-page">
    <div className="container" style={{ padding: '80px 0', textAlign: 'center' }}>
      <h1>We couldn&rsquo;t find that page</h1>
      <p>The page you&rsquo;re looking for may have moved since our site was rebuilt.</p>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '24px' }}>
        <Link to="/" className="btn btn-solid">Go to the homepage</Link>
        <Link to="/learn" className="btn btn-outline">Browse articles</Link>
        <Link to="/my-account" className="btn btn-outline">My account</Link>
      </div>
    </div>
  </main>
);

// Routes where we hide the header/footer (design mode)
const DESIGN_MODE_ROUTES = ['/poa-form'];

// Layout wrapper that conditionally renders header/footer
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isDesignMode = DESIGN_MODE_ROUTES.some(route => location.pathname.startsWith(route));

  return (
    <div className="App">
      {!isDesignMode && <Header />}
      {children}
      {!isDesignMode && <Footer />}
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <Router>
          <AppLayout>
            <Routes>
              <Route path="/" element={<EstatePlanning />} />
              <Route path="/estate-planning" element={<EstatePlanningPage />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/my-account/*" element={<MyAccount />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/legal-edge-plan" element={<LegalEdgePlan />} />
              <Route path="/minor-child-centered-estate-plan" element={<MinorChildEstatePlan />} />
              <Route path="/power-of-attorney-plan" element={<PowerOfAttorneyPlan />} />
              <Route path="/will-based-estate-plan" element={<WillBasedEstatePlan />} />
              <Route path="/trust-based-estate-plan" element={<TrustBasedEstatePlan />} />
              <Route path="/poa-form" element={<POAForm />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/checkout/success" element={<CheckoutSuccess />} />
              <Route path="/checkout/cancelled" element={<CheckoutCancelled />} />
              <Route path="/start-business-llc" element={<StartBusinessLLC />} />
              <Route path="/operating-agreement-llc" element={<OperatingAgreementLLC />} />
              <Route path="/category/estate-planning-articles" element={<EstatePlanningArticles />} />
              <Route path="/category/business-planning-articles" element={<BusinessPlanningArticles />} />
              <Route path="/register-for-webinar" element={<RegisterForWebinar />} />
              <Route path="/guided-design-appointment-confirmation" element={<GuidedDesignConfirmation />} />
              <Route path="/thank-you-for-your-reservation" element={<ThankYouReservation />} />
              <Route path="/thank-you-complimentary-resources" element={<ThankYouResources />} />
              <Route path="/legal-edge-plan-contract" element={<LegalEdgePlanContract />} />
              <Route path="/estate-planning-articles/:slug" element={<Article />} />
              <Route path="/business-planning-articles/:slug" element={<Article />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </Router>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
