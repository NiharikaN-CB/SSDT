import React, { useState, useEffect } from 'react';
import '../styles/lheader.css';

const Header = () => {
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
        YourLogo
      </div>
      <div className="ui-elements">
        <div className="lang-toggle">
          {/* 3. Update labels */}
          <span>Light</span>
          <label className="toggle-switch">
            <input type="checkbox" checked={isDarkMode} onChange={handleToggle} />
            <span className="slider"></span>
          </label>
          <span>Dark</span>
        </div>
        <button className="login-btn">
          Login / Sign Up
        </button>
      </div>
    </header>
  );
};

export default Header;