import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Hero.scss';

const Hero = () => {
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
        
        {/* This button matches your theme. 
           It links to the new Selection Page instead of running a scan directly.
        */}
        <div style={{ marginTop: '40px' }}>
          <Link to="/select-mode" style={{ textDecoration: 'none' }}>
            <button 
              className="analyze-form button" 
              style={{
                // Replicating your theme's button style
                padding: '15px 40px',
                fontSize: '1.3rem',
                background: 'var(--accent)', // Uses your theme variable
                color: 'white',
                border: 'none',
                borderRadius: '50px',
                cursor: 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 0 20px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 0 30px var(--accent)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(0,0,0,0.3)';
              }}
            >
              🚀 Start Security Analysis
            </button>
          </Link>
        </div>

      </div>
    </section>
  );
};

export default Hero;