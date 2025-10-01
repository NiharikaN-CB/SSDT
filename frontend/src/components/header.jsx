import React from 'react';
import { FiGithub } from 'react-icons/fi';
import '../styles/Header.scss';
import logo from '../assets/logo.svg';

const Header = () => {
  return (
    <header className="header-container">
      <div className="logo-container">
        <img src={logo} alt="WebCheck Logo" className="logo" />
        <h1>WebCheck</h1>
      </div>
      <a
        href="https://github.com/lissy93/web-check"
        target="_blank"
        rel="noopener noreferrer"
        className="github-link"
      >
        <FiGithub />
        <span>Source</span>
      </a>
    </header>
  );
};

export default Header;
