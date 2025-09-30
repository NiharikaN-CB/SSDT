import React from 'react';
// FIX: Changed the import names to match the component usage below
import Lheader from '../components/lheader';
import Lhero from '../components/lhero';
import Lfeatures from '../components/lfeatures';

const LandingPage = () => {
  return (
    <>
      <Lheader />
      <main>
        <Lhero />
        <Lfeatures />
      </main>
    </>
  );
};

export default LandingPage;