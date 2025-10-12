import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Hero.scss';
import '../styles/HeroReport.scss';

const Hero = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = e.target.elements.url.value;

    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in first to scan URLs');
      navigate('/login');
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      console.log('🔍 Submitting URL for scan:', url);

      // 1. Send URL for analysis
      const res = await fetch('http://localhost:3001/api/vt/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token // ✅ Added authentication token
        },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      console.log('📋 Backend Response:', data);

      // ✅ Fixed: Check for both possible response formats
      const analysisId = data.analysisId || data.data?.id;

      if (!analysisId) {
        throw new Error(data.error || data.details || "No analysisId in response");
      }

      console.log('✅ Analysis ID received:', analysisId);

      // 2. Poll for analysis result (VirusTotal takes time to analyze)
      let attempts = 0;
      const maxAttempts = 20; // Max 20 attempts (40 seconds)

      const pollAnalysis = async () => {
        attempts++;
        console.log(`📊 Polling attempt ${attempts}/${maxAttempts}...`);

        try {
          const analysisRes = await fetch(
            `http://localhost:3001/api/vt/analysis/${analysisId}`,
            {
              headers: {
                'x-auth-token': token
              }
            }
          );
          const analysisData = await analysisRes.json();
          console.log('📋 Analysis Data:', analysisData);

          // Check if analysis is complete
          const status = analysisData.status || analysisData.data?.attributes?.status;

          if (status === 'completed') {
            console.log(' Analysis completed!');
            setReport(analysisData);
            setLoading(false);
          } else if (attempts >= maxAttempts) {
            throw new Error('Analysis timeout. Please check back later.');
          } else {
            console.log(` Status: ${status}, waiting 2 seconds...`);
            // Wait 2 seconds before next poll
            setTimeout(pollAnalysis, 2000);
          }
        } catch (pollError) {
          console.error(' Polling error:', pollError);
          throw pollError;
        }
      };

      // Start polling
      await pollAnalysis();

    } catch (err) {
      console.error(' Analysis error:', err);
      setError("Analysis failed: " + err.message);
      setLoading(false);
    }
  };

  const renderReport = () => {
    if (loading) {
      return (
        <div className="loading-message">
          <p> Analyzing URL...</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--foreground-darker)' }}>
            This may take 20-40 seconds
          </p>
        </div>
      );
    }

    if (error) {
      return <p className="error-msg">{error}</p>;
    }

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
                  No engine results available yet. Analysis may still be processing.
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
              placeholder="E.g. https://google.com"
              defaultValue="https://google.com"
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Analyzing...' : 'Analyze URL'}
            </button>
          </div>
        </form>
        {renderReport()}
      </div>
    </section>
  );
};

export default Hero;