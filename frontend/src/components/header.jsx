import React from "react";
import "../styles/header.css";

const Header = () => (
  <header className="header">
    <div className="title">Dashboard</div>
    <div className="actions">
      <button>Profile</button>
      <button>Logout</button>
    </div>
  </header>
);

export default Header;
