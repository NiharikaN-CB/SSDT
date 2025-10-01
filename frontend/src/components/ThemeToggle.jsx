import React from 'react';
import { useTheme } from '../context/ThemeContext';
import '../styles/ThemeToggle.scss';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <label className="switch">
      <input
        id="input"
        type="checkbox"
        onChange={toggleTheme}
        checked={theme === 'dark'}
      />
      <span className="slider round">
        <div className="sun-moon">
            {/* Moon Dots */}
            <div id="moon-dot-1" className="moon-dot"></div>
            <div id="moon-dot-2" className="moon-dot"></div>
            <div id="moon-dot-3" className="moon-dot"></div>

            {/* Light Rays */}
            <div id="light-ray-1"></div>
            <div id="light-ray-2"></div>
            <div id="light-ray-3"></div>

            {/* Clouds */}
            <div id="cloud-1" className="cloud-light"></div>
            <div id="cloud-2" className="cloud-dark"></div>
            <div id="cloud-3" className="cloud-light"></div>
            <div id="cloud-4" className="cloud-dark"></div>
            <div id="cloud-5" className="cloud-light"></div>
            <div id="cloud-6" className="cloud-dark"></div>
        </div>

        {/* Stars */}
        <div className="stars">
            <div id="star-1" className="star"></div>
            <div id="star-2" className="star"></div>
            <div id="star-3" className="star"></div>
            <div id="star-4" className="star"></div>
        </div>
      </span>
    </label>
  );
};

export default ThemeToggle;
