import React, { useState, useRef, useEffect, useCallback } from 'react';
import ZapReportEnhanced from './ZapReportEnhanced';
import '../styles/AuthenticatedScan.scss';

const API_BASE = 'http://localhost:3001';

const STEPS = [
  { id: 1, label: 'Configure' },
  { id: 2, label: 'Credentials' },
  { id: 3, label: 'Verify' },
  { id: 4, label: 'Scanning' },
  { id: 5, label: 'Results' }
];

const AuthenticatedScanPanel = () => {
  // Wizard state
  const [step, setStep] = useState(1);

  // Step 1: URL configuration
  const [targetUrl, setTargetUrl] = useState('');
  const [loginUrl, setLoginUrl] = useState('');

  // Step 1-2: Detection
  const [detecting, setDetecting] = useState(false);
  const [detectedFields, setDetectedFields] = useState(null);
  const [detectionError, setDetectionError] = useState(null);

  // Step 2: Dynamic credentials
  const [selectedFields, setSelectedFields] = useState([]); // Array of selected field objects
  const [credentials, setCredentials] = useState({}); // Map: { [selector]: value }
  const [showPasswords, setShowPasswords] = useState({}); // Map: { [selector]: boolean }
  const [selectedSubmitButton, setSelectedSubmitButton] = useState(null);

  // Step 2-3: Login test
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [tempSessionId, setTempSessionId] = useState(null);

  // Step 4: Scan
  const [scanId, setScanId] = useState(null);
  const [scanPhase, setScanPhase] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState('');
  const [scanning, setScanning] = useState(false);

  // Step 5: Results
  const [scanResult, setScanResult] = useState(null);

  // General UI
  const [error, setError] = useState(null);

  // Polling refs
  const pollingIntervalRef = useRef(null);
  const isPollingRef = useRef(false);

  // Get headers with auth token
  const getHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'x-auth-token': token
    };
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // ========== Step 1: Detect Login Fields ==========
  const handleDetectFields = async () => {
    if (!loginUrl) return;

    setDetecting(true);
    setDetectionError(null);
    setDetectedFields(null);

    try {
      const res = await fetch(`${API_BASE}/api/zap-auth/detect-login-fields`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ loginUrl })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Detection failed');
      }

      if (!data.success) {
        setDetectionError(data.error || 'Could not analyze the login page');
        return;
      }

      setDetectedFields(data);

      // Auto-select fields from first form
      if (data.forms && data.forms.length > 0) {
        const form = data.forms[0];

        // Auto-select input fields (not buttons)
        const inputFields = form.fields.filter(f =>
          f.tagName === 'INPUT' &&
          f.inputType !== 'submit' &&
          f.inputType !== 'button'
        );

        setSelectedFields(inputFields);

        // Initialize credentials object
        const initialCreds = {};
        inputFields.forEach(field => {
          initialCreds[field.selector] = '';
        });
        setCredentials(initialCreds);

        // Auto-select submit button
        if (form.submitButton) {
          setSelectedSubmitButton(form.submitButton);
        }

        setStep(2);
      } else {
        setDetectionError('No login forms detected on this page.');
      }
    } catch (err) {
      setDetectionError(err.message);
    } finally {
      setDetecting(false);
    }
  };

  // Handle field selection toggle
  const handleFieldToggle = (field) => {
    const isSelected = selectedFields.some(f => f.selector === field.selector);

    if (isSelected) {
      // Remove field
      setSelectedFields(selectedFields.filter(f => f.selector !== field.selector));
      const newCreds = { ...credentials };
      delete newCreds[field.selector];
      setCredentials(newCreds);
    } else {
      // Add field
      setSelectedFields([...selectedFields, field]);
      setCredentials({ ...credentials, [field.selector]: '' });
    }
  };

  // Update credential value
  const handleCredentialChange = (selector, value) => {
    setCredentials({ ...credentials, [selector]: value });
  };

  // Toggle password visibility for a field
  const togglePasswordVisibility = (selector) => {
    setShowPasswords({ ...showPasswords, [selector]: !showPasswords[selector] });
  };

  // ========== Step 2: Test Login ==========
  const handleTestLogin = async () => {
    // Check if all selected fields have values
    const hasEmptyFields = selectedFields.some(field => !credentials[field.selector]);
    if (hasEmptyFields) {
      setError('Please fill in all credential fields');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/zap-auth/test-login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          loginUrl,
          credentials: selectedFields.map(field => ({
            selector: field.selector,
            value: credentials[field.selector],
            inputType: field.inputType
          })),
          submitButton: selectedSubmitButton
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login test failed');
      }

      setTestResult(data);

      if (data.authenticated && data.tempSessionId) {
        setTempSessionId(data.tempSessionId);
        // Clear sensitive credentials from state
        const clearedCreds = {};
        Object.keys(credentials).forEach(key => {
          clearedCreds[key] = '';
        });
        setCredentials(clearedCreds);
        setStep(3);
      }
    } catch (err) {
      setTestResult({ authenticated: false, errorMessage: err.message });
    } finally {
      setTesting(false);
    }
  };

  // ========== Step 3: Start Scan ==========
  const handleStartScan = async () => {
    if (!tempSessionId) {
      setError('Session expired. Please test login again.');
      return;
    }

    setError(null);
    setScanning(true);

    try {
      const res = await fetch(`${API_BASE}/api/zap-auth/scan`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          targetUrl,
          loginUrl,
          tempSessionId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'SESSION_EXPIRED') {
          setError('Session expired. Please test login again.');
          setStep(2);
          setScanning(false);
          return;
        }
        throw new Error(data.error || 'Failed to start scan');
      }

      setScanId(data.scanId);
      setStep(4);

      // Start polling for progress
      startPolling(data.scanId);
    } catch (err) {
      setError(err.message);
      setScanning(false);
    }
  };

  // ========== Step 4: Poll Scan Status ==========
  const startPolling = useCallback((scanId) => {
    if (isPollingRef.current) return;

    isPollingRef.current = true;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/zap-auth/status/${scanId}`, {
          headers: getHeaders()
        });

        if (!res.ok) {
          throw new Error('Failed to get scan status');
        }

        const data = await res.json();

        setScanPhase(data.phase || '');
        setScanProgress(data.progress || 0);
        setScanMessage(data.message || '');

        if (data.status === 'completed') {
          clearInterval(pollingIntervalRef.current);
          isPollingRef.current = false;
          setScanResult(data);
          setStep(5);
        } else if (data.status === 'failed') {
          clearInterval(pollingIntervalRef.current);
          isPollingRef.current = false;
          setError(data.error || 'Scan failed');
          setScanning(false);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Poll immediately then every 3 seconds
    poll();
    pollingIntervalRef.current = setInterval(poll, 3000);
  }, []);

  // ========== Stop Scan ==========
  const handleStopScan = async () => {
    if (!scanId) return;

    try {
      await fetch(`${API_BASE}/api/zap-auth/stop/${scanId}`, {
        method: 'POST',
        headers: getHeaders()
      });

      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      isPollingRef.current = false;

      setError('Scan stopped by user');
      setScanning(false);
    } catch (err) {
      console.error('Failed to stop scan:', err);
    }
  };

  // ========== New Scan ==========
  const handleNewScan = () => {
    // Reset all state
    setStep(1);
    setTargetUrl('');
    setLoginUrl('');
    setDetectedFields(null);
    setDetectionError(null);
    setSelectedFields([]);
    setCredentials({});
    setShowPasswords({});
    setSelectedSubmitButton(null);
    setTestResult(null);
    setTempSessionId(null);
    setScanId(null);
    setScanPhase('');
    setScanProgress(0);
    setScanMessage('');
    setScanning(false);
    setScanResult(null);
    setError(null);

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    isPollingRef.current = false;
  };

  // Get field label for display
  const getFieldLabel = (field) => {
    if (field.label) return field.label;
    if (field.placeholder) return field.placeholder;
    if (field.name) return field.name;
    if (field.id) return field.id;
    return field.inputType || 'Field';
  };

  // Render field selector helper
  const renderFieldSelector = (label, options, selected, onChange) => {
    if (!options || options.length === 0) return null;

    return (
      <div className="field-selector">
        <label>{label}</label>
        <select value={selected || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">-- Select {label} --</option>
          {options.map((field, idx) => (
            <option key={idx} value={field.selector}>
              {getFieldLabel(field)} [{field.inputType || field.tagName.toLowerCase()}]
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="auth-scan-panel">
      <div className="panel-content">
        {/* Security Disclaimer */}
        <div className="security-disclaimer">
          🔒 Your credentials are never stored and are handled securely in-memory during the scan
        </div>

        {/* Step Indicators */}
        <div className="step-indicators">
          {STEPS.map((s, idx) => (
            <div
              key={s.id}
              className={`step-indicator ${s.id <= step ? 'active' : ''} ${s.id === step ? 'current' : ''}`}
            >
              <div className="step-circle">{s.id}</div>
              <div className="step-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button className="dismiss-btn" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* Step 1: Configure URLs */}
        {step === 1 && (
          <div className="step-content">
            <h2>Configure Scan</h2>
            <p className="step-description">
              Enter the target URL to scan and the login page URL
            </p>

            <div className="form-group">
              <label htmlFor="targetUrl">Target URL</label>
              <input
                id="targetUrl"
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com"
                className="url-input"
              />
              <span className="help-text">The main URL you want to scan for vulnerabilities</span>
            </div>

            <div className="form-group">
              <label htmlFor="loginUrl">Login Page URL</label>
              <input
                id="loginUrl"
                type="text"
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                placeholder="https://example.com/login"
                className="url-input"
              />
              <span className="help-text">The URL of the login page (can be the same as target URL)</span>
            </div>

            <div className="step-actions">
              <button
                className="primary-btn"
                onClick={handleDetectFields}
                disabled={!targetUrl || !loginUrl || detecting}
              >
                {detecting && <span className="spinner" />}
                <span>{detecting ? 'Detecting Fields...' : 'Detect Login Fields'}</span>
              </button>
            </div>

            {detectionError && (
              <div className="detection-error">
                <strong>Detection Error:</strong> {detectionError}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Enter Credentials */}
        {step === 2 && detectedFields && (
          <div className="step-content">
            <h2>Enter Credentials</h2>
            <p className="step-description">
              Select the login fields and enter your credentials
            </p>

            {/* Detection Summary */}
            <div className="detection-summary">
              <h3>Detected Login Form</h3>
              <p className="page-title">Page: {detectedFields.pageTitle}</p>

              {/* Warnings */}
              {detectedFields.warnings && detectedFields.warnings.length > 0 && (
                <div className="warnings">
                  {detectedFields.warnings.map((warning, idx) => (
                    <div key={idx} className="warning-item">
                      ⚠️ {warning}
                    </div>
                  ))}
                </div>
              )}

              {/* Field Selection */}
              {detectedFields.forms && detectedFields.forms[0] && (
                <div className="field-selection">
                  <h4>Available Fields:</h4>
                  {detectedFields.forms[0].fields
                    .filter(f => f.tagName === 'INPUT' && f.inputType !== 'submit' && f.inputType !== 'button')
                    .map((field, idx) => (
                      <label key={idx} className="field-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedFields.some(f => f.selector === field.selector)}
                          onChange={() => handleFieldToggle(field)}
                        />
                        <span className="field-label">
                          {getFieldLabel(field)}
                          <span className="field-type"> [{field.inputType}]</span>
                        </span>
                      </label>
                    ))}
                </div>
              )}

              {/* Submit Button Selector */}
              {detectedFields.forms && detectedFields.forms[0] && (
                <div className="field-selectors">
                  {renderFieldSelector(
                    'Submit Button',
                    detectedFields.forms[0].fields.filter(f =>
                      f.tagName === 'BUTTON' || f.inputType === 'submit'
                    ),
                    selectedSubmitButton,
                    setSelectedSubmitButton
                  )}
                  <div className="submit-button-hint">
                    💡 <strong>Tip:</strong> If login fails, try selecting a different submit button from the dropdown above and test again.
                  </div>
                </div>
              )}
            </div>

            {/* Dynamic Credential Inputs */}
            <div className="credential-inputs">
              {selectedFields.map((field, idx) => (
                <div key={idx} className="form-group">
                  <label htmlFor={`cred-${idx}`}>
                    {getFieldLabel(field)}
                  </label>

                  {field.inputType === 'password' ? (
                    <div className="password-wrapper">
                      <input
                        id={`cred-${idx}`}
                        type={showPasswords[field.selector] ? 'text' : 'password'}
                        value={credentials[field.selector] || ''}
                        onChange={(e) => handleCredentialChange(field.selector, e.target.value)}
                        placeholder={`Enter ${getFieldLabel(field)}`}
                        className="url-input"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="toggle-password"
                        onClick={() => togglePasswordVisibility(field.selector)}
                      >
                        {showPasswords[field.selector] ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  ) : (
                    <input
                      id={`cred-${idx}`}
                      type="text"
                      value={credentials[field.selector] || ''}
                      onChange={(e) => handleCredentialChange(field.selector, e.target.value)}
                      placeholder={`Enter ${getFieldLabel(field)}`}
                      className="url-input"
                      autoComplete="off"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="step-actions">
              <button className="secondary-btn" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="primary-btn"
                onClick={handleTestLogin}
                disabled={testing || selectedFields.length === 0}
              >
                {testing && <span className="spinner" />}
                <span>{testing ? 'Testing Login...' : 'Test Login'}</span>
              </button>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`test-result ${testResult.authenticated ? 'test-success' : 'test-fail'}`}>
                {testResult.authenticated ? (
                  <>
                    <strong>✅ Login Successful!</strong>
                    <p>Credentials verified. Session cookies captured.</p>
                    {testResult.postLoginUrl && (
                      <p>
                        Redirected to: <span className="post-login-url">{testResult.postLoginUrl}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <strong>❌ Login Failed</strong>
                    <p>{testResult.errorMessage || 'Could not authenticate with provided credentials'}</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Verify & Start Scan */}
        {step === 3 && (
          <div className="step-content">
            <h2>Verify Configuration</h2>
            <p className="step-description">
              Review your configuration and start the authenticated security scan
            </p>

            {/* Test Result */}
            {testResult && testResult.authenticated && (
              <div className="test-result test-success">
                <strong>✅ Authentication Verified</strong>
                <p>Ready to start authenticated security scan</p>
              </div>
            )}

            {/* Scan Summary */}
            <div className="scan-summary">
              <div className="summary-item">
                <span className="summary-label">Target:</span>
                <span className="summary-value">{targetUrl}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Login URL:</span>
                <span className="summary-value">{loginUrl}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Fields:</span>
                <span className="summary-value">{selectedFields.length} credential field(s)</span>
              </div>
            </div>

            <div className="step-actions">
              <button className="secondary-btn" onClick={() => setStep(2)}>
                Back
              </button>
              <button
                className="primary-btn start-scan-btn"
                onClick={handleStartScan}
                disabled={scanning}
              >
                {scanning && <span className="spinner" />}
                <span>Start Authenticated Scan</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Scanning */}
        {step === 4 && (
          <div className="step-content">
            <h2>Scanning in Progress</h2>
            <p className="step-description">
              Please wait while we scan the authenticated areas for security vulnerabilities
            </p>

            {/* Progress Bar */}
            <div className="scan-progress-section">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${scanProgress}%` }} />
              </div>
              <div className="progress-info">
                <span className="progress-percent">{scanProgress}%</span>
                <span className="progress-phase">{scanPhase}</span>
              </div>
              {scanMessage && <p className="progress-message">{scanMessage}</p>}
            </div>

            {/* Scan Details */}
            {scanId && (
              <div className="scan-details">
                <div className="detail-item">
                  <span>Scan ID:</span>
                  <span className="scan-id">{scanId}</span>
                </div>
              </div>
            )}

            <button className="stop-btn" onClick={handleStopScan}>
              Stop Scan
            </button>
          </div>
        )}

        {/* Step 5: Results */}
        {step === 5 && scanResult && (
          <div className="step-content">
            <h2>Scan Complete</h2>
            <p className="step-description">
              Security scan completed. Review the findings below.
            </p>

            {/* Results Summary */}
            {scanResult.summary && (
              <div className="results-header">
                <div className="result-stat">
                  <span className="stat-label">Total Alerts</span>
                  <span className="stat-value">{scanResult.summary.totalAlerts || 0}</span>
                </div>
                <div className="result-stat">
                  <span className="stat-label">High Risk</span>
                  <span className="stat-value">{scanResult.summary.high || 0}</span>
                </div>
                <div className="result-stat">
                  <span className="stat-label">Medium Risk</span>
                  <span className="stat-value">{scanResult.summary.medium || 0}</span>
                </div>
                <div className="result-stat">
                  <span className="stat-label">Low Risk</span>
                  <span className="stat-value">{scanResult.summary.low || 0}</span>
                </div>
              </div>
            )}

            {/* ZAP Report */}
            {scanResult.analysisId && (
              <ZapReportEnhanced
                scanId={scanResult.analysisId}
                apiPrefix="/api/zap-auth"
              />
            )}

            <button className="primary-btn new-scan-btn" onClick={handleNewScan}>
              Start New Scan
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthenticatedScanPanel;
