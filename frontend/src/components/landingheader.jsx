import React, { useState, useEffect } from 'react';
import '../styles/index.css';

const LandingHeader = () => {
  // 1. State is now for dark mode, defaulting to false (light mode)
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 2. This effect runs when isDarkMode changes
  useEffect(() => {
    // If dark mode is enabled, add 'dark-mode' class to the body
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      // Otherwise, remove it
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]); // Dependency array ensures this runs only when isDarkMode changes

  const handleToggle = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <header className="header">
      <div className="logo-placeholder">
        SecureScan
      </div>
      <div className="ui-elements">
        <div className="lang-toggle">
          {/* 3. Update labels for accessibility */}
          <label htmlFor="dark-mode-toggle">Light</label>
          <label className="toggle-switch">
            <input id="dark-mode-toggle" type="checkbox" checked={isDarkMode} onChange={handleToggle} />
            <span className="slider"></span>
          </label>
          <label htmlFor="dark-mode-toggle">Dark</label>
        </div>
        <button className="login-btn">
          Login / Sign Up
        </button>
      </div>
    </header>
  );
};

export default LandingHeader;
