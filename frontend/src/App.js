// File path: frontend/src/App.js

import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import SplashScreen from './components/SplashScreen';
import LandingPage from './pages/LandingPage';
// Updated import paths
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

function App() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  // Show splash screen on first load
  if (showSplash) {
    return <SplashScreen onEnter={handleSplashComplete} />;
  }

  // Show main application after splash
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;