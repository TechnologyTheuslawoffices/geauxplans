import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
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
import POAForm from './pages/POAForm';
import VerifyEmail from './pages/VerifyEmail';

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
            <Route path="/" element={<Home />} />
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
            <Route path="/estate-planning" element={<EstatePlanning />} />
            <Route path="/poa-form" element={<POAForm />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
          </Routes>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
