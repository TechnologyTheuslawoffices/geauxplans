import React from 'react';
import { Link } from 'react-router-dom';
import HeroSection from '../components/HeroSection';
import PlanCard from '../components/PlanCard';
import childCenteredImage from '../assets/images/Child-Centered.png';
import adultImage from '../assets/images/Adult.png';
import willImage from '../assets/images/Will.png';
import trustImage from '../assets/images/Trust.png';

const Home: React.FC = () => {
  return (
    <main>
      {/* Hero Section */}
      <HeroSection
        title="EASY AND AFFORDABLE ESTATE PLANNING"
        subtitle="Protecting everything you own and everyone you love has never been so simple. Made in Louisiana for Louisiana. We are here to make your estate planning experience simple, smooth, and affordable."
        buttonText="Start Your Estate Plan"
        buttonLink="/shop"
      />

      {/* Plans Section */}
      <section className="plans-section">
        <div className="container">
          <h2 className="section-title">Choose the package that is right for you.</h2>

          <PlanCard
            title="Minor Child-Centered Estate Plan"
            price="Starting at $199"
            description="The Minor Child-Centered Estate Plan is well suited for families with young children."
            image={childCenteredImage}
            learnMoreLink="/learn"
          />

          <PlanCard
            title="Power of Attorney Supplement"
            price="Starting at $99"
            description="Create a Financial Power of Attorney and Healthcare Power of Attorney for your college student (who is no longer a child), so you can help them if something happens."
            image={adultImage}
            learnMoreLink="/learn"
            reverse
          />

          <PlanCard
            title="Will-Based Estate Plan"
            price="Starting at $199"
            description="Create a will-based plan to control your legacy."
            image={willImage}
            learnMoreLink="/learn"
          />

          <PlanCard
            title="Trust-Based Estate Plan"
            price="Starting at $399"
            description="Create a trust-based plan to avoid probate and transfer assets to your loved ones."
            image={trustImage}
            learnMoreLink="/learn"
            reverse
          />

          <div style={{ textAlign: 'center', marginTop: '50px' }}>
            <Link to="/shop" className="btn btn-primary btn-lg">
              Start Your Estate Plan
            </Link>
          </div>
        </div>
      </section>

      {/* Louisiana Banner */}
      <section className="louisiana-banner">
        <div className="container">
          <p><em>Made with love by Louisiana attorneys exclusively for Louisiana!</em></p>
        </div>
      </section>
    </main>
  );
};

export default Home;
