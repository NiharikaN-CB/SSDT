import React from 'react';
import LandingHeader from '../components/landingheader';
import LandingHero from '../components/landinghero';
import LandingFeatures from '../components/landingfeatures';

const LandingPage = () => {
  return (
    <>
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingFeatures />
      </main>
      <footer className="footer">
        <div className="footer-links">
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          <a href="/terms-of-service" target="_blank" rel="noopener noreferrer">Terms of Service</a>
          <a href="/contact" target="_blank" rel="noopener noreferrer">Contact</a>
        </div>
        <p>&copy; 2023 SecureScan. All rights reserved.</p>
      </footer>
    </>
  );
};

export default LandingPage;
