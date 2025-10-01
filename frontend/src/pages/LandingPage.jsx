import React from 'react';
import Header from '../components/Header';
import Hero from '../components/Hero';
import '../styles/LandingPage.scss';

const LandingPage = () => {
  return (
    <div className="landing-page">
      <Header />
      <main>
        <Hero />
      </main>
    </div>
  );
};

export default LandingPage;
