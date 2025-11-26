import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Hero.scss';
import '../styles/HeroReport.scss';

const Hero = () => {
  const [pageSpeedReport, setPageSpeedReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [zapReport, setZapReport] = useState(null);
  const [zapLoading, setZapLoading] = useState(false);
  const [zapError, setZapError] = useState(null);

  const navigate = useNavigate();
<<<<<<< HEAD
=======
  const { currentLang, translatePage, setHasReport } = useTranslation();

  // Re-translate when report loads
  useEffect(() => {
    if (report || zapReport) {
      setHasReport(true);
      if (currentLang === 'ja') {
        setTimeout(() => {
          translatePage('ja');
        }, 500);
      }
    } else {
      setHasReport(false);
    }
  }, [report, zapReport, currentLang, translatePage, setHasReport]);

  // ⚡ Helper: Run ZAP Scan independently
  const runZapScan = async (url, token) => {
    try {
      console.log('⚡ Starting ZAP Active Scan for:', url);
      setZapLoading(true);
      setZapReport(null);
      setZapError(null);

      const res = await fetch('/api/zap/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      
      if (data.success || data.data) {
        setZapReport(data.data || data); 
      } else {
        console.warn("ZAP Scan returned no data");
      }
    } catch (err) {
      console.error('❌ ZAP Error:', err);
      setZapError(err.message);
    } finally {
      setZapLoading(false);
    }
  };
>>>>>>> ae0d637 (Integrated OWASP ZAP Active Scan with Docker)

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = e.target.elements.url.value;
<<<<<<< HEAD
=======

>>>>>>> ae0d637 (Integrated OWASP ZAP Active Scan with Docker)
    const token = localStorage.getItem('token');

    if (!token) {
<<<<<<< HEAD
      alert('Please log in first to analyze a URL');
=======
>>>>>>> ae0d637 (Integrated OWASP ZAP Active Scan with Docker)
      navigate('/login');
      return;
    }

    setLoading(true);
    setError(null);
<<<<<<< HEAD
    setPageSpeedReport(null);

    try {
      const res = await fetch('http://localhost:3002/api/pagespeed/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token,
=======
    setReport(null);
    
    // ⚡ Trigger ZAP Scan in background (Parallel)
    runZapScan(url, token);

    try {
      console.log('🔍 Submitting URL for scan:', url);
      setLoadingProgress(10);
      setLoadingStage('Submitting URL to security scanners...');

      const res = await fetch('/api/vt/combined-url-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
>>>>>>> ae0d637 (Integrated OWASP ZAP Active Scan with Docker)
        },
        body: JSON.stringify({ url, strategy: 'desktop' }), // Specifying strategy
      });

      if (!res.ok) {
<<<<<<< HEAD
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
      }

      const pageSpeedData = await res.json();

      // Check for API-specific errors in the response
      if (pageSpeedData.error) {
        throw new Error(pageSpeedData.error.message);
      }
      
      setPageSpeedReport(pageSpeedData);

    } catch (err) {
      console.error('Analysis error:', err);
      setError("Analysis failed: " + err.message);
    } finally {
      setLoading(false);
=======
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        if (res.status === 429) {
          const retryAfter = errorData.retryAfter || '1 minute';
          throw new Error(`Rate limit exceeded. Please wait ${retryAfter}.`);
        }
        throw new Error(errorData.error || errorData.details || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setLoadingProgress(20);
      setLoadingStage('Scan request accepted...');

      const analysisId = data.analysisId || data.data?.id;
      if (!analysisId) throw new Error("No analysisId in response");

      setLoadingProgress(30);
      setLoadingStage('Running VirusTotal security scan...');

      let attempts = 0;
      const maxAttempts = 30;

      const pollAnalysis = async () => {
        attempts++;
        const progressIncrement = 60 / maxAttempts;
        const currentProgress = Math.min(30 + (attempts * progressIncrement), 90);
        setLoadingProgress(Math.floor(currentProgress));

        try {
          const analysisRes = await fetch(`/api/vt/combined-analysis/${analysisId}`, {
            headers: { 'x-auth-token': token }
          });
          const analysisData = await analysisRes.json();
          const status = analysisData.status;

          if (status === 'completed') {
            setLoadingProgress(100);
            setLoadingStage('Analysis complete! Loading results...');
            setTimeout(() => {
              setReport(analysisData);
              setLoading(false);
              setLoadingProgress(0);
              setLoadingStage('');
            }, 500);
          } else if (status === 'failed') {
            throw new Error('Analysis failed: ' + (analysisData.error || 'Unknown error'));
          } else if (attempts >= maxAttempts) {
            throw new Error('Analysis timeout. Please check back later.');
          } else {
            let statusMessage = 'Analyzing...';
            if (status === 'queued') statusMessage = 'Running VirusTotal security scan... (Step 1/4)';
            else if (status === 'combining') {
                statusMessage = 'Analyzing headers & AI... (Step 3/4)';
                setLoadingProgress(Math.min(currentProgress + 10, 95));
            }
            setLoadingStage(statusMessage);
            setTimeout(pollAnalysis, 2000);
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
          throw pollError;
        }
      };

      await pollAnalysis();

    } catch (err) {
      console.error('Analysis error:', err);
      let errorMessage = "Analysis failed: ";
      if (err.message.includes('429')) errorMessage = err.message;
      else errorMessage += err.message;
      
      setError(errorMessage);
      setLoading(false);
      setLoadingProgress(0);
>>>>>>> ae0d637 (Integrated OWASP ZAP Active Scan with Docker)
    }
  };

  const renderPageSpeedReport = () => {
    if (loading) {
      return (
        <div className="loading-message">
<<<<<<< HEAD
          <p>Analyzing URL with PageSpeed Insights...</p>
=======
          <p>🔍 {loadingStage || 'Analyzing URL...'}</p>
          <div style={{
            marginTop: '1rem',
            padding: '0.5rem',
            background: 'var(--card-bg)',
            borderRadius: '4px',
            fontSize: '0.85rem'
          }}>
            <div style={{ marginBottom: '0.5rem' }}><strong>Analysis Steps:</strong></div>
            <div style={{ paddingLeft: '1rem' }}>
              <div style={{ opacity: loadingProgress >= 30 ? 1 : 0.5 }}>{loadingProgress >= 30 ? '✓' : '○'} VirusTotal Security Scan</div>
              <div style={{ opacity: loadingProgress >= 60 ? 1 : 0.5 }}>{loadingProgress >= 60 ? '✓' : '○'} PageSpeed Analysis</div>
              <div style={{ opacity: loadingProgress >= 90 ? 1 : 0.5 }}>{loadingProgress >= 90 ? '✓' : '○'} AI Report Generation</div>
              <div style={{  opacity: loadingProgress >= 90 ? 1 : 0.5 }}>{loadingProgress >= 90 ? '✓' : '○'}{zapLoading ? ' OWASP ZAP Active Scan (Running in background...)' : (zapReport ? '✓ OWASP ZAP Scan Complete' : '○ OWASP ZAP Scan')}
              </div>
            </div>
          </div>
>>>>>>> ae0d637 (Integrated OWASP ZAP Active Scan with Docker)
        </div>
      );
    }

<<<<<<< HEAD
    if (error) {
      return <p className="error-msg">{error}</p>;
    }

    // **This is the critical fix:** Check if lighthouseResult exists before rendering
    if (!pageSpeedReport || !pageSpeedReport.lighthouseResult) {
      return null;
    }

    const { categories } = pageSpeedReport.lighthouseResult;
    const performanceScore = categories.performance.score * 100;
    const accessibilityScore = categories.accessibility.score * 100;
    const bestPracticesScore = categories['best-practices'].score * 100;
    const seoScore = categories.seo.score * 100;
=======
    if (error) return <p className="error-msg">{error}</p>;
    if (!report) return null;

    const vtStats = report?.vtStats || {};
    const psiScores = report?.psiScores || {};
    const observatoryData = report?.observatoryData || null;
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
    const maliciousPercentage = totalEngines > 0 ? ((maliciousCount / totalEngines) * 100).toFixed(1) : 0;

    let riskLevel = "Safe";
    let riskClass = "risk-safe";
    if (maliciousPercentage > 50) { riskLevel = "High Risk"; riskClass = "risk-high"; }
    else if (maliciousPercentage > 10) { riskLevel = "Medium Risk"; riskClass = "risk-medium"; }
    else if (maliciousPercentage > 0) { riskLevel = "Low Risk"; riskClass = "risk-low"; }

    const getScoreClass = (score) => score >= 90 ? 'score-good' : score >= 50 ? 'score-medium' : 'score-poor';
    const getObservatoryGradeColor = (grade) => {
      if (!grade) return '#888';
      const map = { 'A': '#00d084', 'B': '#7fba00', 'C': '#ffb900', 'D': '#ff8c00', 'F': '#e81123' };
      return map[grade[0]] || '#888';
    };
>>>>>>> ae0d637 (Integrated OWASP ZAP Active Scan with Docker)

    // ⚡ ZAP Helpers
    const getZapRiskColor = (risk) => {
      switch (risk) {
        case 'High': return '#e81123';
        case 'Medium': return '#ff8c00'; 
        case 'Low': return '#ffb900';
        default: return '#00d084';
      }
    };

    let zapRiskLabel = "Passed";
    let zapRiskColor = "#00d084";
    if (zapReport && zapReport.riskCounts) {
       if (zapReport.riskCounts.High > 0) { zapRiskLabel = "High Risk"; zapRiskColor = "#e81123"; }
       else if (zapReport.riskCounts.Medium > 0) { zapRiskLabel = "Medium Risk"; zapRiskColor = "#ff8c00"; }
       else if (zapReport.riskCounts.Low > 0) { zapRiskLabel = "Low Risk"; zapRiskColor = "#ffb900"; }
    }

    return (
      <div className="report-container">
<<<<<<< HEAD
        <h3 className="report-title">PageSpeed Insights Report</h3>
        <div className="report-summary">
          <p><b>Performance Score:</b> {performanceScore.toFixed(0)}</p>
          <p><b>Accessibility Score:</b> {accessibilityScore.toFixed(0)}</p>
          <p><b>Best Practices Score:</b> {bestPracticesScore.toFixed(0)}</p>
          <p><b>SEO Score:</b> {seoScore.toFixed(0)}</p>
        </div>
=======
        <h3 className="report-title">📊 Combined Scan Report for {report.target}</h3>
        <p>Status: <b>{report.status}</b></p>

        {/* AI Summary */}
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
            {refinedReport.replace(/```markdown|```/g, '').replace(/^#{1,6}\s+/gm, '')}
          </div>
        )}

        {/* Combined Scores Grid */}
        <div className="combined-scores" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {/* Security (VirusTotal) */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🛡️ Security</h4>
            <span className={`risk-level ${riskClass}`} style={{ fontSize: '1.5rem' }}>{riskLevel}</span>
            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{maliciousCount}/{totalEngines} malicious</p>
          </div>

          {/* ⚡ NEW: OWASP ZAP Score Card */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: zapLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>⚡ OWASP ZAP</h4>
            {zapLoading ? (
               <div style={{ color: 'var(--accent)', fontSize: '1.2rem', marginTop: '10px' }}>Scanning...</div>
            ) : zapReport ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: zapRiskColor }}>{zapRiskLabel}</span>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{zapReport.alerts ? zapReport.alerts.length : 0} Alerts</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>{zapError ? 'Scan Failed' : 'Waiting...'}</div>
            )}
          </div>

          {/* Performance (PSI) */}
          {psiScores.performance !== null && (
            <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>⚡ Performance</h4>
              <span className={getScoreClass(psiScores.performance)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{psiScores.performance}</span>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p>
            </div>
          )}

          {/* Accessibility */}
          {psiScores.accessibility !== null && (
             <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
               <h4 style={{ margin: '0 0 0.5rem 0' }}>♿ Accessibility</h4>
               <span className={getScoreClass(psiScores.accessibility)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{psiScores.accessibility}</span>
               <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p>
             </div>
          )}

          {/* Best Practices */}
          {psiScores.bestPractices !== null && (
             <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
               <h4 style={{ margin: '0 0 0.5rem 0' }}>✅ Best Practices</h4>
               <span className={getScoreClass(psiScores.bestPractices)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{psiScores.bestPractices}</span>
               <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p>
             </div>
          )}

          {/* SEO */}
          {psiScores.seo !== null && (
             <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
               <h4 style={{ margin: '0 0 0.5rem 0' }}>🔍 SEO</h4>
               <span className={getScoreClass(psiScores.seo)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{psiScores.seo}</span>
               <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p>
             </div>
          )}

          {/* Security Config (Observatory) */}
          {observatoryData && (
            <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>🔒 Security Config</h4>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: getObservatoryGradeColor(observatoryData.grade) }}>{observatoryData.grade}</span>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Mozilla Observatory</p>
            </div>
          )}
        </div>

        {/* ⚡ NEW: OWASP ZAP Detailed Results */}
        {zapReport && zapReport.alerts && (
          <details style={{ marginBottom: '2rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
              ⚡ View OWASP ZAP Vulnerabilities ({zapReport.alerts.length})
            </summary>
            {zapReport.alerts.length === 0 ? (
               <div style={{ padding: '1rem', color: '#00d084' }}>No active vulnerabilities found. Good job!</div>
            ) : (
              <table className="report-table" style={{ marginTop: '1rem' }}>
                <thead>
                  <tr>
                    <th>Risk</th>
                    <th>Alert</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {zapReport.alerts.map((alert, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "even-row" : "odd-row"}>
                      <td style={{ fontWeight: 'bold', color: getZapRiskColor(alert.risk) }}>{alert.risk}</td>
                      <td>{alert.alert}</td>
                      <td style={{ fontSize: '0.9em' }}>{alert.description ? alert.description.substring(0, 150) + "..." : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </details>
        )}

        {/* Existing VirusTotal Summary */}
        <div className="report-summary">
          <h4>🔒 VirusTotal Security Details</h4>
          <p><b>Total engines scanned:</b> {totalEngines}</p>
          <p><b>Malicious detections:</b> {maliciousCount} ({maliciousPercentage}%)</p>
          <p><b>Suspicious detections:</b> {suspiciousCount}</p>
          <p><b>Risk Level:</b> <span className={`risk-level ${riskClass}`}>{riskLevel}</span></p>
        </div>

        {/* Existing Observatory Summary */}
        {observatoryData ? (
          <div className="report-summary" style={{ marginTop: '2rem' }}>
            <h4>🔒 Mozilla Observatory Security Configuration</h4>
            <p><b>Security Grade:</b> <span style={{ color: getObservatoryGradeColor(observatoryData.grade), fontWeight: 'bold', fontSize: '1.2rem' }}>{observatoryData.grade}</span></p>
            <p><b>Score:</b> {observatoryData.score}/100</p>
            <p><b>Tests Passed:</b> {observatoryData.tests_passed}/{observatoryData.tests_quantity}</p>
            <p><b>Tests Failed:</b> {observatoryData.tests_failed}/{observatoryData.tests_quantity}</p>
            <p>
              <b>View Full Report:</b>{" "}
              <a href={`https://developer.mozilla.org/en-US/observatory/analyze?host=${encodeURIComponent(new URL(report.target).hostname)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: 'bold' }}>
                Mozilla Observatory Report ↗
              </a>
            </p>
          </div>
        ) : (
          <div className="report-summary" style={{ marginTop: '2rem', opacity: 0.7 }}>
            <h4>🔒 Mozilla Observatory Security Configuration</h4>
            <p style={{ color: '#888' }}><i>Observatory scan data not available for this URL.</i></p>
            <p>
              <b>Manual Scan:</b>{" "}
              <a href={`https://developer.mozilla.org/en-US/observatory/analyze?host=${encodeURIComponent(new URL(report.target).hostname)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: 'bold' }}>
                Run Mozilla Observatory Scan ↗
              </a>
            </p>
          </div>
        )}

        {/* Detailed Engine Results */}
        <details style={{ marginTop: '2rem' }} data-no-translate>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px' }}>
            📋 View Detailed Engine Results ({totalEngines} engines)
          </summary>
          <table className="report-table" style={{ marginTop: '1rem' }}>
            <thead>
              <tr><th>Engine</th><th>Method</th><th>Category</th><th>Meaning</th><th>Result</th></tr>
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
                <tr><td colSpan={5} className="no-results">No engine results available yet. Analysis may still be processing.</td></tr>
              )}
            </tbody>
          </table>
        </details>
>>>>>>> ae0d637 (Integrated OWASP ZAP Active Scan with Docker)
      </div>
    );
  };

  return (
    <section className="hero-container">
      <div className="hero-content">
<<<<<<< HEAD
        <h1 className="hero-title">
          We give you <span className="highlight">X-Ray Vision</span> for your Website
        </h1>
        <p className="hero-subtitle">
          Get key performance and quality metrics for your site.
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
        {renderPageSpeedReport()}
=======
        <h1 className="hero-title">We give you <span className="highlight">X-Ray Vision</span> for your Website</h1>
        <p className="hero-subtitle">In just 20 seconds, you can see what <span className="highlight">attackers already know</span></p>
        <form className="analyze-form" onSubmit={handleSubmit}>
          <label htmlFor="url-input">Enter a URL to start 👇</label>
          <div className="input-wrapper">
            <input id="url-input" name="url" type="text" placeholder="E.g. https://google.com" defaultValue="https://google.com" required />
            <button type="submit" disabled={loading} className={loading ? 'analyzing' : ''} style={{ '--progress': `${loadingProgress}%` }}>
              {loading && <div className="progress-percentage">{loadingProgress}%</div>}
              <span className="button-text">{loading ? 'Analyzing...' : 'Analyze URL'}</span>
            </button>
          </div>
        </form>
        {renderReport()}
>>>>>>> ae0d637 (Integrated OWASP ZAP Active Scan with Docker)
      </div>
    </section>
  );
};

export default Hero;