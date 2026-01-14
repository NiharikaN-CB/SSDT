import React from 'react';
import '../styles/ReportCard.scss';

const ReportCard = ({ title, value, icon, status, onClick }) => {
  const getStatusClass = () => {
    switch (status) {
      case 'success':
        return 'report-card-success';
      case 'warning':
        return 'report-card-warning';
      case 'error':
        return 'report-card-error';
      default:
        return 'report-card-default';
    }
  };

  return (
    <div
      className={`report-card ${getStatusClass()}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {icon && <div className="report-card-icon">{icon}</div>}
      <div className="report-card-content">
        <h3 className="report-card-title">{title}</h3>
        <p className="report-card-value">{value}</p>
      </div>
    </div>
  );
};

export default ReportCard;