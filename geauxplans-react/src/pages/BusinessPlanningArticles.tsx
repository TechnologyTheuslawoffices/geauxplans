import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/articles.css';

const BusinessPlanningArticles: React.FC = () => {
  const articles = [
    {
      id: 1,
      title: "Why Form an LLC in Louisiana?",
      excerpt: "A Limited Liability Company (LLC) offers flexibility, protection, and tax benefits that make it an attractive option for Louisiana business owners...",
      date: "December 12, 2023",
      slug: "why-form-llc-louisiana"
    },
    {
      id: 2,
      title: "Steps to Starting a Business in Louisiana",
      excerpt: "Starting a business in Louisiana involves several key steps, from choosing a business structure to registering with the state...",
      date: "December 8, 2023",
      slug: "steps-starting-business-louisiana"
    },
    {
      id: 3,
      title: "The Importance of an Operating Agreement",
      excerpt: "An operating agreement is essential for any LLC. It defines the ownership structure, member responsibilities, and how decisions are made...",
      date: "December 1, 2023",
      slug: "importance-operating-agreement"
    },
    {
      id: 4,
      title: "Single-Member vs. Multi-Member LLCs",
      excerpt: "Understanding the differences between single-member and multi-member LLCs can help you choose the right structure for your business...",
      date: "November 25, 2023",
      slug: "single-vs-multi-member-llc"
    },
    {
      id: 5,
      title: "What is a Registered Agent and Why Do You Need One?",
      excerpt: "Every Louisiana LLC is required to have a registered agent. Learn what a registered agent does and why it's important for your business...",
      date: "November 18, 2023",
      slug: "registered-agent-explained"
    },
    {
      id: 6,
      title: "LLC Tax Options: What Louisiana Business Owners Need to Know",
      excerpt: "LLCs offer flexibility when it comes to taxation. Learn about the different tax classification options available to Louisiana LLCs...",
      date: "November 10, 2023",
      slug: "llc-tax-options-louisiana"
    }
  ];

  return (
    <main className="articles-page">
      {/* Hero Section */}
      <section className="articles-hero">
        <div className="container">
          <h1><em className="text-blue">Business Planning</em> <strong>Articles</strong></h1>
          <p className="hero-subtitle"><em>Learn about starting and running a business in Louisiana</em></p>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="articles-section">
        <div className="container">
          <div className="articles-grid">
            {articles.map(article => (
              <article key={article.id} className="article-card">
                <div className="article-content">
                  <span className="article-date">{article.date}</span>
                  <h2><Link to={`/article/${article.slug}`}>{article.title}</Link></h2>
                  <p>{article.excerpt}</p>
                  <Link to={`/article/${article.slug}`} className="read-more">Read More →</Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="articles-cta">
        <div className="container">
          <div className="cta-content">
            <h2><strong>Ready to start your </strong><em className="text-blue">Louisiana Business</em><strong>?</strong></h2>
            <p><em>Form your LLC with GeauxPlans in minutes.</em></p>
            <Link to="/start-business-llc" className="btn btn-solid btn-lg">Start Your LLC</Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default BusinessPlanningArticles;
