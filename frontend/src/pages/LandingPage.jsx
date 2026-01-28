import React from 'react';
import { useLocation } from 'react-router-dom';
import Header from '../components/header';
import Hero from '../components/Hero';
import ScanTypeSelector from '../components/ScanTypeSelector';
import AuthenticatedScanPanel from '../components/AuthenticatedScanPanel';
import ParticleBackground from '../components/ParticleBackground';
import '../styles/LandingPage.scss';

const LandingPage = ({ historicalScan }) => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const scanType = searchParams.get('type');

  // Determine which component to show
  let mainContent;
  if (!scanType) {
    // No scan type selected - show selector
    mainContent = <ScanTypeSelector />;
  } else if (scanType === 'normal') {
    // Normal scan
    mainContent = <Hero historicalScan={historicalScan} />;
  } else if (scanType === 'auth') {
    // Authenticated scan
    mainContent = <AuthenticatedScanPanel />;
  } else {
    // Invalid scan type - default to selector
    mainContent = <ScanTypeSelector />;
  }

  return (
    <div className="landing-page">
      <ParticleBackground />
      <Header />
      <main>
        {mainContent}
      </main>
    </div>
  );
};

export default LandingPage;
