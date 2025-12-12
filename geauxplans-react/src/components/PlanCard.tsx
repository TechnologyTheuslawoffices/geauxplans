import React from 'react';
import { Link } from 'react-router-dom';

interface PlanCardProps {
  title: string;
  price: string;
  description: string;
  image: string;
  learnMoreLink?: string;
  reverse?: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({
  title,
  price,
  description,
  image,
  learnMoreLink = '/learn',
  reverse = false,
}) => {
  return (
    <div className={`plan-row ${reverse ? 'reverse' : ''}`}>
      <div className="plan-content">
        <h3>{title}</h3>
        <p className="plan-price">{price}</p>
        <p className="plan-description">{description}</p>
        <Link to={learnMoreLink} className="learn-more">
          Learn More <i className="fas fa-chevron-right"></i>
        </Link>
      </div>
      <div className="plan-image">
        <img src={image} alt={title} />
      </div>
    </div>
  );
};

export default PlanCard;
