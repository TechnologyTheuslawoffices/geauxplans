import React from 'react';
import { Link } from 'react-router-dom';
import heroImage from '../assets/images/field-family.jpg';

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
  backgroundImage?: string;
}

const HeroSection: React.FC<HeroSectionProps> = ({
  title,
  subtitle,
  buttonText = 'Start Your Estate Plan',
  buttonLink = '/shop',
  backgroundImage = heroImage,
}) => {
  return (
    <section
      className="hero-section"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      <div className="hero-content">
        <div className="container">
          <h1>{title}</h1>
          {subtitle && <h2>{subtitle}</h2>}
          {buttonText && (
            <Link to={buttonLink} className="btn btn-white btn-lg">
              {buttonText}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
