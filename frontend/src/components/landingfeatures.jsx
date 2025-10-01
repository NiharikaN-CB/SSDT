import React from 'react';

const LandingFeatures = () => {
  return (
    <section className="features-section">
      <h2>Our Core Features</h2>
      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon"></div>
          <h3>Comprehensive Vulnerability Scanning</h3>
          <p>Automatically scans for common vulnerabilities like SQL injection, XSS, and more.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon"></div>
          <h3>Technology Fingerprinting</h3>
          <p>Instantly identify the web technologies a site is using to understand its security landscape.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon"></div>
          <h3>In-depth Security Posture Analysis</h3>
          <p>Get a detailed report on SSL/TLS configuration, header security, and other critical security settings.</p>
        </div>
      </div>
    </section>
  );
};

export default LandingFeatures;
