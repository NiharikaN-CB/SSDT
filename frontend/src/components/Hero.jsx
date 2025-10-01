import React from 'react';
import '../styles/Hero.scss';

const Hero = () => {
  const handleSubmit = (e) => {
    e.preventDefault();
    const url = e.target.elements.url.value;
    alert(`Analyzing ${url}`);
    // Here you would typically navigate to a results page
    // For example: navigate(`/results?url=${url}`);
  };

  return (
    <section className="hero-container">
      <div className="hero-content">
        <h1 className="hero-title">
          We give you <span className="highlight">X-Ray Vision</span> for your Website
        </h1>
        <p className="hero-subtitle">
          In just 20 seconds, you can see what{' '}
          <span className="highlight">attackers already know</span>
        </p>
        <form className="analyze-form" onSubmit={handleSubmit}>
          <label htmlFor="url-input">Enter a URL to start 👇</label>
          <div className="input-wrapper">
            <input
              id="url-input"
              name="url"
              type="text"
              placeholder="E.g. google.com"
            />
            <button type="submit">Analyze URL</button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default Hero;
