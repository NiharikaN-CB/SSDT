import React from 'react';
import Header from '../components/header';
import AuthenticatedScanPanel from '../components/AuthenticatedScanPanel';
import ParticleBackground from '../components/ParticleBackground';

const AuthenticatedScan = () => {
  return (
    <div className="landing-page">
      <ParticleBackground />
      <Header />
      <main style={{ paddingTop: '80px', minHeight: '100vh' }}>
        <AuthenticatedScanPanel />
      </main>
    </div>
  );
};

export default AuthenticatedScan;
