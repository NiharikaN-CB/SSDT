// File path: frontend/src/App.js

import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import SplashScreen from './components/SplashScreen';
import LandingPage from './pages/LandingPage';
// Updated import paths
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import OTPVerification from './pages/auth/OTPVerification';
import Profile from './pages/Profile';
// Translation imports
import { TranslationProvider } from './contexts/TranslationContext';
import { UserProvider, useUser } from './contexts/UserContext';

function AppContent() {
  const [showSplash, setShowSplash] = useState(true);
  const { isPro, loading } = useUser();

  console.log('🎨 App: isPro =', isPro, ', loading =', loading);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  // Show splash screen on first load
  if (showSplash) {
    return <SplashScreen onEnter={handleSplashComplete} />;
  }

  // Show main application after splash with PRO theme if applicable
  return (
    <div className={isPro ? 'pro-theme' : ''}>
      <TranslationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-otp" element={<OTPVerification />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </BrowserRouter>
      </TranslationProvider>
    </div>
  );
}

function App() {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}

export default App;