import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/TranslationContext';
import ZapReportEnhanced from './ZapReportEnhanced';
import '../styles/Hero.scss';
import '../styles/HeroReport.scss';

// Define API Base URL to avoid port mismatch issues
const API_BASE = 'http://localhost:3001';

// 🔄 Loading Placeholder Component for progressive loading
const LoadingPlaceholder = ({ height = '1.5rem', width = '100%', style = {} }) => (
  <div
    className="loading-placeholder"
    style={{
      height,
      width,
      minHeight: height,
      ...style
    }}
  />
);

const Hero = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState(null);

  // ⚡ ZAP is now handled by backend combined scan - keeping zapReport for backward compatibility with useEffect
  const [zapReport] = useState(null);

  // 🔍 WebCheck Specific State
  const [webCheckReport, setWebCheckReport] = useState(null);
  const [webCheckLoading, setWebCheckLoading] = useState(false);
  const [webCheckError, setWebCheckError] = useState(null);

  const navigate = useNavigate();
  const { currentLang, setHasReport } = useTranslation();

  // 🌐 Report Translation State
  const [translatedReport, setTranslatedReport] = useState(null);
  const [isTranslatingReport, setIsTranslatingReport] = useState(false);

  // Translate entire report when language changes
  useEffect(() => {
    if (report || zapReport) {
      setHasReport(true);
    } else {
      setHasReport(false);
    }
  }, [report, zapReport, webCheckReport, setHasReport]);

  // Translate the report when language changes to Japanese
  useEffect(() => {
    const translateReport = async () => {
      const refinedReport = report?.refinedReport;

      // Don't translate if no report or already translated
      if (!refinedReport) return;
      if (currentLang !== 'ja') return; // Just don't translate, but keep the cached version
      if (translatedReport) return; // Already have translation cached

      setIsTranslatingReport(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/api/translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-token': token
          },
          body: JSON.stringify({
            texts: [refinedReport],
            targetLang: 'ja'
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.translated && data.translated[0]) {
            setTranslatedReport(data.translated[0]);
            console.log('✅ Report translated to Japanese (cached for future use)');
          }
        }
      } catch (err) {
        console.error('❌ Report translation failed:', err);
      } finally {
        setIsTranslatingReport(false);
      }
    };

    translateReport();
  }, [report?.refinedReport, currentLang, translatedReport]);

  // ⚡ ZAP scan is now integrated in the backend combined scan
  // No need for independent frontend ZAP call

  // 🔍 Helper: Run WebCheck Scans in parallel
  const runWebCheckScans = async (url, token) => {
    // ALL 30 WebCheck scan types
    const scanTypes = [
      'ssl', 'dns', 'headers', 'cookies', 'firewall', 'ports',
      'screenshot', 'tech-stack', 'hsts', 'security-txt', 'block-lists',
      'social-tags', 'linked-pages', 'robots-txt', 'sitemap', 'status',
      'redirects', 'mail-config', 'trace-route', 'http-security', 'get-ip',
      'dns-server', 'dnssec', 'txt-records', 'carbon', 'archives',
      'legacy-rank', 'whois', 'tls', 'quality'
    ];

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

    // ⚡ ZAP is now integrated in the backend combined scan
    // No need to run independently - this ensures Gemini waits for ZAP completion

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
            const hasZap = analysisData.hasZapResult;
            const zapPending = analysisData.zapPending;
            const hasAi = analysisData.hasRefinedReport;

            if (!hasVt) statusMessage = '🔍 Running VirusTotal scan...';
            else if (!hasPsi || !hasObs) statusMessage = '📊 Fetching PageSpeed & Observatory...';
            else if (zapPending && analysisData.zapData) {
              // Show ZAP progress
              const zapPhase = analysisData.zapData.phase || 'scanning';
              const zapProgress = analysisData.zapData.progress || 0;
              statusMessage = `⚡ ZAP Security Scan: ${zapPhase} (${zapProgress}%)...`;
            }
            else if (!hasZap && !zapPending) statusMessage = '⚡ Starting ZAP security scan...';
            else if (!hasAi) statusMessage = '🤖 Generating AI report (with all scan data)...';
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

  // Note: renderPartialReport removed - replaced by progressive loading in main report layout

  const renderReport = () => {
    // Show error if present
    if (error) return <p className="error-msg">{error}</p>;

    // Don't render anything if no report and not loading
    if (!report && !loading) return null;

    // Extract data - will be null/empty during loading
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

    // ⚡ ZAP Helpers - Now using backend zapData with status support
    let zapRiskLabel = "Passed";
    let zapRiskColor = "#00d084";
    let zapPendingMessage = null;

    const backendZapData = report?.zapData;
    if (backendZapData) {
      if (backendZapData.status === 'pending' || backendZapData.status === 'running') {
        // ZAP scan in progress
        zapRiskLabel = "Scanning...";
        zapRiskColor = "#ffb900";
        const progress = backendZapData.progress || 0;
        const phase = backendZapData.phase || 'starting';
        zapPendingMessage = `${phase}: ${progress}%`;
      } else if (backendZapData.status === 'completed' && backendZapData.riskCounts) {
        // ZAP scan complete
        if (backendZapData.riskCounts.High > 0) { zapRiskLabel = "High Risk"; zapRiskColor = "#e81123"; }
        else if (backendZapData.riskCounts.Medium > 0) { zapRiskLabel = "Medium Risk"; zapRiskColor = "#ff8c00"; }
        else if (backendZapData.riskCounts.Low > 0) { zapRiskLabel = "Low Risk"; zapRiskColor = "#ffb900"; }
      } else if (backendZapData.status === 'failed') {
        zapRiskLabel = "Failed";
        zapRiskColor = "#e81123";
        zapPendingMessage = backendZapData.message || 'Scan failed';
      }
    }

    return (
      <div className="report-container">
        {/* 🔄 Progress Bar - Show during loading */}
        {loading && (
          <div className="scan-progress-bar">
            <div className="progress-header">
              <span className="progress-title">🔍 Scanning {report?.target || 'URL'}...</span>
              <span className="progress-percentage">{loadingProgress}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${loadingProgress}%` }} />
            </div>
            <div className="progress-stage">{loadingStage}</div>
          </div>
        )}

        <h3 className="report-title">📊 Combined Scan Report {report?.target ? `for ${report.target}` : ''}</h3>
        {report?.status && <p>Status: <b>{report.status}</b></p>}

        {/* AI Summary - Shows loading placeholder or content */}
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
          {refinedReport ? (
            isTranslatingReport ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <p style={{ color: 'var(--accent)' }}>🌐 Translating report to Japanese...</p>
              </div>
            ) : (
              (currentLang === 'ja' && translatedReport ? translatedReport : refinedReport)
                .replace(/```markdown|```/g, '').replace(/^#{1,6}\s+/gm, '')
            )
          ) : (
            <div className="loading-pulse">
              <LoadingPlaceholder height="1rem" style={{ marginBottom: '0.5rem' }} />
              <LoadingPlaceholder height="1rem" width="95%" style={{ marginBottom: '0.5rem' }} />
              <LoadingPlaceholder height="1rem" width="88%" style={{ marginBottom: '0.5rem' }} />
              <LoadingPlaceholder height="1rem" width="92%" style={{ marginBottom: '0.5rem' }} />
              <LoadingPlaceholder height="1rem" width="75%" style={{ marginBottom: '0.5rem' }} />
              <p style={{ color: 'var(--accent)', marginTop: '1rem', textAlign: 'center' }}>
                ⏳ Generating AI analysis... (waiting for all scan data)
              </p>
            </div>
          )}
        </div>

        {/* Combined Scores Grid */}
        <div className="combined-scores" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {/* Security (VirusTotal) */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: !report?.hasVtResult ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🛡️ Security</h4>
            {report?.hasVtResult ? (
              <>
                <span className={`risk-level ${riskClass}`} style={{ fontSize: '1.5rem' }}>{riskLevel}</span>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{maliciousCount}/{totalEngines} malicious</p>
              </>
            ) : (
              <div className="loading-pulse">
                <LoadingPlaceholder height="1.5rem" width="60%" style={{ margin: '0.5rem auto' }} />
                <LoadingPlaceholder height="0.85rem" width="50%" style={{ margin: '0 auto' }} />
              </div>
            )}
          </div>

          {/* ⚡ OWASP ZAP Score Card - Now uses backend data with async support */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: !report?.hasZapResult ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>⚡ OWASP ZAP</h4>
            {backendZapData ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: zapRiskColor }}>{zapRiskLabel}</span>
                {zapPendingMessage ? (
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#ffb900' }}>{zapPendingMessage}</p>
                ) : backendZapData.status === 'completed' ? (
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{backendZapData.alerts ? backendZapData.alerts.length : 0} Alerts</p>
                ) : null}
              </>
            ) : report?.zapResult?.error || (report?.status === 'completed' && !report?.hasZapResult) ? (
              <div style={{ color: '#ffb900', marginTop: '10px' }}>Unavailable</div>
            ) : (
              <div className="loading-pulse">
                <LoadingPlaceholder height="1.5rem" width="60%" style={{ margin: '0.5rem auto' }} />
                <LoadingPlaceholder height="0.85rem" width="40%" style={{ margin: '0 auto' }} />
              </div>
            )}
          </div>

          {/* Performance (PSI) */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: !report?.hasPsiResult ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>⚡ Performance</h4>
            {psiScores?.performance != null ? (
              <>
                <span className={getScoreClass(psiScores.performance)} style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{psiScores.performance}</span>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>out of 100</p>
              </>
            ) : (
              <div className="loading-pulse">
                <LoadingPlaceholder height="1.5rem" width="50%" style={{ margin: '0.5rem auto' }} />
                <LoadingPlaceholder height="0.85rem" width="40%" style={{ margin: '0 auto' }} />
              </div>
            )}
          </div>



          {/* Security Config (Observatory) */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: !report?.hasObservatoryResult ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🔒 Security Config</h4>
            {observatoryData?.grade ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: getObservatoryGradeColor(observatoryData.grade) }}>{observatoryData.grade}</span>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Mozilla Observatory</p>
              </>
            ) : (
              <div className="loading-pulse">
                <LoadingPlaceholder height="1.5rem" width="40%" style={{ margin: '0.5rem auto' }} />
                <LoadingPlaceholder height="0.85rem" width="60%" style={{ margin: '0 auto' }} />
              </div>
            )}
          </div>

          {/* 🔍 URLScan.io Security Verdict */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: !report?.hasUrlscanResult ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🌐 URLScan.io</h4>
            {report?.hasUrlscanResult && report?.urlscanData ? (
              <>
                <span style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  color: report.urlscanData.verdicts?.overall?.malicious ? '#e81123' : '#00d084'
                }}>
                  {report.urlscanData.verdicts?.overall?.malicious ? 'Malicious' : 'Clean'}
                </span>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  {report.urlscanData.verdicts?.overall?.score || 0} threat score
                </p>
              </>
            ) : report?.urlscanResult?.error || (report?.status === 'completed' && !report?.hasUrlscanResult) ? (
              <div style={{ color: '#ffb900', marginTop: '10px' }}>Unavailable</div>
            ) : (
              <div className="loading-pulse">
                <LoadingPlaceholder height="1.5rem" width="50%" style={{ margin: '0.5rem auto' }} />
                <LoadingPlaceholder height="0.85rem" width="40%" style={{ margin: '0 auto' }} />
              </div>
            )}
          </div>

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
            ) : (() => {
              // Handle various response formats from tech-stack scan
              const techData = webCheckReport?.['tech-stack'];
              const techArray = techData?.technologies ||
                (Array.isArray(techData) ? techData : null) ||
                (techData && !techData.error && typeof techData === 'object' ? Object.keys(techData) : null);

              if (techArray && techArray.length > 0) {
                return (
                  <>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00d084' }}>{techArray.length}</span>
                    <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Technologies Detected</p>
                  </>
                );
              } else if (techData && !techData.error) {
                return <div style={{ color: '#888', marginTop: '10px' }}>No technologies detected</div>;
              } else {
                return <div style={{ color: '#888', marginTop: '10px' }}>{techData?.error ? 'Scan Failed' : 'Pending'}</div>;
              }
            })()}
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

          {/* 🔍 WebCheck: TLS Grade */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🔒 TLS Grade</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.tls && !webCheckReport.tls.error ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: getObservatoryGradeColor(webCheckReport.tls.tlsInfo?.grade) }}>
                  {webCheckReport.tls.tlsInfo?.grade || 'N/A'}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Score: {webCheckReport.tls.tlsInfo?.score || 0}/100</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Quality (PageSpeed) */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>📊 Quality</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.quality && !webCheckReport.quality.error ? (
              (() => {
                const perfScore = Math.round((webCheckReport.quality.lighthouseResult?.categories?.performance?.score || 0) * 100);
                return (
                  <>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: perfScore >= 90 ? '#00d084' : perfScore >= 50 ? '#ffb900' : '#e81123' }}>
                      {perfScore}
                    </span>
                    <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Lighthouse Score</p>
                  </>
                );
              })()
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Mail Config */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>📧 Mail Config</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.['mail-config'] && !webCheckReport['mail-config'].error && !webCheckReport['mail-config'].skipped ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00d084' }}>
                  {webCheckReport['mail-config'].mxRecords?.length || 0}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>MX Records Found</p>
              </>
            ) : webCheckReport?.['mail-config']?.skipped ? (
              <div style={{ color: '#888', marginTop: '10px' }}>No Mail Server</div>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: WHOIS */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>📋 WHOIS</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.whois && !webCheckReport.whois.error ? (
              <>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#00d084' }}>
                  {webCheckReport.whois.registrar?.substring(0, 20) || 'Found'}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Domain Registered</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: HSTS */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🔐 HSTS</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.hsts && !webCheckReport.hsts.error ? (
              <>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: webCheckReport.hsts.hstsEnabled ? '#00d084' : '#e81123' }}>
                  {webCheckReport.hsts.hstsEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{webCheckReport.hsts.hstsPreloaded ? 'Preloaded' : 'Not Preloaded'}</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Block Lists */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🚫 Block Lists</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.['block-lists'] && !webCheckReport['block-lists'].error ? (
              (() => {
                const blocklists = webCheckReport['block-lists'].blocklists || [];
                const blockedCount = blocklists.filter(b => b.isBlocked).length;
                return (
                  <>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: blockedCount === 0 ? '#00d084' : '#e81123' }}>
                      {blockedCount === 0 ? 'Clean' : `${blockedCount} Found`}
                    </span>
                    <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{blocklists.length} Lists Checked</p>
                  </>
                );
              })()
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Carbon Footprint */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🌱 Carbon</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.carbon && !webCheckReport.carbon.error ? (
              <>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: webCheckReport.carbon.isGreen ? '#00d084' : '#ffb900' }}>
                  {webCheckReport.carbon.isGreen ? 'Green' : 'Standard'}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{webCheckReport.carbon.co2?.grid?.grams ? `${webCheckReport.carbon.co2.grid.grams.toFixed(2)}g CO2` : 'Hosting'}</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Archives */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>📚 Archives</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.archives?.skipped ? (
              <div style={{ color: '#888', marginTop: '10px' }}>Not Archived</div>
            ) : webCheckReport?.archives?.totalScans ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00d084' }}>
                  {webCheckReport.archives.totalScans}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Wayback Snapshots</p>
              </>
            ) : webCheckReport?.archives?.error ? (
              <div style={{ color: '#ffb900', marginTop: '10px' }}>Timeout</div>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Sitemap */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🗺️ Sitemap</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.sitemap?.skipped || webCheckReport?.sitemap?.error ? (
              <div style={{ color: '#888', marginTop: '10px' }}>Not Found</div>
            ) : webCheckReport?.sitemap?.urlset ? (
              <>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00d084' }}>
                  {webCheckReport.sitemap.urlset?.url?.length || 'Found'}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>URLs in Sitemap</p>
              </>
            ) : webCheckReport?.sitemap ? (
              <div style={{ color: '#00d084', marginTop: '10px' }}>Found</div>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Social Tags */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>📱 Social Tags</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.['social-tags'] && !webCheckReport['social-tags'].error ? (
              (() => {
                const tags = webCheckReport['social-tags'];
                const hasOg = tags.ogTitle || tags.openGraph?.title;
                const hasTwitter = tags.twitterCard || tags.twitter?.card;
                return (
                  <>
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: (hasOg || hasTwitter) ? '#00d084' : '#ffb900' }}>
                      {(hasOg && hasTwitter) ? 'Complete' : (hasOg || hasTwitter) ? 'Partial' : 'Missing'}
                    </span>
                    <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{hasOg ? 'OG' : ''}{hasOg && hasTwitter ? ' + ' : ''}{hasTwitter ? 'Twitter' : ''}</p>
                  </>
                );
              })()
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Linked Pages */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🔗 Links</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.['linked-pages'] && !webCheckReport['linked-pages'].error ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00d084' }}>
                  {webCheckReport['linked-pages'].internal?.length || webCheckReport['linked-pages'].links?.length || 0}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Links Found</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Redirects */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>↪️ Redirects</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.redirects && !webCheckReport.redirects.error ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: (webCheckReport.redirects.redirects?.length || 0) <= 2 ? '#00d084' : '#ffb900' }}>
                  {webCheckReport.redirects.redirects?.length || 0}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Redirect Hops</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: DNS Server */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🌐 DNS Server</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.['dns-server'] && !webCheckReport['dns-server'].error ? (
              <>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00d084' }}>
                  {webCheckReport['dns-server'].dns?.length || 1}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Servers Found</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: DNSSEC */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🔑 DNSSEC</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.dnssec && !webCheckReport.dnssec.error ? (
              <>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: webCheckReport.dnssec.isValid || webCheckReport.dnssec.enabled ? '#00d084' : '#ffb900' }}>
                  {webCheckReport.dnssec.isValid || webCheckReport.dnssec.enabled ? 'Valid' : 'Not Set'}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>DNSSEC Status</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Security.txt */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>📄 Security.txt</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.['security-txt'] && !webCheckReport['security-txt'].error ? (
              <>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: webCheckReport['security-txt'].isPresent || webCheckReport['security-txt'].found ? '#00d084' : '#ffb900' }}>
                  {webCheckReport['security-txt'].isPresent || webCheckReport['security-txt'].found ? 'Found' : 'Missing'}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Security Policy</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Robots.txt */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🤖 Robots.txt</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.['robots-txt'] && !webCheckReport['robots-txt'].error ? (
              <>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: webCheckReport['robots-txt'].exists || webCheckReport['robots-txt'].isPresent ? '#00d084' : '#ffb900' }}>
                  {webCheckReport['robots-txt'].exists || webCheckReport['robots-txt'].isPresent ? 'Found' : 'Missing'}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Crawler Rules</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Status */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>🟢 Status</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.status && !webCheckReport.status.error ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: webCheckReport.status.isUp || webCheckReport.status.statusCode === 200 ? '#00d084' : '#e81123' }}>
                  {webCheckReport.status.statusCode || (webCheckReport.status.isUp ? '200' : 'Down')}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{webCheckReport.status.responseTime ? `${webCheckReport.status.responseTime}ms` : 'HTTP Status'}</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Legacy Rank */}
          <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: webCheckLoading ? '1px dashed var(--accent)' : 'none' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>📈 Rank</h4>
            {webCheckLoading ? (
              <div style={{ color: 'var(--accent)', fontSize: '1rem', marginTop: '10px' }}>Scanning...</div>
            ) : webCheckReport?.['legacy-rank'] && !webCheckReport['legacy-rank'].error ? (
              <>
                <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#00d084' }}>
                  #{webCheckReport['legacy-rank'].rank || webCheckReport['legacy-rank'].globalRank || 'N/A'}
                </span>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Global Rank</p>
              </>
            ) : (
              <div style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>
        </div>

        {/* 📸 Screenshot Preview - Full Width (WebCheck or URLScan.io fallback) */}
        {(() => {
          // Try WebCheck screenshot first, then URLScan.io as fallback
          const webCheckScreenshot = webCheckReport?.screenshot?.image && !webCheckReport?.screenshot?.error
            ? `data:image/png;base64,${webCheckReport.screenshot.image}`
            : null;
          const urlscanScreenshot = report?.urlscanData?.screenshot || null;
          const screenshotSrc = webCheckScreenshot || urlscanScreenshot;
          const screenshotSource = webCheckScreenshot ? 'WebCheck' : (urlscanScreenshot ? 'URLScan.io' : null);

          if (!screenshotSrc) return null;

          return (
            <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '2px solid var(--accent)' }}>
              <h4 style={{ margin: '0 0 1rem 0', color: 'var(--accent)' }}>📸 Website Screenshot <span style={{ fontSize: '0.75rem', color: '#888' }}>({screenshotSource})</span></h4>
              <img
                src={screenshotSrc}
                alt="Website Screenshot"
                style={{
                  width: '100%',
                  maxHeight: '400px',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  border: '1px solid var(--accent)'
                }}
              />
            </div>
          );
        })()}

        {/* ⚡ OWASP ZAP Enhanced Results - Only show when completed */}
        {backendZapData && backendZapData.status === 'completed' && backendZapData.alerts && (
          <ZapReportEnhanced
            zapData={backendZapData}
            scanId={report?.scanId || report?.analysisId}
          />
        )}

        {/* ZAP Pending/Running Status */}
        {backendZapData && (backendZapData.status === 'pending' || backendZapData.status === 'running') && (
          <div style={{ padding: '2rem', background: 'var(--card-bg)', borderRadius: '8px', marginBottom: '2rem', textAlign: 'center', border: '1px dashed #ffb900' }}>
            <h3>⚡ OWASP ZAP Security Scan in Progress</h3>
            <p style={{ color: '#ffb900', fontSize: '1.2rem', margin: '1rem 0' }}>
              {backendZapData.phase || 'Scanning'}: {backendZapData.progress || 0}%
            </p>
            <p style={{ color: '#888', fontSize: '0.9rem' }}>
              {backendZapData.message || 'Running comprehensive security tests...'}
            </p>
            {backendZapData.urlsFound > 0 && (
              <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Found {backendZapData.urlsFound} URLs • {backendZapData.alertsFound || 0} alerts so far
              </p>
            )}
            <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '1rem' }}>
              This page will automatically update when the scan completes.
            </p>
          </div>
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
              {(() => {
                const techData = webCheckReport['tech-stack'];
                const techArray = techData?.technologies ||
                  (Array.isArray(techData) ? techData : null);

                if (techArray && techArray.length > 0) {
                  return (
                    <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                      <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🛠️ Technology Stack</h5>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {techArray.slice(0, 15).map((tech, idx) => (
                          <span key={idx} style={{ background: 'var(--accent)', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                            {typeof tech === 'object' ? (tech.name || tech.technology || JSON.stringify(tech)) : tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

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

              {/* WHOIS Details */}
              {webCheckReport.whois && !webCheckReport.whois.error && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📋 WHOIS Information</h5>
                  <p><b>Registrar:</b> {webCheckReport.whois.registrar || 'N/A'}</p>
                  <p><b>Created:</b> {webCheckReport.whois.createdDate || webCheckReport.whois.created || 'N/A'}</p>
                  <p><b>Expires:</b> {webCheckReport.whois.expiresDate || webCheckReport.whois.expires || 'N/A'}</p>
                  <p><b>Updated:</b> {webCheckReport.whois.updatedDate || webCheckReport.whois.updated || 'N/A'}</p>
                </div>
              )}

              {/* Mail Config Details */}
              {webCheckReport['mail-config'] && !webCheckReport['mail-config'].error && !webCheckReport['mail-config'].skipped && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📧 Mail Configuration</h5>
                  <p><b>MX Records:</b> {webCheckReport['mail-config'].mxRecords?.length || 0}</p>
                  {webCheckReport['mail-config'].mxRecords?.slice(0, 3).map((mx, idx) => (
                    <p key={idx} style={{ fontSize: '0.85rem', marginLeft: '1rem' }}>
                      {mx.exchange} (priority: {mx.priority})
                    </p>
                  ))}
                  <p><b>Mail Services:</b> {webCheckReport['mail-config'].mailServices?.map(s => s.provider).join(', ') || 'None detected'}</p>
                </div>
              )}

              {/* TLS Details */}
              {webCheckReport.tls && !webCheckReport.tls.error && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🔒 TLS Security (Observatory)</h5>
                  <p><b>Grade:</b> <span style={{ color: getObservatoryGradeColor(webCheckReport.tls.tlsInfo?.grade), fontWeight: 'bold' }}>{webCheckReport.tls.tlsInfo?.grade || 'N/A'}</span></p>
                  <p><b>Score:</b> {webCheckReport.tls.tlsInfo?.score || 0}/100</p>
                  <p><b>Host:</b> {webCheckReport.tls.tlsInfo?.host || 'N/A'}</p>
                </div>
              )}

              {/* Social Tags Details */}
              {webCheckReport['social-tags'] && !webCheckReport['social-tags'].error && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📱 Social Media Tags</h5>
                  <p><b>OG Title:</b> {webCheckReport['social-tags'].ogTitle || webCheckReport['social-tags'].openGraph?.title || 'N/A'}</p>
                  <p><b>OG Description:</b> {(webCheckReport['social-tags'].ogDescription || webCheckReport['social-tags'].openGraph?.description || 'N/A').substring(0, 100)}</p>
                  <p><b>Twitter Card:</b> {webCheckReport['social-tags'].twitterCard || webCheckReport['social-tags'].twitter?.card || 'N/A'}</p>
                </div>
              )}

              {/* Redirects Details */}
              {webCheckReport.redirects && !webCheckReport.redirects.error && webCheckReport.redirects.redirects?.length > 0 && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>↪️ Redirect Chain</h5>
                  {webCheckReport.redirects.redirects.map((redirect, idx) => (
                    <p key={idx} style={{ fontSize: '0.85rem' }}>
                      {idx + 1}. {redirect.statusCode} → {redirect.url?.substring(0, 50)}...
                    </p>
                  ))}
                </div>
              )}

              {/* Archives Details */}
              {webCheckReport.archives && !webCheckReport.archives.error && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📚 Web Archive History</h5>
                  <p><b>Total Snapshots:</b> {webCheckReport.archives.scanCount || webCheckReport.archives.length || 'Available'}</p>
                  {webCheckReport.archives.firstScan && <p><b>First Snapshot:</b> {webCheckReport.archives.firstScan}</p>}
                  {webCheckReport.archives.lastScan && <p><b>Last Snapshot:</b> {webCheckReport.archives.lastScan}</p>}
                </div>
              )}

              {/* Carbon Footprint Details */}
              {webCheckReport.carbon && !webCheckReport.carbon.error && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🌱 Carbon Footprint</h5>
                  <p><b>Green Hosting:</b> <span style={{ color: webCheckReport.carbon.isGreen ? '#00d084' : '#ffb900' }}>{webCheckReport.carbon.isGreen ? 'Yes' : 'No'}</span></p>
                  {webCheckReport.carbon.co2 && (
                    <>
                      <p><b>CO2 per visit:</b> {webCheckReport.carbon.co2.grid?.grams?.toFixed(2) || 'N/A'}g</p>
                      <p><b>Cleaner than:</b> {webCheckReport.carbon.cleanerThan ? `${(webCheckReport.carbon.cleanerThan * 100).toFixed(0)}% of sites` : 'N/A'}</p>
                    </>
                  )}
                </div>
              )}

              {/* TXT Records */}
              {webCheckReport['txt-records'] && !webCheckReport['txt-records'].error && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📝 TXT Records</h5>
                  {(webCheckReport['txt-records'].txtRecords || webCheckReport['txt-records'].records || []).slice(0, 5).map((record, idx) => (
                    <p key={idx} style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
                      {Array.isArray(record) ? record.join('').substring(0, 80) : String(record).substring(0, 80)}...
                    </p>
                  ))}
                </div>
              )}

              {/* Headers */}
              {webCheckReport.headers && !webCheckReport.headers.error && (
                <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📋 HTTP Headers</h5>
                  {Object.entries(webCheckReport.headers).slice(0, 10).map(([key, val]) => (
                    <p key={key} style={{ fontSize: '0.8rem' }}><b>{key}:</b> {String(val).substring(0, 60)}</p>
                  ))}
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
              <a href={`https://developer.mozilla.org/en-US/observatory/analyze?host=${report?.target ? encodeURIComponent(new URL(report.target).hostname) : ''}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: 'bold' }}>
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
              <a href={`https://developer.mozilla.org/en-US/observatory/analyze?host=${report?.target ? encodeURIComponent(new URL(report.target).hostname) : ''}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: 'bold' }}>
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

        {/* Download Complete JSON Report Button */}
        {report?.analysisId && report?.status === 'completed' && (
          <div style={{
            marginTop: '2rem',
            padding: '2rem',
            background: 'var(--card-bg)',
            borderRadius: '8px',
            border: '2px solid var(--accent)',
            textAlign: 'center'
          }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--accent)' }}>📥 Download Complete Scan Data</h4>
            <p style={{ marginBottom: '1rem', color: '#888', fontSize: '0.9rem' }}>
              Download all scan results including VirusTotal, ZAP, PageSpeed, Observatory, URLScan, WebCheck, and AI analysis in JSON format
            </p>
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('token');
                  const response = await fetch(`${API_BASE}/api/vt/download-complete-json/${report.analysisId}`, {
                    headers: { 'x-auth-token': token }
                  });

                  if (!response.ok) {
                    throw new Error('Download failed');
                  }

                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `scan_report_${report.target.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                  console.log('✅ Complete JSON report downloaded');
                } catch (err) {
                  console.error('❌ Download failed:', err);
                  alert('Failed to download report. Please try again.');
                }
              }}
              style={{
                padding: '1rem 2rem',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
            >
              📥 Download Complete JSON Report
            </button>
            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#666' }}>
              Includes all raw scan data for further analysis
            </p>
          </div>
        )}
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