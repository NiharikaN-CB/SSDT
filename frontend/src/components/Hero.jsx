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

      // 1. Send URL for combined analysis (VirusTotal + PageSpeed + Gemini)
      const res = await fetch('http://localhost:3001/api/vt/combined-url-scan', {
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

      // 2. Poll for combined analysis result (VirusTotal + PageSpeed + Gemini)
      let attempts = 0;
      const maxAttempts = 30; // Max 30 attempts (60 seconds) - increased for combined analysis

      const pollAnalysis = async () => {
        attempts++;
        console.log(`📊 Polling attempt ${attempts}/${maxAttempts}...`);

        try {
          const analysisRes = await fetch(
            `http://localhost:3001/api/vt/combined-analysis/${analysisId}`,
            {
              headers: {
                'x-auth-token': token
              }
            }
          );
          const analysisData = await analysisRes.json();
          console.log('📋 Analysis Data:', analysisData);

          // Check if analysis is complete
          const status = analysisData.status;

          if (status === 'completed') {
            console.log('✅ Combined analysis completed!');
            setReport(analysisData);
            setLoading(false);
          } else if (status === 'failed') {
            throw new Error('Analysis failed: ' + (analysisData.error || 'Unknown error'));
          } else if (attempts >= maxAttempts) {
            throw new Error('Analysis timeout. Please check back later.');
          } else {
            // Update loading message based on status
            let statusMessage = 'Analyzing...';
            if (status === 'queued' || status === 'pending') {
              statusMessage = 'Running VirusTotal scan...';
            } else if (status === 'combining') {
              statusMessage = 'Combining results and generating AI report...';
            }
            console.log(`⏳ Status: ${statusMessage}`);

            // Wait 2 seconds before next poll
            setTimeout(pollAnalysis, 2000);
          }
        } catch (pollError) {
          console.error('❌ Polling error:', pollError);
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
          <p>🔍 Analyzing URL...</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--foreground-darker)' }}>
            This may take 30-60 seconds (VirusTotal + PageSpeed + AI Analysis)
          </p>
        </div>
      );
    }

    if (error) {
      return <p className="error-msg">{error}</p>;
    }

    if (!report) return null;

    // Extract data from combined report
    const vtStats = report?.vtStats || {};
    const psiScores = report?.psiScores || {};
    const refinedReport = report?.refinedReport;
    const engines = report?.vtResult?.data?.attributes?.results || {};

    const categoryDescriptions = {
      malicious: "High Risk",
      suspicious: "Potential Risk",
      harmless: "No Risk Detected",
      undetected: "No Info Available",
    };

    const totalEngines = Object.keys(engines).length;
    const maliciousCount = vtStats.malicious || 0;
    const suspiciousCount = vtStats.suspicious || 0;

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

    // Function to get score color class
    const getScoreClass = (score) => {
      if (score >= 90) return 'score-good';
      if (score >= 50) return 'score-medium';
      return 'score-poor';
    };

    return (
      <div className="report-container">
        <h3 className="report-title">📊 Combined Scan Report for {report.target}</h3>
        <p>Status: <b>{report.status}</b></p>

        {/* AI-Generated Summary Section */}
        {refinedReport && (
          <div className="ai-report-section" style={{
            background: 'var(--card-bg)',
            padding: '1.5rem',
            marginBottom: '2rem',
            borderRadius: '8px',
            border: '2px solid var(--accent)',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            lineHeight: '1.6',
            fontSize: '0.9rem'
          }}>
            <h4 style={{ marginTop: 0, color: 'var(--accent)' }}>🤖 AI-Generated Analysis Summary</h4>
            <div dangerouslySetInnerHTML={{ __html: (() => {
              // Clean up markdown code blocks if present
              let cleanReport = refinedReport;
              if (cleanReport.startsWith('```markdown')) {
                cleanReport = cleanReport.substring('```markdown\n'.length);
              } else if (cleanReport.startsWith('```')) {
                cleanReport = cleanReport.substring('```\n'.length);
              }
              if (cleanReport.endsWith('```\n')) {
                cleanReport = cleanReport.substring(0, cleanReport.length - 4);
              } else if (cleanReport.endsWith('```')) {
                cleanReport = cleanReport.substring(0, cleanReport.length - 3);
              }
              return cleanReport.replace(/\n/g, '<br/>');
            })()} } />
          </div>
        )}

        {/* Combined Scores Overview */}
        <div className="combined-scores" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {/* Security Score */}
          <div style={{
            background: 'var(--card-bg)',
            padding: '1rem',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🛡️ Security</h4>
            <span className={`risk-level ${riskClass}`} style={{ fontSize: '1.5rem' }}>
              {riskLevel}
            </span>
            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {maliciousCount}/{totalEngines} malicious
            </p>
          </div>

          {/* PageSpeed Scores */}
          {psiScores.performance !== null && (
            <div style={{
              background: 'var(--card-bg)',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>⚡ Performance</h4>
              <span className={getScoreClass(psiScores.performance)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {psiScores.performance}
              </span>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p>
            </div>
          )}

          {psiScores.accessibility !== null && (
            <div style={{
              background: 'var(--card-bg)',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>♿ Accessibility</h4>
              <span className={getScoreClass(psiScores.accessibility)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {psiScores.accessibility}
              </span>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p>
            </div>
          )}

          {psiScores.bestPractices !== null && (
            <div style={{
              background: 'var(--card-bg)',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>✅ Best Practices</h4>
              <span className={getScoreClass(psiScores.bestPractices)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {psiScores.bestPractices}
              </span>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p>
            </div>
          )}

          {psiScores.seo !== null && (
            <div style={{
              background: 'var(--card-bg)',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>🔍 SEO</h4>
              <span className={getScoreClass(psiScores.seo)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {psiScores.seo}
              </span>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p>
            </div>
          )}
        </div>

        {/* Detailed Security Summary */}
        <div className="report-summary">
          <h4>🔒 VirusTotal Security Details</h4>
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

        {/* Detailed Engine Results (Collapsible) */}
        <details style={{ marginTop: '2rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px' }}>
            📋 View Detailed Engine Results ({totalEngines} engines)
          </summary>
          <table className="report-table" style={{ marginTop: '1rem' }}>
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
        </details>
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
        
        {/* Translation Disclaimer */}
        <div className="translation-disclaimer" style={{
          background: 'rgba(255, 193, 7, 0.1)',
          border: '2px solid #ffc107',
          borderRadius: '8px',
          padding: '1rem',
          margin: '1rem 0',
          fontSize: '0.9rem',
          color: '#ffc107',
          textAlign: 'center',
          fontWeight: '500'
        }}>
          <strong>⚠️ Important:</strong> Please do not click the "English ↔ 日本語" translation button while analyzing URLs, as this can break the translation code and cause errors.
        </div>
        {renderReport()}
      </div>
    </section>
  );
};

export default Hero;