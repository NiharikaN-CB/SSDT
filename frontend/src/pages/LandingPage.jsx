import React from 'react';
import Header from '../components/header';
import Hero from '../components/Hero';
import ParticleBackground from '../components/ParticleBackground';
import '../styles/LandingPage.scss';

const LandingPage = ({ historicalScan }) => {
  return (
    <div className="landing-page">
      <ParticleBackground />
      <Header />
      <main>
        <Hero historicalScan={historicalScan} />
      </main>
    </div>
  );
};

export default LandingPage;
