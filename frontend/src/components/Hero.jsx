import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/TranslationContext';
import '../styles/Hero.scss';
import '../styles/HeroReport.scss';

// Define API Base URL to avoid port mismatch issues
const API_BASE = 'http://localhost:3001';

const Hero = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState(null);

  // ⚡ ZAP Specific State
  const [zapReport, setZapReport] = useState(null);
  const [zapLoading, setZapLoading] = useState(false);
  const [zapError, setZapError] = useState(null);

  // 🔍 WebCheck Specific State
  const [webCheckReport, setWebCheckReport] = useState(null);
  const [webCheckLoading, setWebCheckLoading] = useState(false);
  const [webCheckError, setWebCheckError] = useState(null);

  const navigate = useNavigate();
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
  }, [report, zapReport, webCheckReport, currentLang, translatePage, setHasReport]);

  // ⚡ Helper: Run ZAP Scan independently
  const runZapScan = async (url, token) => {
    try {
      console.log('⚡ Starting ZAP Active Scan for:', url);
      setZapLoading(true);
      setZapReport(null);
      setZapError(null);

      // 👇 FIXED: Use API_BASE (port 3001)
      const res = await fetch(`${API_BASE}/api/zap/scan`, {
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

  // 🔍 Helper: Run WebCheck Scans in parallel
  const runWebCheckScans = async (url, token) => {
    const scanTypes = ['ssl', 'dns', 'headers', 'http-security', 'tech-stack', 'firewall', 'cookies', 'robots-txt', 'ports'];

    try {
      console.log('🔍 Starting WebCheck scans for:', url);
      setWebCheckLoading(true);
      setWebCheckReport(null);
      setWebCheckError(null);

      // Run all scans in parallel
      const results = await Promise.allSettled(
        scanTypes.map(async (type) => {
          try {
            const res = await fetch(`${API_BASE}/api/webcheck/scan`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
              },
              body: JSON.stringify({ url, type }),
            });
            const data = await res.json();
            return { type, success: data.success, data: data.data || data };
          } catch (err) {
            return { type, success: false, error: err.message };
          }
        })
      );

      // Collect results
      const scanResults = {};
      results.forEach((result, index) => {
        const type = scanTypes[index];
        if (result.status === 'fulfilled' && result.value.success !== false) {
          scanResults[type] = result.value.data;
        } else {
          scanResults[type] = { error: result.reason?.message || result.value?.error || 'Scan failed' };
        }
      });

      setWebCheckReport(scanResults);
      console.log('🔍 WebCheck scans complete:', Object.keys(scanResults).length, 'results');
    } catch (err) {
      console.error('❌ WebCheck Error:', err);
      setWebCheckError(err.message);
    } finally {
      setWebCheckLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = e.target.elements.url.value;
    const token = localStorage.getItem('token');

    if (!token) {
      navigate('/login');
      return;
    }

    setLoading(true);
    setLoadingProgress(0);
    setLoadingStage('Initializing scan...');
    setError(null);
    setReport(null);

    // ⚡ Trigger ZAP Scan in background (Parallel)
    runZapScan(url, token);

    // 🔍 Trigger WebCheck Scans in background (Parallel)
    runWebCheckScans(url, token);

    try {
      console.log('🔍 Submitting URL for scan:', url);
      setLoadingProgress(10);
      setLoadingStage('Submitting URL to security scanners...');

      // 👇 FIXED: Use API_BASE (port 3001)
      const res = await fetch(`${API_BASE}/api/vt/combined-url-scan`, {
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
      const maxAttempts = 60; // 2 minutes total with 2s intervals

      const pollAnalysis = async () => {
        attempts++;
        const progressIncrement = 60 / maxAttempts;
        const currentProgress = Math.min(30 + (attempts * progressIncrement), 90);
        setLoadingProgress(Math.floor(currentProgress));

        try {
          // 👇 FIXED: Use API_BASE (port 3001)
          const analysisRes = await fetch(`${API_BASE}/api/vt/combined-analysis/${analysisId}`, {
            headers: { 'x-auth-token': token }
          });
          const analysisData = await analysisRes.json();
          const status = analysisData.status;

          // 🚀 Progressive Loading: Update report with partial data
          if (analysisData.target) {
            setReport(prevReport => ({
              ...prevReport,
              ...analysisData,
              // Keep loading state indicators
              isPartial: status !== 'completed'
            }));
          }

          if (status === 'completed') {
            setLoadingProgress(100);
            setLoadingStage('Analysis complete!');
            setTimeout(() => {
              setLoading(false);
              setLoadingProgress(0);
              setLoadingStage('');
            }, 500);
          } else if (status === 'failed') {
            throw new Error('Analysis failed: ' + (analysisData.error || 'Unknown error'));
          } else if (attempts >= maxAttempts) {
            // Don't throw error - just stop loading, show partial results
            setLoading(false);
            setLoadingProgress(0);
            setLoadingStage('');
            console.log('Max attempts reached, showing partial results');
          } else {
            // Show progress indicators based on what we have
            let statusMessage = 'Analyzing...';
            const hasVt = analysisData.hasVtResult;
            const hasPsi = analysisData.hasPsiResult;
            const hasObs = analysisData.hasObservatoryResult;
            const hasAi = analysisData.hasRefinedReport;

            if (!hasVt) statusMessage = '🔍 Running VirusTotal scan...';
            else if (!hasPsi || !hasObs) statusMessage = '📊 Fetching PageSpeed & Observatory...';
            else if (!hasAi) statusMessage = '🤖 Generating AI report...';
            else statusMessage = '✅ Finalizing results...';

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
    }
  };

  // Render partial results during loading (progressive display)
  const renderPartialReport = () => {
    if (!report) return null;

    const vtStats = report?.vtStats || {};
    const psiScores = report?.psiScores || null;
    const observatoryData = report?.observatoryData || null;
    const totalEngines = report?.vtResult?.data?.attributes?.results ? Object.keys(report.vtResult.data.attributes.results).length : 0;
    const maliciousCount = vtStats?.malicious || 0;

    return (
      <div className="partial-results" style={{ marginTop: '1.5rem', opacity: 0.9 }}>
        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--accent)' }}>📊 Live Results for {report.target}</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {/* VT Security */}
          <div style={{ background: 'var(--card-bg)', padding: '0.75rem', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>🛡️ Security</div>
            {report.hasVtResult ? (
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: maliciousCount > 0 ? '#e81123' : '#00d084' }}>
                {maliciousCount}/{totalEngines}
              </div>
            ) : (
              <div style={{ color: '#888' }}>Loading...</div>
            )}
          </div>
          {/* Performance */}
          <div style={{ background: 'var(--card-bg)', padding: '0.75rem', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>⚡ Performance</div>
            {psiScores?.performance != null ? (
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: psiScores.performance >= 90 ? '#00d084' : psiScores.performance >= 50 ? '#ffb900' : '#e81123' }}>
                {psiScores.performance}
              </div>
            ) : (
              <div style={{ color: '#888' }}>Loading...</div>
            )}
          </div>
          {/* Observatory */}
          <div style={{ background: 'var(--card-bg)', padding: '0.75rem', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>🔒 Security Config</div>
            {observatoryData?.grade ? (
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{observatoryData.grade}</div>
            ) : (
              <div style={{ color: '#888' }}>Loading...</div>
            )}
          </div>
          {/* AI Report */}
          <div style={{ background: 'var(--card-bg)', padding: '0.75rem', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>🤖 AI Report</div>
            {report.hasRefinedReport ? (
              <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#00d084' }}>Ready</div>
            ) : (
              <div style={{ color: '#888' }}>Generating...</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderReport = () => {
    // Show loading state with progress checklist
    if (loading) {
      return (
        <div className="loading-message">
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
              <div style={{ opacity: report?.hasVtResult ? 1 : 0.5 }}>{report?.hasVtResult ? '✅' : '⏳'} VirusTotal Security Scan</div>
              <div style={{ opacity: report?.hasPsiResult ? 1 : 0.5 }}>{report?.hasPsiResult ? '✅' : '⏳'} PageSpeed Analysis</div>
              <div style={{ opacity: report?.hasObservatoryResult ? 1 : 0.5 }}>{report?.hasObservatoryResult ? '✅' : '⏳'} Mozilla Observatory</div>
              <div style={{ opacity: report?.hasRefinedReport ? 1 : 0.5 }}>{report?.hasRefinedReport ? '✅' : '⏳'} AI Report Generation</div>
              <div style={{ opacity: 1 }}>{zapLoading ? '⏳' : (zapReport ? '✅' : '⏳')} {zapLoading ? 'OWASP ZAP (Running...)' : (zapReport ? 'OWASP ZAP Complete' : 'OWASP ZAP Scan')}</div>
              <div style={{ opacity: 1 }}>{webCheckLoading ? '⏳' : (webCheckReport ? '✅' : '⏳')} {webCheckLoading ? 'WebCheck (Running...)' : (webCheckReport ? 'WebCheck Complete' : 'WebCheck Scans')}</div>
            </div>
          </div>

          {/* Show partial results during loading */}
          {report && report.target && renderPartialReport()}
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

          {/* 🔍 WebCheck: SSL Certificate */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🔐 SSL Certificate</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.ssl && !webCheckReport.ssl.error ? (
              <>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00d084' }}>Valid</span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{webCheckReport.ssl.issuer?.O || 'Unknown Issuer'}</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>{webCheckError ? 'Failed' : 'Pending'}</div>
            )}
          </div>

          {/* 🔍 WebCheck: Security Headers */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🛡️ Security Headers</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.['http-security'] && !webCheckReport['http-security'].error ? (
              <>
                {(() => {
                  const sec = webCheckReport['http-security'];
                  const passed = [sec.strictTransportPolicy, sec.xFrameOptions, sec.xContentTypeOptions, sec.xXSSProtection, sec.contentSecurityPolicy].filter(Boolean).length;
                  const color = passed >= 4 ? '#00d084' : passed >= 2 ? '#ffb900' : '#e81123';
                  return <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color }}>{passed}/5</span>;
                })()}
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Headers Present</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Tech Stack */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🛠️ Tech Stack</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.['tech-stack']?.technologies ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00d084' }}>{webCheckReport['tech-stack'].technologies.length}</span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Technologies Detected</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Firewall/WAF */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🔥 Firewall</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.firewall && !webCheckReport.firewall.error ? (
              <>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: webCheckReport.firewall.hasWaf ? '#00d084' : '#ffb900' }}>
                  {webCheckReport.firewall.hasWaf ? webCheckReport.firewall.waf : 'None Detected'}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>WAF Status</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>
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

        {/* 🔍 WebCheck Detailed Results */}
        {webCheckReport && (
          <details style={{ marginBottom: '2rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid #00d084' }}>
              🔍 View WebCheck Analysis ({Object.keys(webCheckReport).filter(k => !webCheckReport[k]?.error).length} scans complete)
            </summary>
            <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>

              {/* SSL Details */}
              {webCheckReport.ssl && !webCheckReport.ssl.error && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🔐 SSL Certificate Details</h5>
                  <p><b>Subject:</b> {webCheckReport.ssl.subject?.CN || 'N/A'}</p>
                  <p><b>Issuer:</b> {webCheckReport.ssl.issuer?.O || 'N/A'}</p>
                  <p><b>Valid From:</b> {webCheckReport.ssl.valid_from || 'N/A'}</p>
                  <p><b>Valid To:</b> {webCheckReport.ssl.valid_to || 'N/A'}</p>
                </div>
              )}

              {/* DNS Records */}
              {webCheckReport.dns && !webCheckReport.dns.error && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🌐 DNS Records</h5>
                  <p><b>A Record:</b> {webCheckReport.dns.A?.address || JSON.stringify(webCheckReport.dns.AAAA) || 'N/A'}</p>
                  <p><b>MX Records:</b> {webCheckReport.dns.MX?.length || 0} found</p>
                  <p><b>NS Records:</b> {webCheckReport.dns.NS?.length || 0} found</p>
                  <p><b>TXT Records:</b> {webCheckReport.dns.TXT?.length || 0} found</p>
                </div>
              )}

              {/* Security Headers */}
              {webCheckReport['http-security'] && !webCheckReport['http-security'].error && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🛡️ Security Headers</h5>
                  {Object.entries(webCheckReport['http-security']).map(([key, val]) => (
                    <p key={key}><b>{key}:</b> <span style={{ color: val ? '#00d084' : '#e81123' }}>{val ? '✓ Present' : '✗ Missing'}</span></p>
                  ))}
                </div>
              )}

              {/* Tech Stack */}
              {webCheckReport['tech-stack']?.technologies && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🛠️ Technology Stack</h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {webCheckReport['tech-stack'].technologies.slice(0, 15).map((tech, idx) => (
                      <span key={idx} style={{ background: 'var(--accent)', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                        {tech.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Open Ports */}
              {webCheckReport.ports?.openPorts && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🔌 Open Ports</h5>
                  <p>{webCheckReport.ports.openPorts.length > 0 ? webCheckReport.ports.openPorts.join(', ') : 'No common ports detected as open'}</p>
                </div>
              )}

              {/* Cookies */}
              {webCheckReport.cookies && !webCheckReport.cookies.error && !webCheckReport.cookies.skipped && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🍪 Cookies</h5>
                  <p><b>Header Cookies:</b> {webCheckReport.cookies.headerCookies?.length || 0}</p>
                  <p><b>Client Cookies:</b> {webCheckReport.cookies.clientCookies?.length || 0}</p>
                </div>
              )}
            </div>
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
      </div>
    );
  };

  return (
    <section className="hero-container">
      <div className="hero-content">
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
      </div>
    </section>
  );
};

export default Hero;