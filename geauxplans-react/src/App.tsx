import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Learn from './pages/Learn';
import Shop from './pages/Shop';
import About from './pages/About';
import Contact from './pages/Contact';
import MyAccount from './pages/MyAccount';
import Login from './pages/Login';
import Register from './pages/Register';
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
import Checkout from './pages/Checkout';
import CheckoutSuccess from './pages/CheckoutSuccess';
import CheckoutCancelled from './pages/CheckoutCancelled';

import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/main.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Header />
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
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancelled" element={<CheckoutCancelled />} />
            <Route path="/start-business-llc" element={<StartBusinessLLC />} />
            <Route path="/operating-agreement-llc" element={<OperatingAgreementLLC />} />
            <Route path="/category/estate-planning-articles" element={<EstatePlanningArticles />} />
            <Route path="/category/business-planning-articles" element={<BusinessPlanningArticles />} />
          </Routes>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
