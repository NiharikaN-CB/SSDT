import React from "react";
import "../styles/sidebar.css";

const Sidebar = () => (
  <div className="sidebar">
    <div className="logo">Web-Check</div>
    <nav>
      <ul>
        <li><a href="/">Dashboard</a></li>
        <li><a href="/scan">Scan</a></li>
        <li><a href="/reports">Reports</a></li>
      </ul>
    </nav>
  </div>
);

export default Sidebar;
