import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaHome, FaShieldAlt, FaHistory, FaUser, FaCog, FaSignOutAlt, FaChartBar } from 'react-icons/fa';
import '../styles/Sidebar.scss';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { path: '/dashboard', icon: <FaHome />, label: 'Dashboard' },
    { path: '/scan', icon: <FaShieldAlt />, label: 'Security Scan' },
    { path: '/reports', icon: <FaChartBar />, label: 'Reports' },
    { path: '/history', icon: <FaHistory />, label: 'Scan History' },
    { path: '/profile', icon: <FaUser />, label: 'Profile' },
    { path: '/settings', icon: <FaCog />, label: 'Settings' }
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('activeScan');
    navigate('/login');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">SSDT</h2>
        <p className="sidebar-subtitle">Security Scanner</p>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`sidebar-item ${location.pathname === item.path ? 'active' : ''}`}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button onClick={handleLogout} className="sidebar-item logout">
          <span className="sidebar-icon"><FaSignOutAlt /></span>
          <span className="sidebar-label">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;