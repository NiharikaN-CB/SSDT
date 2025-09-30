import React from 'react';
import '../styles/lfeatures.css';

const Features = () => {
  return (
    <section className="features-section">
      <h2>Our Core Features</h2>
      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon"></div>
          <h3>[Feature Name 1]</h3>
          <p>A brief, engaging description of this amazing feature and what it does for the user.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon"></div>
          <h3>[Feature Name 2]</h3>
          <p>Explain the value and benefit of the second key feature provided on your platform.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon"></div>
          <h3>[Feature Name 3]</h3>
          <p>Highlight the third feature, focusing on how it solves a problem or enhances the experience.</p>
        </div>
      </div>
    </section>
  );
};

export default Features;