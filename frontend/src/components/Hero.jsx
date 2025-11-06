import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/TranslationContext';
import { getApiUrl } from '../config/api';
import '../styles/Hero.scss';
import '../styles/HeroReport.scss';

const Hero = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { currentLang, translatePage, setHasReport } = useTranslation();

  // Re-translate when report loads and we're in Japanese mode
  useEffect(() => {
    if (report) {
      // Show the translate button now that report is loaded
      setHasReport(true);

      if (currentLang === 'ja') {
        console.log('📊 Report loaded in Japanese mode, translating...');
        // Wait for DOM to update
        setTimeout(() => {
          translatePage('ja');
        }, 500);
      }
    } else {
      // Hide translate button when no report
      setHasReport(false);
    }
  }, [report, currentLang, translatePage, setHasReport]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = e.target.elements.url.value;

    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('User not logged in, redirecting to login');
      navigate('/login');
      return;
    }

    setLoading(true);
    setLoadingProgress(0);
    setLoadingStage('Initializing scan...');
    setError(null);
    setReport(null);

    // Note: We don't clear translation cache here anymore
    // The translation system now intelligently detects new content

    try {
      console.log('🔍 Submitting URL for scan:', url);
      setLoadingProgress(10);
      setLoadingStage('Submitting URL to security scanners...');

      // 1. Send URL for combined analysis (VirusTotal + PageSpeed + Gemini)
      const res = await fetch(getApiUrl('api/vt/combined-url-scan'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token // ✅ Added authentication token
        },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));

        // Handle rate limiting specifically
        if (res.status === 429) {
          const retryAfter = errorData.retryAfter || '1 minute';
          throw new Error(`Rate limit exceeded. You can only perform one scan per minute. Please wait ${retryAfter} before trying again.`);
        }

        throw new Error(errorData.error || errorData.details || `HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      console.log('📋 Backend Response:', data);
      setLoadingProgress(20);
      setLoadingStage('Scan request accepted...');

      // ✅ Fixed: Check for both possible response formats
      const analysisId = data.analysisId || data.data?.id;

      if (!analysisId) {
        throw new Error(data.error || data.details || "No analysisId in response");
      }

      console.log('✅ Analysis ID received:', analysisId);
      setLoadingProgress(30);
      setLoadingStage('Running VirusTotal security scan...');

      // 2. Poll for combined analysis result (VirusTotal + PageSpeed + Gemini)
      let attempts = 0;
      const maxAttempts = 30; // Max 30 attempts (60 seconds) - increased for combined analysis

      const pollAnalysis = async () => {
        attempts++;
        console.log(`📊 Polling attempt ${attempts}/${maxAttempts}...`);

        // Update progress: 30% to 90% over polling attempts
        const progressIncrement = 60 / maxAttempts; // 60% divided by max attempts
        const currentProgress = Math.min(30 + (attempts * progressIncrement), 90);
        setLoadingProgress(Math.floor(currentProgress));

        try {
          const analysisRes = await fetch(
            getApiUrl(`api/vt/combined-analysis/${analysisId}`),
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
            setLoadingProgress(100);
            setLoadingStage('Analysis complete! Loading results...');

            // Wait a brief moment to show 100%, then reset
            setTimeout(() => {
              setReport(analysisData);
              setLoading(false);
              setLoadingProgress(0); // Reset progress bar
              setLoadingStage('');
            }, 500);
          } else if (status === 'failed') {
            throw new Error('Analysis failed: ' + (analysisData.error || 'Unknown error'));
          } else if (attempts >= maxAttempts) {
            throw new Error('Analysis timeout. Please check back later.');
          } else {
            // Update loading message based on status
            let statusMessage = 'Analyzing...';
            if (status === 'queued' || status === 'pending') {
              statusMessage = 'Running VirusTotal security scan... (Step 1/4)';
              setLoadingStage(statusMessage);
            } else if (status === 'combining') {
              statusMessage = 'Analyzing performance & security headers... (Step 3/4)';
              setLoadingStage(statusMessage);
              setLoadingProgress(Math.min(currentProgress + 10, 95)); // Boost progress when combining
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
      console.error('❌ Analysis error:', err);

      // Provide more helpful error messages
      let errorMessage = "Analysis failed: ";

      if (err.message === 'Failed to fetch') {
        errorMessage += "Cannot connect to backend server. Please ensure the backend is running on http://localhost:3001";
      } else if (err.message.includes('NetworkError')) {
        errorMessage += "Network error. Check your internet connection and ensure backend is running.";
      } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        errorMessage += "Authentication failed. Please log in again.";
        localStorage.removeItem('token');
        setTimeout(() => navigate('/login'), 2000);
      } else if (err.message.includes('429') || err.message.includes('rate limit') || err.message.includes('Rate limit')) {
        // Rate limit error - show the full message as it contains helpful info
        errorMessage = err.message;
      } else {
        errorMessage += err.message;
      }

      setError(errorMessage);
      setLoading(false);
      setLoadingProgress(0); // Reset progress bar on error
      setLoadingStage('');
    }
  };

  const renderReport = () => {
    if (loading) {
      return (
        <div className="loading-message">
          <p>🔍 {loadingStage || 'Analyzing URL...'}</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--foreground-darker)', marginTop: '0.5rem' }}>
            This may take 30-60 seconds (VirusTotal + PageSpeed + Observatory + AI Analysis)
          </p>
          <div style={{
            marginTop: '1rem',
            padding: '0.5rem',
            background: 'var(--card-bg)',
            borderRadius: '4px',
            fontSize: '0.85rem'
          }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Analysis Steps:</strong>
            </div>
            <div style={{ paddingLeft: '1rem' }}>
              <div style={{ opacity: loadingProgress >= 30 ? 1 : 0.5 }}>
                {loadingProgress >= 30 ? '✓' : '○'} Step 1: VirusTotal Security Scan
              </div>
              <div style={{ opacity: loadingProgress >= 60 ? 1 : 0.5 }}>
                {loadingProgress >= 60 ? '✓' : '○'} Step 2: PageSpeed Analysis
              </div>
              <div style={{ opacity: loadingProgress >= 75 ? 1 : 0.5 }}>
                {loadingProgress >= 75 ? '✓' : '○'} Step 3: Security Headers Check
              </div>
              <div style={{ opacity: loadingProgress >= 90 ? 1 : 0.5 }}>
                {loadingProgress >= 90 ? '✓' : '○'} Step 4: AI Report Generation
              </div>
            </div>
          </div>
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
    const observatoryData = report?.observatoryData || null;
    const refinedReport = report?.refinedReport;
    const engines = report?.vtResult?.data?.attributes?.results || {};

    // Debug: Log observatory data (comment out in production)
    // console.log('🔍 Observatory Data:', observatoryData);
    // console.log('🔍 Observatory Result from backend:', report?.observatoryResult);
    // console.log('🔍 Full Report:', report);

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

    // Function to get Observatory grade color
    const getObservatoryGradeColor = (grade) => {
      if (!grade) return '#888';
      const gradeColors = {
        'A+': '#00d084', 'A': '#00d084', 'A-': '#00d084',
        'B+': '#7fba00', 'B': '#7fba00', 'B-': '#7fba00',
        'C+': '#ffb900', 'C': '#ffb900', 'C-': '#ffb900',
        'D+': '#ff8c00', 'D': '#ff8c00', 'D-': '#ff8c00',
        'F': '#e81123'
      };
      return gradeColors[grade] || '#888';
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
            fontSize: '0.9rem',
            textAlign: 'justify'
          }}>
            <h4 style={{ marginTop: 0, color: 'var(--accent)' }}>🤖 AI-Generated Analysis Summary</h4>
            <div>
              {(() => {
                // Clean up markdown code blocks and markdown symbols
                let cleanReport = refinedReport;

                // Remove code block wrappers
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

                // Remove markdown heading symbols (# ## ###)
                cleanReport = cleanReport.replace(/^#{1,6}\s+/gm, '');

                return cleanReport;
              })()}
            </div>
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

          {observatoryData && (
            <div style={{
              background: 'var(--card-bg)',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>🔒 Security Config</h4>
              <span style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: getObservatoryGradeColor(observatoryData.grade)
              }}>
                {observatoryData.grade}
              </span>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Mozilla Observatory
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--foreground-darker)' }}>
                {observatoryData.tests_passed}/{observatoryData.tests_quantity} tests passed
              </p>
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

        {/* Observatory Detailed Section */}
        {observatoryData ? (
          <div className="report-summary" style={{ marginTop: '2rem' }}>
            <h4>🔒 Mozilla Observatory Security Configuration</h4>
            <p><b>Security Grade:</b> <span style={{ color: getObservatoryGradeColor(observatoryData.grade), fontWeight: 'bold', fontSize: '1.2rem' }}>{observatoryData.grade}</span></p>
            <p><b>Score:</b> {observatoryData.score}/100</p>
            <p><b>Tests Passed:</b> {observatoryData.tests_passed}/{observatoryData.tests_quantity}</p>
            <p><b>Tests Failed:</b> {observatoryData.tests_failed}/{observatoryData.tests_quantity}</p>
            <p>
              <b>View Full Report:</b>{" "}
              <a
                href={`https://developer.mozilla.org/en-US/observatory/analyze?host=${encodeURIComponent(new URL(report.target).hostname)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--accent)',
                  textDecoration: 'underline',
                  fontWeight: 'bold'
                }}
              >
                Mozilla Observatory Report ↗
              </a>
            </p>
          </div>
        ) : (
          <div className="report-summary" style={{ marginTop: '2rem', opacity: 0.7 }}>
            <h4>🔒 Mozilla Observatory Security Configuration</h4>
            <p style={{ color: '#888' }}>
              <i>Observatory scan data not available for this URL.</i>
            </p>
            <p>
              <b>Manual Scan:</b>{" "}
              <a
                href={`https://developer.mozilla.org/en-US/observatory/analyze?host=${encodeURIComponent(new URL(report.target).hostname)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--accent)',
                  textDecoration: 'underline',
                  fontWeight: 'bold'
                }}
              >
                Run Mozilla Observatory Scan ↗
              </a>
            </p>
          </div>
        )}

        {/* Detailed Engine Results (Collapsible) - DO NOT TRANSLATE */}
        <details style={{ marginTop: '2rem' }} data-no-translate>
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
            <button
              type="submit"
              disabled={loading}
              className={loading ? 'analyzing' : ''}
              style={{
                '--progress': `${loadingProgress}%`
              }}
            >
              {loading && (
                <div className="progress-percentage">{loadingProgress}%</div>
              )}
              <span className="button-text">
                {loading ? 'Analyzing...' : 'Analyze URL'}
              </span>
            </button>
          </div>
        </form>

        {renderReport()}
      </div>
    </section>
  );
};

export default Hero;