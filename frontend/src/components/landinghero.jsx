import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const particlesArray = Array.from({ length: 50 }).map(() => ({
  id: Math.random(),
  size: Math.random() * 5 + 2,
  x: Math.random() * 100,
  y: Math.random() * 100,
  depth: Math.random() * 0.5 + 0.2,
}));

const LandingHero = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePos({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const midX = window.innerWidth / 2;
  const midY = window.innerHeight / 2;
  const moveX = (mousePos.x - midX) / 20;
  const moveY = (mousePos.y - midY) / 20;

  const scrollToFeatures = () => {
    const featuresSection = document.querySelector('.features-section');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="hero-section">
      {particlesArray.map(p => (
        <div
          key={p.id}
          className="particle"
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
            top: `${p.y}%`,
            left: `${p.x}%`,
            transform: `translate(${moveX * p.depth}px, ${moveY * p.depth}px)`
          }}
        />
      ))}

      <div className="hero-content">
        <h1 className="hero-headline">Secure Your Website with Advanced Diagnostics</h1>
        <h2 className="hero-subheading">
          Comprehensive vulnerability scanning, technology fingerprinting, and security posture analysis in one powerful tool.
        </h2>
        <div className="hero-buttons">
          <Link to="/dashboard" className="explore-btn">
            Start Scanning
          </Link>
          <button className="learn-more-btn" onClick={scrollToFeatures}>
            Learn More
          </button>
        </div>
        <p className="hero-description">
          A simple security diagnostics tool for websites that takes a URL and performs automated vulnerability scanning, technology fingerprinting, and security posture checks with clear actionable reporting
        </p>
      </div>
    </section>
  );
};

export default LandingHero;
