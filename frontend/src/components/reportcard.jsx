import React from "react";
import "../styles/reportcard.css";

const ReportCard = ({ title, value }) => (
  <div className="report-card">
    <div className="title">{title}</div>
    <div className="value">{value}</div>
  </div>
);

export default ReportCard;
