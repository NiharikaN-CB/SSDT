// File path: frontend/src/components/header.jsx

import React from 'react';
import { Link } from 'react-router-dom'; // Import Link
import { FiGithub } from 'react-icons/fi';
import ThemeToggle from './ThemeToggle';
import '../styles/Header.scss';
import logo from '../assets/logo.svg';

const Header = () => {
  return (
    <header className="header-container">
      <div className="logo-container">
        <img src={logo} alt="SSDT Logo" className="logo" />
        <h1>SSDT</h1>
      </div>
      <div className="header-controls">
        <ThemeToggle />
        <a
          href="https://github.com/NiharikaN-CB/SSDT"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          <FiGithub />
          <span>Source</span>
        </a>
        <Link to="/register" className="signup-button">
          Sign Up
        </Link>
      </div>
    </header>
  );
};

export default Header;