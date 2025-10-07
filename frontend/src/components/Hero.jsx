import React, { useState } from 'react';
import '../styles/Hero.scss';
import '../styles/HeroReport.scss';

const Hero = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = e.target.elements.url.value;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      // 1. Send URL for analysis
      const res = await fetch('http://localhost:3001/api/vt/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!data.analysisId) throw new Error("No analysisId in response");

      // 2. Fetch analysis result
      const analysisRes = await fetch(`http://localhost:3001/api/vt/analysis/${data.analysisId}`);
      const analysisData = await analysisRes.json();
      setReport(analysisData);
    } catch (err) {
      setError("Analysis failed: " + err.message);
    }
    setLoading(false);
  };

  const renderReport = () => {
    if (loading) return <p>Analyzing...</p>;
    if (error) return <p className="error-msg">{error}</p>;
    if (!report) return null;

    const engines = report?.result?.data?.attributes?.results || {};

    const categoryDescriptions = {
      malicious: "High Risk",
      suspicious: "Potential Risk",
      harmless: "No Risk Detected",
      undetected: "No Info Available",
    };

    const totalEngines = Object.keys(engines).length;
    const maliciousCount = Object.values(engines).filter(
      (e) => e.category === "malicious"
    ).length;
    const suspiciousCount = Object.values(engines).filter(
      (e) => e.category === "suspicious"
    ).length;

    const maliciousPercentage =
      totalEngines > 0 ? ((maliciousCount / totalEngines) * 100).toFixed(1) : 0;

    let riskLevel = "Safe";
    let riskClass = "risk-safe";
    if (maliciousPercentage > 50) {
      riskLevel = "High Risk";
      riskClass = "risk-high";
    } else if (maliciousPercentage > 10) {
      riskLevel = "Medium Risk";
      riskClass = "risk-medium";
    } else if (maliciousPercentage > 0) {
      riskLevel = "Low Risk";
      riskClass = "risk-low";
    }

    return (
      <div className="report-container">
        <h3 className="report-title">Scan Report for {report.target}</h3>
        <p>Status: <b>{report.status}</b></p>

        <div className="report-summary">
          <p><b>Total engines scanned:</b> {totalEngines}</p>
          <p><b>Malicious detections:</b> {maliciousCount} ({maliciousPercentage}%)</p>
          <p><b>Suspicious detections:</b> {suspiciousCount}</p>
          <p>
            <b>Risk Level:</b>{" "}
            <span className={`risk-level ${riskClass}`}>
              {riskLevel}
            </span>
          </p>
        </div>

        <table className="report-table">
          <thead>
            <tr>
              <th>Engine</th>
              <th>Method</th>
              <th>Category</th>
              <th>Meaning</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(engines).map(([engine, val], index) => (
              <tr key={engine} className={index % 2 === 0 ? "even-row" : "odd-row"}>
                <td>{engine}</td>
                <td>{val.method || "-"}</td>
                <td>{val.category || "-"}</td>
                <td>{categoryDescriptions[val.category] || "-"}</td>
                <td>{val.result || "-"}</td>
              </tr>
            ))}
            {Object.keys(engines).length === 0 && (
              <tr>
                <td colSpan={5} className="no-results">
                  No engine results available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section className="hero-container">
      <div className="hero-content">
        <h1 className="hero-title">
          We give you <span className="highlight">X-Ray Vision</span> for your Website
        </h1>
        <p className="hero-subtitle">
          In just 20 seconds, you can see what{' '}
          <span className="highlight">attackers already know</span>
        </p>
        <form className="analyze-form" onSubmit={handleSubmit}>
          <label htmlFor="url-input">Enter a URL to start 👇</label>
          <div className="input-wrapper">
            <input
              id="url-input"
              name="url"
              type="text"
              placeholder="E.g. google.com"
            />
            <button type="submit">Analyze URL</button>
          </div>
        </form>
        {renderReport()}
      </div>
    </section>
  );
};

export default Hero;
