import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/TranslationContext';
import '../styles/Hero.scss';       // Keeping your styles
import '../styles/HeroReport.scss'; // Keeping your report styles

const PassiveScanner = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { currentLang, translatePage, setHasReport } = useTranslation();

  useEffect(() => {
    if (report) {
      setHasReport(true);
      if (currentLang === 'ja') {
        console.log('📊 Report loaded in Japanese mode, translating...');
        setTimeout(() => {
          translatePage('ja');
        }, 500);
      }
    } else {
      setHasReport(false);
    }
  }, [report, currentLang, translatePage, setHasReport]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = e.target.elements.url.value;
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

    try {
      console.log('🔍 Submitting URL for scan:', url);
      setLoadingProgress(10);
      setLoadingStage('Submitting URL to security scanners...');

      const res = await fetch('/api/vt/combined-url-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        if (res.status === 429) {
          const retryAfter = errorData.retryAfter || '1 minute';
          throw new Error(`Rate limit exceeded. You can only perform one scan per minute. Please wait ${retryAfter} before trying again.`);
        }
        throw new Error(errorData.error || errorData.details || `HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setLoadingProgress(20);
      setLoadingStage('Scan request accepted...');

      const analysisId = data.analysisId || data.data?.id;
      if (!analysisId) throw new Error(data.error || data.details || "No analysisId in response");

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
          const analysisRes = await fetch(
            `/api/vt/combined-analysis/${analysisId}`,
            { headers: { 'x-auth-token': token } }
          );
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
            if (status === 'queued' || status === 'pending') {
              statusMessage = 'Running VirusTotal security scan... (Step 1/4)';
              setLoadingStage(statusMessage);
            } else if (status === 'combining') {
              statusMessage = 'Analyzing performance & security headers... (Step 3/4)';
              setLoadingStage(statusMessage);
              setLoadingProgress(Math.min(currentProgress + 10, 95));
            }
            setTimeout(pollAnalysis, 2000);
          }
        } catch (pollError) {
          throw pollError;
        }
      };
      await pollAnalysis();
    } catch (err) {
      console.error('❌ Analysis error:', err);
      let errorMessage = "Analysis failed: ";
      if (err.message === 'Failed to fetch') {
        errorMessage += "Cannot connect to backend server. Please ensure the backend is running on http://localhost:3001";
      } else if (err.message.includes('NetworkError')) {
        errorMessage += "Network error. Check your internet connection and ensure backend is running.";
      } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        errorMessage += "Authentication failed. Please log in again.";
        localStorage.removeItem('token');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        errorMessage += err.message;
      }
      setError(errorMessage);
      setLoading(false);
      setLoadingProgress(0);
      setLoadingStage('');
    }
  };

  // Helper functions for rendering
  const getScoreClass = (score) => {
    if (score >= 90) return 'score-good';
    if (score >= 50) return 'score-medium';
    return 'score-poor';
  };

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

  const renderReport = () => {
    if (loading) {
      return (
        <div className="loading-message">
          <p>🔍 {loadingStage || 'Analyzing URL...'}</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--foreground-darker)', marginTop: '0.5rem' }}>
            This may take 30-60 seconds (VirusTotal + PageSpeed + Observatory + AI Analysis)
          </p>
          <div style={{ marginTop: '1rem', padding: '0.5rem', background: 'var(--card-bg)', borderRadius: '4px', fontSize: '0.85rem' }}>
            <div style={{ marginBottom: '0.5rem' }}><strong>Analysis Steps:</strong></div>
            <div style={{ paddingLeft: '1rem' }}>
              <div style={{ opacity: loadingProgress >= 30 ? 1 : 0.5 }}>{loadingProgress >= 30 ? '✓' : '○'} Step 1: VirusTotal Security Scan</div>
              <div style={{ opacity: loadingProgress >= 60 ? 1 : 0.5 }}>{loadingProgress >= 60 ? '✓' : '○'} Step 2: PageSpeed Analysis</div>
              <div style={{ opacity: loadingProgress >= 75 ? 1 : 0.5 }}>{loadingProgress >= 75 ? '✓' : '○'} Step 3: Security Headers Check</div>
              <div style={{ opacity: loadingProgress >= 90 ? 1 : 0.5 }}>{loadingProgress >= 90 ? '✓' : '○'} Step 4: AI Report Generation</div>
            </div>
          </div>
        </div>
      );
    }

    if (error) return <p className="error-msg">{error}</p>;
    if (!report) return null;

    const vtStats = report?.vtStats || {};
    const psiScores = report?.psiScores || {};
    const observatoryData = report?.observatoryData || null;
    const refinedReport = report?.refinedReport;
    const engines = report?.vtResult?.data?.attributes?.results || {};

    const categoryDescriptions = { malicious: "High Risk", suspicious: "Potential Risk", harmless: "No Risk Detected", undetected: "No Info Available" };
    const totalEngines = Object.keys(engines).length;
    const maliciousCount = vtStats.malicious || 0;
    const suspiciousCount = vtStats.suspicious || 0;
    const maliciousPercentage = totalEngines > 0 ? ((maliciousCount / totalEngines) * 100).toFixed(1) : 0;

    let riskLevel = "Safe";
    let riskClass = "risk-safe";
    if (maliciousPercentage > 50) { riskLevel = "High Risk"; riskClass = "risk-high"; }
    else if (maliciousPercentage > 10) { riskLevel = "Medium Risk"; riskClass = "risk-medium"; }
    else if (maliciousPercentage > 0) { riskLevel = "Low Risk"; riskClass = "risk-low"; }

    return (
      <div className="report-container" style={{marginTop: '2rem'}}>
        <h3 className="report-title">📊 Combined Scan Report for {report.target}</h3>
        <p>Status: <b>{report.status}</b></p>

        {refinedReport && (
          <div className="ai-report-section" style={{ background: 'var(--card-bg)', padding: '1.5rem', marginBottom: '2rem', borderRadius: '8px', border: '2px solid var(--accent)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '0.9rem', textAlign: 'justify' }}>
            <h4 style={{ marginTop: 0, color: 'var(--accent)' }}>🤖 AI-Generated Analysis Summary</h4>
            <div>
              {(() => {
                let cleanReport = refinedReport;
                if (cleanReport.startsWith('```markdown')) cleanReport = cleanReport.substring('```markdown\n'.length);
                else if (cleanReport.startsWith('```')) cleanReport = cleanReport.substring('```\n'.length);
                if (cleanReport.endsWith('```\n')) cleanReport = cleanReport.substring(0, cleanReport.length - 4);
                else if (cleanReport.endsWith('```')) cleanReport = cleanReport.substring(0, cleanReport.length - 3);
                cleanReport = cleanReport.replace(/^#{1,6}\s+/gm, '');
                return cleanReport;
              })()}
            </div>
          </div>
        )}

        <div className="combined-scores" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🛡️ Security</h4>
            <span className={`risk-level ${riskClass}`} style={{ fontSize: '1.5rem' }}>{riskLevel}</span>
            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{maliciousCount}/{totalEngines} malicious</p>
          </div>
          {psiScores.performance !== null && <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}><h4 style={{ margin: '0 0 0.5rem 0' }}>⚡ Performance</h4><span className={getScoreClass(psiScores.performance)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{psiScores.performance}</span><p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p></div>}
          {psiScores.accessibility !== null && <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}><h4 style={{ margin: '0 0 0.5rem 0' }}>♿ Accessibility</h4><span className={getScoreClass(psiScores.accessibility)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{psiScores.accessibility}</span><p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p></div>}
          {observatoryData && <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}><h4 style={{ margin: '0 0 0.5rem 0' }}>🔒 Security Config</h4><span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: getObservatoryGradeColor(observatoryData.grade) }}>{observatoryData.grade}</span><p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Mozilla Observatory</p></div>}
        </div>

        <details style={{ marginTop: '2rem' }} data-no-translate>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px' }}>📋 View Detailed Engine Results ({totalEngines} engines)</summary>
          <table className="report-table" style={{ marginTop: '1rem' }}>
            <thead><tr><th>Engine</th><th>Method</th><th>Result</th></tr></thead>
            <tbody>
              {Object.entries(engines).map(([engine, val], index) => (
                <tr key={engine} className={index % 2 === 0 ? "even-row" : "odd-row"}>
                  <td>{engine}</td><td>{val.method || "-"}</td><td>{val.result || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    );
  };

  // Reuse the Hero layout for the scanner page for consistency
  return (
    <section className="hero-container">
      <div className="hero-content">
        <h1 className="hero-title">Passive <span className="highlight">Security Scan</span></h1>
        <p className="hero-subtitle">Analyze reputation, SSL, and performance without attacking.</p>
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
      </div>
    </section>
  );
};

export default PassiveScanner;