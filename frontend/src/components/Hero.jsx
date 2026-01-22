import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/TranslationContext';
import { useTheme } from '../context/ThemeContext';
import ReactMarkdown from 'react-markdown';
import ZapReportEnhanced from './ZapReportEnhanced';
import '../styles/Hero.scss';
import '../styles/HeroReport.scss';
import '../styles/ScoreCards.scss';

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

  // 🔄 Active scan tracking for stop/resume functionality
  const [activeScanId, setActiveScanId] = useState(null);
  const [scanUrl, setScanUrl] = useState('');
  const stopPollingRef = useRef(false); // Flag to stop polling when scan is stopped
  const isPollingRef = useRef(false); // Flag to prevent duplicate polling instances
  const abortControllerRef = useRef(null); // AbortController for cancelling in-flight requests

  // ⚡ ZAP is now handled by backend combined scan - keeping zapReport for backward compatibility with useEffect
  const [zapReport] = useState(null);

  // 🔍 WebCheck now runs in backend and results come from database via polling
  // No more frontend WebCheck API calls - backend handles everything

  const navigate = useNavigate();
  const { currentLang, setHasReport } = useTranslation();
  const { theme } = useTheme();

  // 🌐 Report Translation State
  const [translatedReport, setTranslatedReport] = useState(null);
  const [isTranslatingReport, setIsTranslatingReport] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfProgressMessage, setPdfProgressMessage] = useState('');
  const [pdfDropdownOpen, setPdfDropdownOpen] = useState(false);

  // Close PDF dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pdfDropdownOpen && !e.target.closest('.pdf-dropdown-container')) {
        setPdfDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [pdfDropdownOpen]);

  // Translate entire report when language changes
  useEffect(() => {
    if (report || zapReport) {
      setHasReport(true);
    } else {
      setHasReport(false);
    }
  }, [report, zapReport, setHasReport]);

  // 🔄 Resume scan from database on page load
  // This handles: page refresh, browser tab killed, user returning hours later
  // The backend runs scans independently, so we just need to check the database
  useEffect(() => {
    const checkForActiveScan = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        // First, check the backend for any active scan (most reliable source)
        console.log('🔄 Checking for active scan in database...');
        const response = await fetch(`${API_BASE}/api/vt/active-scan`, {
          headers: { 'x-auth-token': token }
        });

        if (!response.ok) {
          console.log('⚠️ Could not check for active scan');
          localStorage.removeItem('activeScan');
          return;
        }

        const data = await response.json();

        // No active scan found in database
        if (!data.hasActiveScan) {
          console.log('ℹ️ No active scan found in database');
          localStorage.removeItem('activeScan');
          return;
        }

        // Active scan found! Restore the state
        console.log('🔄 Found scan in database:', data.analysisId);
        console.log('   Status:', data.status);
        console.log('   Target:', data.target);

        // CASE 1: Scan is COMPLETED - show results directly, no polling needed
        if (data.status === 'completed') {
          console.log('✅ Scan already completed - showing results');

          // Set the full report from database (includes WebCheck results)
          setReport({
            ...data,
            isPartial: false
          });

          // Clear localStorage since scan is done
          localStorage.removeItem('activeScan');

          // No loading state needed - we have all results
          setLoading(false);
          return;
        }

        // CASE 2: Scan is IN PROGRESS - need to resume polling
        console.log('🔄 Scan still in progress - resuming...');

        // Update localStorage to match database (for consistency)
        localStorage.setItem('activeScan', JSON.stringify({
          scanId: data.analysisId,
          url: data.target,
          timestamp: new Date(data.createdAt).getTime()
        }));

        // Set UI state
        setActiveScanId(data.analysisId);
        setScanUrl(data.target);
        setLoading(true);
        setLoadingStage('Resuming scan...');
        stopPollingRef.current = false;

        // Calculate progress based on what's completed
        let progress = 10;
        if (data.hasVtResult) progress = 30;
        if (data.hasPsiResult && data.hasObservatoryResult) progress = 50;
        if (data.zapPending) progress = 60;
        if (data.hasZapResult) progress = 85;
        if (data.hasRefinedReport) progress = 95;
        setLoadingProgress(progress);

        // Set partial report data from the server response immediately
        // This shows any progress that was made before refresh
        // WebCheck results now come from backend via polling - no frontend calls needed
        console.log('🔄 Restoring partial scan data from database');
        setReport({
          ...data,
          isPartial: true
        });

        // Start polling for updates (scan still in progress)
        // WebCheck progress will be included in poll responses
        pollAnalysis(data.analysisId, token);

      } catch (err) {
        console.error('Error checking for active scan:', err);
        localStorage.removeItem('activeScan');
      }
    };

    checkForActiveScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // 🛑 Stop scan handler
  const handleStopScan = async () => {
    // IMMEDIATELY set stop flag to prevent any new polling
    stopPollingRef.current = true;
    console.log('🛑 Stop button clicked - stopping polling');

    // Abort any in-flight fetch requests immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log('🛑 Aborted in-flight polling requests');
    }

    // Get scanId from state or localStorage as fallback
    let scanIdToStop = activeScanId;

    if (!scanIdToStop) {
      // Try to get from localStorage
      const persistedScan = localStorage.getItem('activeScan');
      if (persistedScan) {
        try {
          const parsed = JSON.parse(persistedScan);
          scanIdToStop = parsed.scanId;
        } catch (e) {
          console.error('Failed to parse activeScan from localStorage');
        }
      }
    }

    if (!scanIdToStop) {
      console.log('⏳ No scan ID yet - scan still initializing, stopping polling only');
      // Stop polling and clear UI even if we don't have a scan ID yet
      stopPollingRef.current = true;
      setLoadingStage('Stopping scan...');
      setTimeout(() => {
        setLoading(false);
        setActiveScanId(null);
        setScanUrl('');
        setLoadingProgress(0);
        setLoadingStage('');
        localStorage.removeItem('activeScan');
      }, 1000);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    console.log('🛑 Stopping scan:', scanIdToStop);
    setLoadingStage('Stopping scan and restarting containers...');

    try {
      const response = await fetch(`${API_BASE}/api/vt/stop-scan/${scanIdToStop}`, {
        method: 'POST',
        headers: {
          'x-auth-token': token
        }
      });

      const data = await response.json();
      console.log('🛑 Stop response:', data);

      if (data.success) {
        setLoadingStage('Scan stopped - containers restarting for fresh environment');
      } else {
        console.error('Stop failed:', data);
        setLoadingStage('Stop request sent...');
      }

      // Short delay to show the message before clearing
      setTimeout(() => {
        setLoading(false);
        setActiveScanId(null);
        setScanUrl('');
        setLoadingProgress(0);
        setLoadingStage('');
        localStorage.removeItem('activeScan');
      }, 2000);

    } catch (err) {
      console.error('Stop error:', err);
      setError('Failed to stop scan: ' + err.message);
      setLoading(false);
    }
  };

  // 🔄 Reusable polling function
  const pollAnalysis = async (analysisId, token) => {
    // Prevent duplicate polling instances (React StrictMode / double useEffect)
    if (isPollingRef.current) {
      console.log('⚠️ Polling already in progress, skipping duplicate call');
      return;
    }
    isPollingRef.current = true;

    let attempts = 0;
    // Increased from 60 to 450 attempts (15 minutes at 2-second intervals)
    // ZAP scans can take 5-10+ minutes, so we need longer polling
    const maxAttempts = 450;

    const poll = async () => {
      // Check if polling was stopped (user clicked Stop Scan)
      if (stopPollingRef.current) {
        console.log('🛑 Polling stopped by user');
        isPollingRef.current = false;
        return;
      }

      attempts++;
      const progressIncrement = 60 / maxAttempts;
      const currentProgress = Math.min(30 + (attempts * progressIncrement), 90);
      setLoadingProgress(Math.floor(currentProgress));

      try {
        // Create new AbortController for this request
        abortControllerRef.current = new AbortController();

        const analysisRes = await fetch(`${API_BASE}/api/vt/combined-analysis/${analysisId}`, {
          headers: { 'x-auth-token': token },
          signal: abortControllerRef.current.signal
        });
        const analysisData = await analysisRes.json();
        const status = analysisData.status;

        // Check again if polling was stopped during the fetch
        if (stopPollingRef.current) {
          console.log('🛑 Polling stopped by user (after fetch)');
          return;
        }

        // Progressive Loading: Update report with partial data
        if (analysisData.target) {
          setReport(prevReport => ({
            ...prevReport,
            ...analysisData,
            isPartial: status !== 'completed'
          }));
        }

        if (status === 'completed') {
          setLoadingProgress(100);
          setLoadingStage('Analysis complete!');
          localStorage.removeItem('activeScan');
          setActiveScanId(null);
          setScanUrl('');
          isPollingRef.current = false; // Reset polling flag
          setTimeout(() => {
            setLoading(false);
            setLoadingProgress(0);
            setLoadingStage('');
          }, 500);
        } else if (status === 'failed') {
          localStorage.removeItem('activeScan');
          setActiveScanId(null);
          isPollingRef.current = false; // Reset polling flag
          throw new Error('Analysis failed: ' + (analysisData.error || 'Unknown error'));
        } else if (status === 'stopped') {
          localStorage.removeItem('activeScan');
          setActiveScanId(null);
          setLoading(false);
          setLoadingStage('Scan was stopped');
          isPollingRef.current = false; // Reset polling flag
        } else if (attempts >= maxAttempts) {
          setLoading(false);
          setLoadingProgress(0);
          setLoadingStage('');
          isPollingRef.current = false; // Reset polling flag
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
            const zapPhase = analysisData.zapData.phase || 'scanning';
            const zapProgress = analysisData.zapData.progress || 0;
            statusMessage = `⚡ ZAP Security Scan: ${zapPhase} (${zapProgress}%)...`;
          }
          else if (!hasZap && !zapPending) statusMessage = '⚡ Starting ZAP security scan...';
          else if (!hasAi) statusMessage = '🤖 Generating AI report (with all scan data)...';
          else statusMessage = '✅ Finalizing results...';

          setLoadingStage(statusMessage);
          setTimeout(poll, 2000);
        }
      } catch (pollError) {
        // If request was aborted (user clicked stop), exit gracefully
        if (pollError.name === 'AbortError') {
          console.log('🛑 Request aborted - scan was stopped by user');
          isPollingRef.current = false; // Reset polling flag
          return;
        }
        // If polling was stopped by user, don't throw - just exit gracefully
        if (stopPollingRef.current) {
          console.log('🛑 Polling error ignored - scan was stopped by user');
          isPollingRef.current = false; // Reset polling flag
          return;
        }
        console.error('Polling error:', pollError);
        isPollingRef.current = false; // Reset polling flag
        throw pollError;
      }
    };

    await poll();
  };

  // 🔍 WebCheck scans now run entirely in backend - no frontend API calls needed
  // Results come via the combined-analysis polling endpoint along with ZAP and other scans

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
    setScanUrl(url);
    stopPollingRef.current = false; // Reset stop flag for new scan
    isPollingRef.current = false; // Reset polling flag for new scan

    // ⚡ ZAP and WebCheck are now both integrated in the backend combined scan
    // Backend triggers both scans independently and saves results to MongoDB
    // Frontend just polls and displays whatever data is available

    try {
      console.log('🔍 Submitting URL for scan:', url);
      setLoadingProgress(10);
      setLoadingStage('Submitting URL to security scanners...');

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

      // 🔄 Persist scan to localStorage for resume on page refresh
      setActiveScanId(analysisId);
      localStorage.setItem('activeScan', JSON.stringify({
        scanId: analysisId,
        url,
        timestamp: Date.now()
      }));

      setLoadingProgress(30);
      setLoadingStage('Running VirusTotal security scan...');

      // Check if stop was clicked during the initial API call
      if (stopPollingRef.current) {
        console.log('🛑 Scan was stopped during initialization');
        setLoading(false);
        localStorage.removeItem('activeScan');
        return;
      }

      // Use the reusable polling function
      await pollAnalysis(analysisId, token);

    } catch (err) {
      console.error('Analysis error:', err);
      let errorMessage = "Analysis failed: ";
      if (err.message.includes('429')) errorMessage = err.message;
      else errorMessage += err.message;

      setError(errorMessage);
      setLoading(false);
      setLoadingProgress(0);
      localStorage.removeItem('activeScan');
      setActiveScanId(null);
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

    // 🔍 WebCheck data - now comes from backend via polling
    // Structure: { status: 'running'|'uploading'|'completed'|'completed_with_errors'|'completed_partial'|'failed', results: {...}, progress: 0-100 }
    const backendWebCheckData = report?.webCheckData;
    const webCheckCompleted = backendWebCheckData?.status === 'completed' ||
                              backendWebCheckData?.status === 'completed_with_errors' ||
                              backendWebCheckData?.status === 'completed_partial';
    const webCheckReport = webCheckCompleted
      ? backendWebCheckData.results
      : (backendWebCheckData?.partialResults || {});
    const webCheckLoading = backendWebCheckData?.status === 'running' || backendWebCheckData?.status === 'uploading';
    const webCheckUploading = backendWebCheckData?.status === 'uploading';
    const webCheckUploadProgress = backendWebCheckData?.uploadProgress || 0;
    const webCheckError = backendWebCheckData?.status === 'failed';

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
        <div className="ai-report-section markdown-content" style={{
          background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)',
          padding: '1.5rem',
          marginBottom: '2rem',
          borderRadius: '8px',
          border: '2px solid var(--accent)',
          lineHeight: '1.6',
          fontSize: '0.95rem'
        }}>
          <h4 style={{ marginTop: 0, color: 'var(--accent)' }}>🤖 AI-Generated Analysis Summary</h4>
          {refinedReport ? (
            isTranslatingReport ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <p style={{ color: 'var(--accent)' }}>🌐 Translating report to Japanese...</p>
              </div>
            ) : (
              <ReactMarkdown>
                {currentLang === 'ja' && translatedReport ? translatedReport : refinedReport}
              </ReactMarkdown>
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
        <div className="score-cards-grid">
          {/* Security (VirusTotal) */}
          {/* Security (VirusTotal) */}
          <div className="score-card">
            <h4 className="score-card__title">🛡️ Security</h4>
            {report?.hasVtResult ? (
              <>
                <span className={`score-card__value ${riskClass}`}>{riskLevel}</span>
                <p className="score-card__label">{maliciousCount}/{totalEngines} malicious</p>
              </>
            ) : (
              <div className="score-card__loading loading-pulse">
                <LoadingPlaceholder height="1.5rem" width="60%" style={{ marginBottom: '0.5rem' }} />
                <LoadingPlaceholder height="0.85rem" width="50%" />
              </div>
            )}
          </div>

          {/* ⚡ OWASP ZAP Score Card - Now uses backend data with async support */}
          {/* ⚡ OWASP ZAP Score Card - Now uses backend data with async support */}
          <div className="score-card">
            <h4 className="score-card__title">⚡ OWASP ZAP</h4>
            {backendZapData ? (
              <>
                <span className="score-card__value" style={{ color: zapRiskColor }}>{zapRiskLabel}</span>
                {zapPendingMessage ? (
                  <p className="score-card__label" style={{ color: '#ffb900' }}>{zapPendingMessage}</p>
                ) : backendZapData.status === 'completed' ? (
                  <p className="score-card__label">{backendZapData.alerts ? backendZapData.alerts.length : 0} Alerts</p>
                ) : backendZapData.status === 'completed_partial' ? (
                  <p className="score-card__label" style={{ color: '#ffb900' }}>{backendZapData.alerts ? backendZapData.alerts.length : 0} Alerts (Partial)</p>
                ) : null}
              </>
            ) : report?.zapResult?.error || (report?.status === 'completed' && !report?.hasZapResult) ? (
              <div style={{ color: '#ffb900', marginTop: '10px' }}>Unavailable</div>
            ) : (
              <div className="score-card__loading loading-pulse">
                <LoadingPlaceholder height="1.5rem" width="60%" style={{ marginBottom: '0.5rem' }} />
                <LoadingPlaceholder height="0.85rem" width="40%" />
              </div>
            )}
          </div>

          {/* Performance (PSI) */}
          {/* Performance (PSI) */}
          <div className="score-card">
            <h4 className="score-card__title">⚡ Performance</h4>
            {psiScores?.performance != null ? (
              <>
                <span className={`score-card__value ${getScoreClass(psiScores.performance)}`}>{psiScores.performance}</span>
                <p className="score-card__label">out of 100</p>
              </>
            ) : (
              <div className="score-card__loading loading-pulse">
                <LoadingPlaceholder height="1.5rem" width="50%" style={{ marginBottom: '0.5rem' }} />
                <LoadingPlaceholder height="0.85rem" width="40%" />
              </div>
            )}
          </div>



          {/* Security Config (Observatory) */}
          {/* Security Config (Observatory) */}
          <div className="score-card">
            <h4 className="score-card__title">🔒 Security Config</h4>
            {observatoryData?.grade ? (
              <>
                <span className="score-card__value" style={{ color: getObservatoryGradeColor(observatoryData.grade) }}>{observatoryData.grade}</span>
                <p className="score-card__label">Mozilla Observatory</p>
              </>
            ) : (
              <div className="score-card__loading loading-pulse">
                <LoadingPlaceholder height="1.5rem" width="40%" style={{ marginBottom: '0.5rem' }} />
                <LoadingPlaceholder height="0.85rem" width="60%" />
              </div>
            )}
          </div>

          {/* 🔍 URLScan.io Security Verdict */}
          {/* 🔍 URLScan.io Security Verdict */}
          <div className="score-card">
            <h4 className="score-card__title">🌐 URLScan.io</h4>
            {report?.hasUrlscanResult && report?.urlscanData ? (
              <>
                <span className="score-card__value" style={{
                  color: report.urlscanData.verdicts?.overall?.malicious ? '#e81123' : '#00d084'
                }}>
                  {report.urlscanData.verdicts?.overall?.malicious ? 'Malicious' : 'Clean'}
                </span>
                <p className="score-card__label">
                  {report.urlscanData.verdicts?.overall?.score || 0} threat score
                </p>
              </>
            ) : report?.urlscanResult?.error || (report?.status === 'completed' && !report?.hasUrlscanResult) ? (
              <div style={{ color: '#ffb900', marginTop: '10px' }}>Unavailable</div>
            ) : (
              <div className="score-card__loading loading-pulse">
                <LoadingPlaceholder height="1.5rem" width="50%" style={{ marginBottom: '0.5rem' }} />
                <LoadingPlaceholder height="0.85rem" width="40%" />
              </div>
            )}
          </div>

          {/* 🔍 WebCheck: SSL Certificate */}
          {/* 🔍 WebCheck: SSL Certificate */}
          <div className="score-card">
            <h4 className="score-card__title">🔐 SSL Certificate</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.ssl && !webCheckReport.ssl.error ? (
              <>
                <span className="score-card__value score-card__value--safe">Valid</span>
                <p className="score-card__label">{webCheckReport.ssl.issuer?.O || 'Unknown Issuer'}</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>{webCheckError ? 'Failed' : 'Pending'}</div>
            )}
          </div>

          {/* 🔍 WebCheck: Security Headers */}
          {/* 🔍 WebCheck: Security Headers */}
          <div className="score-card">
            <h4 className="score-card__title">🛡️ Security Headers</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.['http-security'] && !webCheckReport['http-security'].error ? (
              <>
                {(() => {
                  const sec = webCheckReport['http-security'];
                  const passed = [sec.strictTransportPolicy, sec.xFrameOptions, sec.xContentTypeOptions, sec.xXSSProtection, sec.contentSecurityPolicy].filter(Boolean).length;
                  const color = passed >= 4 ? '#00d084' : passed >= 2 ? '#ffb900' : '#e81123';
                  return <span className="score-card__value" style={{ color }}>{passed}/5</span>;
                })()}
                <p className="score-card__label">Headers Present</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Tech Stack */}
          {/* 🔍 WebCheck: Tech Stack */}
          <div className="score-card">
            <h4 className="score-card__title">🛠️ Tech Stack</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : (() => {
              // Handle various response formats from tech-stack scan
              const techData = webCheckReport?.['tech-stack'];
              const techArray = techData?.technologies ||
                (Array.isArray(techData) ? techData : null) ||
                (techData && !techData.error && typeof techData === 'object' ? Object.keys(techData) : null);

              if (techArray && techArray.length > 0) {
                return (
                  <>
                    <span className="score-card__value score-card__value--safe">{techArray.length}</span>
                    <p className="score-card__label">Technologies Detected</p>
                  </>
                );
              } else if (techData && !techData.error) {
                return <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>No technologies detected</div>;
              } else {
                return <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>{techData?.error ? 'Scan Failed' : 'Pending'}</div>;
              }
            })()}
          </div>

          {/* 🔍 WebCheck: Firewall/WAF */}
          {/* 🔍 WebCheck: Firewall/WAF */}
          <div className="score-card">
            <h4 className="score-card__title">🔥 Firewall</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.firewall && !webCheckReport.firewall.error ? (
              <>
                <span className={`score-card__value score-card__value--${webCheckReport.firewall.hasWaf ? 'safe' : 'medium'}`}>
                  {webCheckReport.firewall.hasWaf ? webCheckReport.firewall.waf : 'None Detected'}
                </span>
                <p className="score-card__label">WAF Status</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: TLS Grade */}
          {/* 🔍 WebCheck: TLS Grade */}
          <div className="score-card">
            <h4 className="score-card__title">🔒 TLS Grade</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.tls && !webCheckReport.tls.error ? (
              <>
                <span className="score-card__value" style={{ color: getObservatoryGradeColor(webCheckReport.tls.tlsInfo?.grade) }}>
                  {webCheckReport.tls.tlsInfo?.grade || 'N/A'}
                </span>
                <p className="score-card__label">Score: {webCheckReport.tls.tlsInfo?.score || 0}/100</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Quality (PageSpeed) */}
          {/* 🔍 WebCheck: Quality (PageSpeed) */}
          <div className="score-card">
            <h4 className="score-card__title">📊 Quality</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.quality && !webCheckReport.quality.error ? (
              (() => {
                const perfScore = Math.round((webCheckReport.quality.lighthouseResult?.categories?.performance?.score || 0) * 100);
                return (
                  <>
                    <span className={`score-card__value score-card__value--${perfScore >= 90 ? 'safe' : perfScore >= 50 ? 'medium' : 'high'}`}>
                      {perfScore}
                    </span>
                    <p className="score-card__label">Lighthouse Score</p>
                  </>
                );
              })()
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Mail Config */}
          {/* 🔍 WebCheck: Mail Config */}
          <div className="score-card">
            <h4 className="score-card__title">📧 Mail Config</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.['mail-config'] && !webCheckReport['mail-config'].error && !webCheckReport['mail-config'].skipped ? (
              <>
                <span className="score-card__value score-card__value--safe">
                  {webCheckReport['mail-config'].mxRecords?.length || 0}
                </span>
                <p className="score-card__label">MX Records Found</p>
              </>
            ) : webCheckReport?.['mail-config']?.skipped ? (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>No Mail Server</div>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: WHOIS */}
          {/* 🔍 WebCheck: WHOIS */}
          <div className="score-card">
            <h4 className="score-card__title">📋 WHOIS</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.whois && !webCheckReport.whois.error ? (
              <>
                <span className="score-card__value score-card__value--safe" style={{ fontSize: '0.9rem' }}>
                  {webCheckReport.whois.registrar?.substring(0, 20) || 'Found'}
                </span>
                <p className="score-card__label">Domain Registered</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: HSTS */}
          {/* 🔍 WebCheck: HSTS */}
          <div className="score-card">
            <h4 className="score-card__title">🔐 HSTS</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.hsts && !webCheckReport.hsts.error ? (
              <>
                <span className={`score-card__value score-card__value--${webCheckReport.hsts.hstsEnabled ? 'safe' : 'high'}`}>
                  {webCheckReport.hsts.hstsEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <p className="score-card__label">{webCheckReport.hsts.hstsPreloaded ? 'Preloaded' : 'Not Preloaded'}</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Block Lists */}
          {/* 🔍 WebCheck: Block Lists */}
          <div className="score-card">
            <h4 className="score-card__title">🚫 Block Lists</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.['block-lists'] && !webCheckReport['block-lists'].error ? (
              (() => {
                const blocklists = webCheckReport['block-lists'].blocklists || [];
                const blockedCount = blocklists.filter(b => b.isBlocked).length;
                return (
                  <>
                    <span className={`score-card__value score-card__value--${blockedCount === 0 ? 'safe' : 'high'}`}>
                      {blockedCount === 0 ? 'Clean' : `${blockedCount} Found`}
                    </span>
                    <p className="score-card__label">{blocklists.length} Lists Checked</p>
                  </>
                );
              })()
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Carbon Footprint */}
          {/* 🔍 WebCheck: Carbon Footprint */}
          <div className="score-card">
            <h4 className="score-card__title">🌱 Carbon</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.carbon && !webCheckReport.carbon.error ? (
              <>
                <span className={`score-card__value score-card__value--${webCheckReport.carbon.isGreen ? 'safe' : 'medium'}`}>
                  {webCheckReport.carbon.isGreen ? 'Green' : 'Standard'}
                </span>
                <p className="score-card__label">{webCheckReport.carbon.co2?.grid?.grams ? `${webCheckReport.carbon.co2.grid.grams.toFixed(2)}g CO2` : 'Hosting'}</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Archives */}
          {/* 🔍 WebCheck: Archives */}
          <div className="score-card">
            <h4 className="score-card__title">📚 Archives</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.archives?.skipped ? (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Not Archived</div>
            ) : webCheckReport?.archives?.totalScans ? (
              <>
                <span className="score-card__value score-card__value--safe">
                  {webCheckReport.archives.totalScans}
                </span>
                <p className="score-card__label">Wayback Snapshots</p>
              </>
            ) : webCheckReport?.archives?.error ? (
              <div className="score-card__label" style={{ color: '#ffb900', marginTop: '10px' }}>Timeout</div>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Sitemap */}
          {/* 🔍 WebCheck: Sitemap */}
          <div className="score-card">
            <h4 className="score-card__title">🗺️ Sitemap</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.sitemap?.skipped || webCheckReport?.sitemap?.error ? (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Not Found</div>
            ) : webCheckReport?.sitemap?.urlset ? (
              <>
                <span className="score-card__value score-card__value--safe">
                  {webCheckReport.sitemap.urlset?.url?.length || 'Found'}
                </span>
                <p className="score-card__label">URLs in Sitemap</p>
              </>
            ) : webCheckReport?.sitemap ? (
              <div className="score-card__value score-card__value--safe" style={{ fontSize: '1.2rem' }}>Found</div>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Social Tags */}
          {/* 🔍 WebCheck: Social Tags */}
          <div className="score-card">
            <h4 className="score-card__title">📱 Social Tags</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.['social-tags'] && !webCheckReport['social-tags'].error ? (
              (() => {
                const tags = webCheckReport['social-tags'];
                const hasOg = tags.ogTitle || tags.openGraph?.title;
                const hasTwitter = tags.twitterCard || tags.twitter?.card;
                return (
                  <>
                    <span className={`score-card__value score-card__value--${(hasOg || hasTwitter) ? 'safe' : 'medium'}`}>
                      {(hasOg && hasTwitter) ? 'Complete' : (hasOg || hasTwitter) ? 'Partial' : 'Missing'}
                    </span>
                    <p className="score-card__label">{hasOg ? 'OG' : ''}{hasOg && hasTwitter ? ' + ' : ''}{hasTwitter ? 'Twitter' : ''}</p>
                  </>
                );
              })()
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Linked Pages */}
          <div className="score-card">
            <h4 className="score-card__title">🔗 Links</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.['linked-pages'] && !webCheckReport['linked-pages'].error ? (
              <>
                <span className="score-card__value score-card__value--safe">
                  {webCheckReport['linked-pages'].internal?.length || webCheckReport['linked-pages'].links?.length || 0}
                </span>
                <p className="score-card__label">Links Found</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Redirects */}
          <div className="score-card">
            <h4 className="score-card__title">↪️ Redirects</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.redirects && !webCheckReport.redirects.error ? (
              <>
                <span className={`score-card__value score-card__value--${(webCheckReport.redirects.redirects?.length || 0) <= 2 ? 'safe' : 'medium'}`}>
                  {webCheckReport.redirects.redirects?.length || 0}
                </span>
                <p className="score-card__label">Redirect Hops</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: DNS Server */}
          <div className="score-card">
            <h4 className="score-card__title">🌐 DNS Server</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.['dns-server'] && !webCheckReport['dns-server'].error ? (
              <>
                <span className="score-card__value score-card__value--safe" style={{ fontSize: '1.2rem' }}>
                  {webCheckReport['dns-server'].dns?.length || 1}
                </span>
                <p className="score-card__label">Servers Found</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: DNSSEC */}
          <div className="score-card">
            <h4 className="score-card__title">🔑 DNSSEC</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.dnssec && !webCheckReport.dnssec.error ? (
              <>
                <span className={`score-card__value score-card__value--${webCheckReport.dnssec.isValid || webCheckReport.dnssec.enabled ? 'safe' : 'medium'}`} style={{ fontSize: '1.2rem' }}>
                  {webCheckReport.dnssec.isValid || webCheckReport.dnssec.enabled ? 'Valid' : 'Not Set'}
                </span>
                <p className="score-card__label">DNSSEC Status</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Security.txt */}
          <div className="score-card">
            <h4 className="score-card__title">📄 Security.txt</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.['security-txt'] && !webCheckReport['security-txt'].error ? (
              <>
                <span className={`score-card__value score-card__value--${webCheckReport['security-txt'].isPresent || webCheckReport['security-txt'].found ? 'safe' : 'medium'}`} style={{ fontSize: '1.2rem' }}>
                  {webCheckReport['security-txt'].isPresent || webCheckReport['security-txt'].found ? 'Found' : 'Missing'}
                </span>
                <p className="score-card__label">Security Policy</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Robots.txt */}
          <div className="score-card">
            <h4 className="score-card__title">🤖 Robots.txt</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.['robots-txt'] && !webCheckReport['robots-txt'].error ? (
              <>
                <span className={`score-card__value score-card__value--${webCheckReport['robots-txt'].exists || webCheckReport['robots-txt'].isPresent ? 'safe' : 'medium'}`} style={{ fontSize: '1.2rem' }}>
                  {webCheckReport['robots-txt'].exists || webCheckReport['robots-txt'].isPresent ? 'Found' : 'Missing'}
                </span>
                <p className="score-card__label">Crawler Rules</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Status */}
          <div className="score-card">
            <h4 className="score-card__title">🟢 Status</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.status && !webCheckReport.status.error ? (
              <>
                <span className={`score-card__value score-card__value--${webCheckReport.status.isUp || webCheckReport.status.statusCode === 200 ? 'safe' : 'high'}`}>
                  {webCheckReport.status.statusCode || (webCheckReport.status.isUp ? '200' : 'Down')}
                </span>
                <p className="score-card__label">{webCheckReport.status.responseTime ? `${webCheckReport.status.responseTime}ms` : 'HTTP Status'}</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
            )}
          </div>

          {/* 🔍 WebCheck: Legacy Rank */}
          <div className="score-card">
            <h4 className="score-card__title">📈 Rank</h4>
            {webCheckLoading ? (
              <div className="score-card__loading" style={{ color: 'var(--accent)', fontSize: '1rem' }}>{webCheckUploading ? `Uploading ${webCheckUploadProgress}%` : 'Scanning...'}</div>
            ) : webCheckReport?.['legacy-rank'] && !webCheckReport['legacy-rank'].error ? (
              <>
                <span className="score-card__value score-card__value--safe" style={{ fontSize: '1rem' }}>
                  #{webCheckReport['legacy-rank'].rank || webCheckReport['legacy-rank'].globalRank || 'N/A'}
                </span>
                <p className="score-card__label">Global Rank</p>
              </>
            ) : (
              <div className="score-card__label" style={{ color: '#888', marginTop: '10px' }}>Pending</div>
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
            <div className="screenshot-preview">
              <h4>📸 Website Screenshot <span>({screenshotSource})</span></h4>
              <img
                src={screenshotSrc}
                alt="Website Screenshot"
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
          <div className="zap-progress-card">
            <h3>⚡ OWASP ZAP Security Scan in Progress</h3>
            <p className="zap-status">
              {backendZapData.phase || 'Scanning'}: {backendZapData.progress || 0}%
            </p>
            <p className="zap-details">
              {backendZapData.message || 'Running comprehensive security tests...'}
            </p>
            {backendZapData.urlsFound > 0 && (
              <p className="zap-stats">
                Found {backendZapData.urlsFound} URLs • {backendZapData.alertsFound || 0} alerts so far
              </p>
            )}
            <p className="zap-details" style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
              This page will automatically update when the scan completes.
            </p>
          </div>
        )}

        {/* 🔍 WebCheck Detailed Results */}
        {webCheckReport && (
          <details style={{ marginBottom: '2rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', padding: '1rem', background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', borderRadius: '8px', border: '1px solid #00d084' }}>
              🔍 View WebCheck Analysis ({Object.keys(webCheckReport).filter(k => !webCheckReport[k]?.error).length} scans complete)
            </summary>
            <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>

              {/* SSL Details */}
              {webCheckReport.ssl && !webCheckReport.ssl.error && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🔐 SSL Certificate Details</h5>
                  <p><b>Subject:</b> {webCheckReport.ssl.subject?.CN || 'N/A'}</p>
                  <p><b>Issuer:</b> {webCheckReport.ssl.issuer?.O || 'N/A'}</p>
                  <p><b>Valid From:</b> {webCheckReport.ssl.valid_from || 'N/A'}</p>
                  <p><b>Valid To:</b> {webCheckReport.ssl.valid_to || 'N/A'}</p>
                </div>
              )}

              {/* DNS Records */}
              {webCheckReport.dns && !webCheckReport.dns.error && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🌐 DNS Records</h5>
                  <p><b>A Record:</b> {webCheckReport.dns.A?.address || JSON.stringify(webCheckReport.dns.AAAA) || 'N/A'}</p>
                  <p><b>MX Records:</b> {webCheckReport.dns.MX?.length || 0} found</p>
                  <p><b>NS Records:</b> {webCheckReport.dns.NS?.length || 0} found</p>
                  <p><b>TXT Records:</b> {webCheckReport.dns.TXT?.length || 0} found</p>
                </div>
              )}

              {/* Security Headers */}
              {webCheckReport['http-security'] && !webCheckReport['http-security'].error && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
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
                    <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
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
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🔌 Open Ports</h5>
                  <p>{webCheckReport.ports.openPorts.length > 0 ? webCheckReport.ports.openPorts.join(', ') : 'No common ports detected as open'}</p>
                </div>
              )}

              {/* Cookies */}
              {webCheckReport.cookies && !webCheckReport.cookies.error && !webCheckReport.cookies.skipped && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🍪 Cookies</h5>
                  <p><b>Header Cookies:</b> {webCheckReport.cookies.headerCookies?.length || 0}</p>
                  <p><b>Client Cookies:</b> {webCheckReport.cookies.clientCookies?.length || 0}</p>
                </div>
              )}

              {/* WHOIS Details */}
              {webCheckReport.whois && !webCheckReport.whois.error && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📋 WHOIS Information</h5>
                  <p><b>Registrar:</b> {webCheckReport.whois.registrar || 'N/A'}</p>
                  <p><b>Created:</b> {webCheckReport.whois.createdDate || webCheckReport.whois.created || 'N/A'}</p>
                  <p><b>Expires:</b> {webCheckReport.whois.expiresDate || webCheckReport.whois.expires || 'N/A'}</p>
                  <p><b>Updated:</b> {webCheckReport.whois.updatedDate || webCheckReport.whois.updated || 'N/A'}</p>
                </div>
              )}

              {/* Mail Config Details */}
              {webCheckReport['mail-config'] && !webCheckReport['mail-config'].error && !webCheckReport['mail-config'].skipped && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
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
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🔒 TLS Security (Observatory)</h5>
                  <p><b>Grade:</b> <span style={{ color: getObservatoryGradeColor(webCheckReport.tls.tlsInfo?.grade), fontWeight: 'bold' }}>{webCheckReport.tls.tlsInfo?.grade || 'N/A'}</span></p>
                  <p><b>Score:</b> {webCheckReport.tls.tlsInfo?.score || 0}/100</p>
                  <p><b>Host:</b> {webCheckReport.tls.tlsInfo?.host || 'N/A'}</p>
                </div>
              )}

              {/* Social Tags Details */}
              {webCheckReport['social-tags'] && !webCheckReport['social-tags'].error && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📱 Social Media Tags</h5>
                  <p><b>OG Title:</b> {webCheckReport['social-tags'].ogTitle || webCheckReport['social-tags'].openGraph?.title || 'N/A'}</p>
                  <p><b>OG Description:</b> {(webCheckReport['social-tags'].ogDescription || webCheckReport['social-tags'].openGraph?.description || 'N/A').substring(0, 100)}</p>
                  <p><b>Twitter Card:</b> {webCheckReport['social-tags'].twitterCard || webCheckReport['social-tags'].twitter?.card || 'N/A'}</p>
                </div>
              )}

              {/* Redirects Details */}
              {webCheckReport.redirects && !webCheckReport.redirects.error && webCheckReport.redirects.redirects?.length > 0 && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
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
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📚 Web Archive History</h5>
                  <p><b>Total Snapshots:</b> {webCheckReport.archives.scanCount || webCheckReport.archives.length || 'Available'}</p>
                  {webCheckReport.archives.firstScan && <p><b>First Snapshot:</b> {webCheckReport.archives.firstScan}</p>}
                  {webCheckReport.archives.lastScan && <p><b>Last Snapshot:</b> {webCheckReport.archives.lastScan}</p>}
                </div>
              )}

              {/* Carbon Footprint Details */}
              {webCheckReport.carbon && !webCheckReport.carbon.error && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
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
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
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
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📋 HTTP Headers</h5>
                  {Object.entries(webCheckReport.headers).slice(0, 10).map(([key, val]) => (
                    <p key={key} style={{ fontSize: '0.8rem' }}><b>{key}:</b> {String(val).substring(0, 60)}</p>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}

        {/* 🌐 URLScan.io Detailed Results */}
        {report?.hasUrlscanResult && report?.urlscanData && (
          <details style={{ marginBottom: '2rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', padding: '1rem', background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', borderRadius: '8px', border: '1px solid #00d084' }}>
              🌐 View URLScan.io Analysis
            </summary>
            <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>

              {/* Security Verdict */}
              <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>🛡️ Security Verdict</h5>
                <p><b>Overall:</b> <span style={{ color: report.urlscanData.verdicts?.overall?.malicious ? '#e81123' : '#00d084', fontWeight: 'bold' }}>
                  {report.urlscanData.verdicts?.overall?.malicious ? 'MALICIOUS' : 'CLEAN'}
                </span></p>
                <p><b>Threat Score:</b> {report.urlscanData.verdicts?.overall?.score || 0}</p>
                {report.urlscanData.verdicts?.urlscan?.score > 0 && (
                  <p><b>URLScan Score:</b> {report.urlscanData.verdicts.urlscan.score}</p>
                )}
                {report.urlscanData.verdicts?.engines?.malicious > 0 && (
                  <p><b>Engine Detections:</b> <span style={{ color: '#e81123' }}>{report.urlscanData.verdicts.engines.malicious} malicious</span></p>
                )}
                {report.urlscanData.verdicts?.community?.score > 0 && (
                  <p><b>Community Score:</b> {report.urlscanData.verdicts.community.score}</p>
                )}
              </div>

              {/* Page Information */}
              {report.urlscanData.page && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📄 Page Information</h5>
                  <p><b>Domain:</b> {report.urlscanData.page.domain || 'N/A'}</p>
                  <p><b>IP Address:</b> {report.urlscanData.page.ip || 'N/A'}</p>
                  <p><b>Country:</b> {report.urlscanData.page.country || 'N/A'}</p>
                  <p><b>Server:</b> {report.urlscanData.page.server || 'N/A'}</p>
                  {report.urlscanData.page.tlsIssuer && (
                    <p><b>TLS Issuer:</b> {report.urlscanData.page.tlsIssuer}</p>
                  )}
                  {report.urlscanData.page.tlsValidDays && (
                    <p><b>TLS Valid Days:</b> {report.urlscanData.page.tlsValidDays}</p>
                  )}
                </div>
              )}

              {/* Network Statistics */}
              {report.urlscanData.stats && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px' }}>
                  <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)' }}>📊 Network Statistics</h5>
                  <p><b>HTTP Requests:</b> {report.urlscanData.stats.requests || 0}</p>
                  <p><b>Unique IPs:</b> {report.urlscanData.stats.uniqIPs || 0}</p>
                  <p><b>Unique Countries:</b> {report.urlscanData.stats.uniqCountries || 0}</p>
                  <p><b>Data Transferred:</b> {report.urlscanData.stats.dataLength ? `${(report.urlscanData.stats.dataLength / 1024).toFixed(1)} KB` : 'N/A'}</p>
                </div>
              )}

              {/* View Full Report Link */}
              {report.urlscanData.reportUrl && (
                <div style={{ background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                  <a
                    href={report.urlscanData.reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: 'bold', fontSize: '1rem' }}
                  >
                    View Full URLScan.io Report ↗
                  </a>
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
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', padding: '1rem', background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)', borderRadius: '8px' }}>
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

        {/* Download Reports Section */}
        {report?.analysisId && report?.status === 'completed' && (
          <div className="download-section">
            <h4>📥 Download Scan Reports</h4>
            <p>
              Download your complete security scan results in your preferred format
            </p>
            <div className="download-buttons">
              {/* PDF Download Dropdown */}
              <div className="pdf-dropdown-container">
                <button
                  className="download-btn download-btn--pdf"
                  disabled={pdfDownloading}
                  onClick={() => !pdfDownloading && setPdfDropdownOpen(!pdfDropdownOpen)}
                >
                  {pdfDownloading ? '⏳ Generating...' : '📄 Download PDF Report ▾'}
                </button>

                {pdfDropdownOpen && !pdfDownloading && (
                  <div className="pdf-dropdown-menu">
                    <button
                      onClick={async () => {
                        setPdfDropdownOpen(false);
                        try {
                          setPdfDownloading(true);
                          setPdfProgress(0);
                          setPdfProgressMessage('Initializing English PDF...');

                          // Progress steps for English (faster - no translation)
                          const progressSteps = [
                            { progress: 15, message: 'Formatting scan data...', delay: 2000 },
                            { progress: 35, message: 'Waiting for API rate limit...', delay: 8000 },
                            { progress: 55, message: 'Formatting AI analysis...', delay: 15000 },
                            { progress: 80, message: 'Rendering PDF document...', delay: 5000 },
                            { progress: 95, message: 'Finalizing...', delay: 3000 },
                          ];

                          let currentStep = 0;
                          const progressInterval = setInterval(() => {
                            if (currentStep < progressSteps.length) {
                              setPdfProgress(progressSteps[currentStep].progress);
                              setPdfProgressMessage(progressSteps[currentStep].message);
                              currentStep++;
                            }
                          }, 6000);

                          const token = localStorage.getItem('token');
                          const response = await fetch(`${API_BASE}/api/vt/download-pdf/${report.analysisId}?lang=en`, {
                            headers: { 'x-auth-token': token }
                          });

                          clearInterval(progressInterval);

                          if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            throw new Error(errorData.error || 'PDF download failed');
                          }

                          setPdfProgress(100);
                          setPdfProgressMessage('Download complete!');

                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `security_report_EN_${report.target.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                          console.log('✅ English PDF report downloaded');

                          setTimeout(() => {
                            setPdfDownloading(false);
                            setPdfProgress(0);
                            setPdfProgressMessage('');
                          }, 2000);
                        } catch (err) {
                          console.error('❌ PDF download failed:', err);
                          setPdfProgressMessage(`Error: ${err.message}`);
                          setTimeout(() => {
                            setPdfDownloading(false);
                            setPdfProgress(0);
                            setPdfProgressMessage('');
                          }, 3000);
                        }
                      }}
                    >
                      English Version
                    </button>
                    <button
                      onClick={async () => {
                        setPdfDropdownOpen(false);
                        try {
                          setPdfDownloading(true);
                          setPdfProgress(0);
                          setPdfProgressMessage('Initializing Japanese PDF...');

                          // Progress steps for Japanese (includes translation)
                          const progressSteps = [
                            { progress: 10, message: 'Formatting scan data...', delay: 2000 },
                            { progress: 25, message: 'Waiting for API rate limit...', delay: 8000 },
                            { progress: 40, message: 'Formatting AI analysis...', delay: 15000 },
                            { progress: 55, message: 'Waiting for API rate limit...', delay: 8000 },
                            { progress: 70, message: 'Translating to Japanese...', delay: 15000 },
                            { progress: 85, message: 'Rendering PDF document...', delay: 5000 },
                            { progress: 95, message: 'Finalizing...', delay: 3000 },
                          ];

                          let currentStep = 0;
                          const progressInterval = setInterval(() => {
                            if (currentStep < progressSteps.length) {
                              setPdfProgress(progressSteps[currentStep].progress);
                              setPdfProgressMessage(progressSteps[currentStep].message);
                              currentStep++;
                            }
                          }, 8000);

                          const token = localStorage.getItem('token');
                          const response = await fetch(`${API_BASE}/api/vt/download-pdf/${report.analysisId}?lang=ja`, {
                            headers: { 'x-auth-token': token }
                          });

                          clearInterval(progressInterval);

                          if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            throw new Error(errorData.error || 'PDF download failed');
                          }

                          setPdfProgress(100);
                          setPdfProgressMessage('Download complete!');

                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `security_report_JA_${report.target.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                          console.log('✅ Japanese PDF report downloaded');

                          setTimeout(() => {
                            setPdfDownloading(false);
                            setPdfProgress(0);
                            setPdfProgressMessage('');
                          }, 2000);
                        } catch (err) {
                          console.error('❌ PDF download failed:', err);
                          setPdfProgressMessage(`Error: ${err.message}`);
                          setTimeout(() => {
                            setPdfDownloading(false);
                            setPdfProgress(0);
                            setPdfProgressMessage('');
                          }, 3000);
                        }
                      }}
                    >
                      Japanese Version
                    </button>
                  </div>
                )}
              </div>
              <button
                className="download-btn download-btn--json"
                disabled={pdfDownloading}
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
              >
                📥 Download JSON Data
              </button>
            </div>

            {/* PDF Download Progress Bar */}
            {pdfDownloading && (
              <div className="pdf-progress-container">
                <div className="pdf-progress-bar">
                  <div
                    className="pdf-progress-fill"
                    style={{ width: `${pdfProgress}%` }}
                  />
                </div>
                <p className="pdf-progress-message">{pdfProgressMessage}</p>
                <p className="pdf-progress-note">
                  PDF generation includes AI formatting and Japanese translation. This may take up to 2 minutes.
                </p>
              </div>
            )}

            <p className="download-note">
              PDF: Professional bilingual report (EN + JA) | JSON: Raw data for analysis
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
            <input id="url-input" name="url" type="text" placeholder="E.g. https://google.com" defaultValue={scanUrl || "https://google.com"} required disabled={loading} />
            {!loading ? (
              <button type="submit" className="analyze-button">
                <span className="button-text">Analyze URL</span>
              </button>
            ) : (
              <button type="button" onClick={handleStopScan} className="stop-button">
                <span className="button-text">Stop Scan</span>
              </button>
            )}
          </div>
        </form>
        {renderReport()}
      </div>
    </section>
  );
};

export default Hero;