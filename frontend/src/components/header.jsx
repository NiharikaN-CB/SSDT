// File path: frontend/src/components/header.jsx

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import '../styles/Header.scss';
import logo from '../assets/logo.svg';

const Header = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const handleLogout = () => {
    localStorage.removeItem('token'); // Clear the token
    navigate('/'); // Redirect to the landing page
    window.location.reload(); // Force a refresh to update the header
  };

  return (
    <header className="header-container">
      <Link to="/" className="logo-container">
        <img src={logo} alt="SSDT Logo" className="logo" />
        <h1>SSDT</h1>
      </Link>
      <div className="header-controls">
        <ThemeToggle />
        <LanguageToggle />

        {/* --- This logic shows Profile & Logout or Sign Up --- */}
        {token ? (
          <>
            <Link to="/profile" className="profile-button">
              Profile
            </Link>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </>
        ) : (
          <Link to="/register" className="signup-button">
            Sign Up
          </Link>
        )}
      </div>
    </header>
  );
};

export default Header;