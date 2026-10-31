import React from 'react';
import { Link } from 'react-router-dom';
import { getArticlesByCategory, formatArticleDate } from '../data/articles';
import '../styles/articles.css';

const EstatePlanningArticles: React.FC = () => {
  // Derived from the article data rather than hand-listed. The previous
  // hardcoded array named six articles that do not exist, and linked them to
  // /article/{slug}, a route the app has never defined — so every card 404'd
  // while the real articles were unreachable from any listing.
  const articles = getArticlesByCategory('estate-planning-articles');

  return (
    <main className="articles-page">
      {/* Hero Section */}
      <section className="articles-hero">
        <div className="container">
          <h1><em className="text-blue">Estate Planning</em> <strong>Articles</strong></h1>
          <p className="hero-subtitle"><em>Learn about estate planning in Louisiana</em></p>
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
            <h2><strong>Ready to start your </strong><em className="text-blue">Estate Plan</em><strong>?</strong></h2>
            <p><em>Protecting everything you own and everyone you love has never been so simple.</em></p>
            <Link to="/estate-planning" className="btn btn-solid btn-lg">Get Started</Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default EstatePlanningArticles;
