import React from 'react';
import { Link } from 'react-router-dom';
import { getArticlesByCategory, formatArticleDate } from '../data/articles';
import '../styles/articles.css';

const BusinessPlanningArticles: React.FC = () => {
  // Derived from the article data rather than hand-listed — see the note in
  // EstatePlanningArticles.tsx. None of the six slugs previously hardcoded here
  // existed, and they pointed at a route the app does not define.
  const articles = getArticlesByCategory('business-planning-articles');

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
              <article key={article.slug} className="article-card">
                <div className="article-content">
                  <span className="article-date">{formatArticleDate(article.date)}</span>
                  <h2><Link to={`/${article.category}/${article.slug}`}>{article.title}</Link></h2>
                  <p>{article.excerpt}</p>
                  <Link to={`/${article.category}/${article.slug}`} className="read-more">Read More →</Link>
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
