import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Hero.scss';
import '../styles/HeroReport.scss';

const Hero = () => {
  const [pageSpeedReport, setPageSpeedReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = e.target.elements.url.value;
    const token = localStorage.getItem('token');

    if (!token) {
      alert('Please log in first to analyze a URL');
      navigate('/login');
      return;
    }

    setLoading(true);
    setError(null);
    setPageSpeedReport(null);

    try {
      const res = await fetch('http://localhost:3002/api/pagespeed/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token,
        },
        body: JSON.stringify({ url, strategy: 'desktop' }), // Specifying strategy
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
      }

      const pageSpeedData = await res.json();

      // Check for API-specific errors in the response
      if (pageSpeedData.error) {
        throw new Error(pageSpeedData.error.message);
      }
      
      setPageSpeedReport(pageSpeedData);

    } catch (err) {
      console.error('Analysis error:', err);
      setError("Analysis failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderPageSpeedReport = () => {
    if (loading) {
      return (
        <div className="loading-message">
          <p>Analyzing URL with PageSpeed Insights...</p>
        </div>
      );
    }

    if (error) {
      return <p className="error-msg">{error}</p>;
    }

    // **This is the critical fix:** Check if lighthouseResult exists before rendering
    if (!pageSpeedReport || !pageSpeedReport.lighthouseResult) {
      return null;
    }

    const { categories } = pageSpeedReport.lighthouseResult;
    const performanceScore = categories.performance.score * 100;
    const accessibilityScore = categories.accessibility.score * 100;
    const bestPracticesScore = categories['best-practices'].score * 100;
    const seoScore = categories.seo.score * 100;

    return (
      <div className="report-container">
        <h3 className="report-title">PageSpeed Insights Report</h3>
        <div className="report-summary">
          <p><b>Performance Score:</b> {performanceScore.toFixed(0)}</p>
          <p><b>Accessibility Score:</b> {accessibilityScore.toFixed(0)}</p>
          <p><b>Best Practices Score:</b> {bestPracticesScore.toFixed(0)}</p>
          <p><b>SEO Score:</b> {seoScore.toFixed(0)}</p>
        </div>
      </div>
    );
  };

  return (
    <section className="hero-container">
      <div className="hero-content">
        <h1 className="hero-title">
          We give you <span className="highlight">X-Ray Vision</span> for your Website
        </h1>
        <p className="hero-subtitle">
          Get key performance and quality metrics for your site.
        </p>
        <form className="analyze-form" onSubmit={handleSubmit}>
          <label htmlFor="url-input">Enter a URL to start 👇</label>
          <div className="input-wrapper">
            <input
              id="url-input"
              name="url"
              type="text"
              placeholder="E.g. https://google.com"
              defaultValue="https://google.com"
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Analyzing...' : 'Analyze URL'}
            </button>
          </div>
        </form>
        {renderPageSpeedReport()}
      </div>
    </section>
  );
};

export default Hero;