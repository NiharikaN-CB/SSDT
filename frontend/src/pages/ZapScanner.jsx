import React, { useState, useEffect, useCallback } from 'react';
import ParticleBackground from '../components/ParticleBackground'; // Import background to match theme

const ZapScanner = () => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [spiderId, setSpiderId] = useState(null);
  const [ascanId, setAscanId] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [currentStep, setCurrentStep] = useState('IDLE');
  const [expandedRows, setExpandedRows] = useState({});

  // Toggle row expansion
  const toggleRow = (idx) => {
    setExpandedRows(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // --- Grouping Helper ---
  const groupAlerts = (rawAlerts) => {
    const grouped = {};
    rawAlerts.forEach(alert => {
      if (!grouped[alert.alert]) {
        grouped[alert.alert] = {
          name: alert.alert,
          risk: alert.risk,
          count: 0,
          description: alert.description,
          instances: []
        };
      }
      grouped[alert.alert].count += 1;
      grouped[alert.alert].instances.push({
        url: alert.url,
        method: alert.method,
        param: alert.param
      });
    });
    return Object.values(grouped).sort((a, b) => {
      const riskOrder = { 'High': 4, 'Medium': 3, 'Low': 2, 'Informational': 1 };
      return riskOrder[b.risk] - riskOrder[a.risk];
    });
  };

  // --- Fetch Results ---
  const fetchResults = useCallback(async () => {
    setStatus('📊 Fetching Vulnerability Report...');
    try {
      const res = await fetch(`http://localhost:3001/api/zap/alerts?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      const grouped = groupAlerts(data.alerts || []);
      setAlerts(grouped);
      setStatus('✅ Full Scan Complete!');
      setCurrentStep('FINISHED');
    } catch (err) {
      console.error(err);
      setStatus('❌ Failed to load results');
    }
  }, [url]);

  // --- Start Active Scan ---
  const startActiveScan = useCallback(async () => {
    setStatus('⚡ Starting Active Scan (Attacking site)...');
    setProgress(0);
    setCurrentStep('ASCAN');
    try {
      const res = await fetch('http://localhost:3001/api/zap/ascan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data.scanId) {
        setAscanId(data.scanId);
      } else {
        setStatus('❌ Active Scan Failed to Start');
        setCurrentStep('IDLE');
      }
    } catch (err) {
      setStatus('❌ Connection Error during Active Scan');
      setCurrentStep('IDLE');
    }
  }, [url]);

  // --- Start Spider ---
  const startSpider = async (e) => {
    e.preventDefault();
    setStatus('🕷️ Starting Spider Scan (Mapping site)...');
    setProgress(0);
    setAlerts([]);
    setExpandedRows({});
    setCurrentStep('SPIDER');
    try {
      const res = await fetch('http://localhost:3001/api/zap/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data.scanId) setSpiderId(data.scanId);
      else {
        setStatus(`❌ Spider Error: ${data.error || 'Unknown'}`);
        setCurrentStep('IDLE');
      }
    } catch (err) {
      setStatus('❌ Connection Error: Backend not reachable');
      setCurrentStep('IDLE');
    }
  };

  // --- Polling ---
  useEffect(() => {
    let interval;
    if (currentStep === 'SPIDER' && spiderId) {
      interval = setInterval(async () => {
        const res = await fetch(`http://localhost:3001/api/zap/status/${spiderId}`);
        const data = await res.json();
        setProgress(parseInt(data.progress));
        if (parseInt(data.progress) >= 100) {
          clearInterval(interval);
          setStatus('✅ Spider Complete. Switching to Active Scan...');
          setTimeout(() => startActiveScan(), 1000);
        }
      }, 2000);
    }
    if (currentStep === 'ASCAN' && ascanId) {
      interval = setInterval(async () => {
        const res = await fetch(`http://localhost:3001/api/zap/ascan/status/${ascanId}`);
        const data = await res.json();
        setProgress(parseInt(data.progress));
        if (parseInt(data.progress) >= 100) {
          clearInterval(interval);
          fetchResults();
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [currentStep, spiderId, ascanId, startActiveScan, fetchResults]);

  const getRiskColor = (risk) => {
    switch(risk) {
      case 'High': return '#ff4d4d'; // Bright Red
      case 'Medium': return '#ffa500'; // Orange
      case 'Low': return '#00bfff'; // Blue
      default: return '#00cc66'; // Green
    }
  };

  return (
    <div style={styles.pageWrapper}>
      {/* Add Background to match landing page */}
      <ParticleBackground />
      
      <div style={styles.container}>
        <h2 style={styles.title}>🛡️ Automated Vulnerability Scanner</h2>
        
        <form onSubmit={startSpider} style={styles.form}>
          <input 
            type="url" 
            value={url} 
            onChange={(e) => setUrl(e.target.value)} 
            placeholder="http://testphp.vulnweb.com" 
            required 
            style={styles.input} 
          />
          <button 
            type="submit" 
            disabled={currentStep === 'SPIDER' || currentStep === 'ASCAN'} 
            style={{
              ...styles.button,
              ...(currentStep === 'IDLE' || currentStep === 'FINISHED' ? {} : styles.buttonDisabled)
            }}
          >
            {currentStep === 'IDLE' || currentStep === 'FINISHED' ? 'Start Full Scan' : 'Scanning...'}
          </button>
        </form>

        <h3 style={styles.status}>{status}</h3>

        {(currentStep === 'SPIDER' || currentStep === 'ASCAN') && (
          <div style={styles.progressContainer}>
            <div style={{ 
              ...styles.progressBar, 
              width: `${progress}%`,
              background: currentStep === 'SPIDER' ? '#007bff' : '#dc3545'
            }}>
              {currentStep === 'SPIDER' ? `Mapping: ${progress}%` : `Attacking: ${progress}%`}
            </div>
          </div>
        )}

        {alerts.length > 0 && (
          <div style={styles.resultsContainer}>
            <h3 style={styles.resultsHeader}>🔍 Security Report Summary</h3>
            
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={{ ...styles.th, width: '15%' }}>Risk Level</th>
                  <th style={{ ...styles.th, width: '35%' }}>Vulnerability Type</th>
                  <th style={{ ...styles.th, width: '50%' }}>Affected Instances (Sample)</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert, idx) => {
                  const isExpanded = expandedRows[idx];
                  const instancesToShow = isExpanded ? alert.instances : alert.instances.slice(0, 2);
                  
                  return (
                    <tr 
                      key={idx} 
                      style={{
                        ...styles.tr,
                        backgroundColor: isExpanded ? 'rgba(255,255,255,0.05)' : 'transparent'
                      }} 
                      onClick={() => toggleRow(idx)}
                    >
                      <td style={{ ...styles.td, verticalAlign: 'top' }}>
                        <span style={{ 
                          ...styles.riskBadge, 
                          color: getRiskColor(alert.risk), 
                          borderColor: getRiskColor(alert.risk),
                          backgroundColor: `${getRiskColor(alert.risk)}20`
                        }}>
                          {alert.risk}
                        </span>
                      </td>

                      <td style={{ ...styles.td, verticalAlign: 'top' }}>
                        <div style={styles.alertName}>
                          {alert.name} 
                          <span style={styles.countBadge}>x{alert.count}</span>
                        </div>
                        <div style={styles.description}>
                          {isExpanded ? alert.description : (alert.description.length > 150 ? alert.description.substring(0, 150) + '...' : alert.description)}
                        </div>
                        <div style={styles.expandText}>
                          {isExpanded ? '🔼 Collapse Details' : '🔽 Click to Expand'}
                        </div>
                      </td>

                      <td style={{ ...styles.td, verticalAlign: 'top', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {instancesToShow.map((inst, i) => (
                          <div key={i} style={{ marginBottom: '6px', borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '2px' }}>
                            <strong style={{ color: '#4dabf7' }}>{inst.method}</strong> {inst.url.length > 50 ? '...' + inst.url.slice(-50) : inst.url}
                          </div>
                        ))}
                        {!isExpanded && alert.count > 2 && (
                          <div style={{ color: '#888', fontStyle: 'italic', marginTop: '5px' }}>
                            ...and {alert.count - 2} more
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// --- DARK THEME STYLES ---
const styles = {
  pageWrapper: {
    minHeight: '100vh',
    position: 'relative',
    paddingTop: '100px', // Space for fixed header
    paddingBottom: '50px',
    display: 'flex',
    justifyContent: 'center',
  },
  container: {
    position: 'relative',
    zIndex: 2,
    width: '100%',
    maxWidth: '1100px',
    background: 'rgba(20, 20, 30, 0.85)', // Dark Glass
    backdropFilter: 'blur(12px)',
    borderRadius: '16px',
    padding: '40px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#fff',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  title: {
    textAlign: 'center',
    marginBottom: '30px',
    fontSize: '2rem',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
  },
  form: {
    display: 'flex',
    gap: '15px',
    marginBottom: '25px',
  },
  input: {
    flex: 1,
    padding: '15px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: 'white',
    fontSize: '1rem',
    outline: 'none',
  },
  button: {
    padding: '15px 30px',
    backgroundColor: '#e81123', // Red for danger/action
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  buttonDisabled: {
    backgroundColor: '#555',
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  status: {
    textAlign: 'center',
    color: '#bbb',
    minHeight: '27px',
    marginBottom: '20px',
  },
  progressContainer: {
    width: '100%',
    background: 'rgba(255,255,255,0.1)',
    height: '25px',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '30px',
  },
  progressBar: {
    height: '100%',
    textAlign: 'center',
    color: 'white',
    fontWeight: 'bold',
    lineHeight: '25px',
    transition: 'width 0.5s ease-in-out',
    fontSize: '0.9rem',
  },
  resultsContainer: {
    marginTop: '40px',
    animation: 'fadeIn 0.5s',
  },
  resultsHeader: {
    borderBottom: '2px solid rgba(255,255,255,0.1)',
    paddingBottom: '15px',
    marginBottom: '0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    color: '#ddd',
  },
  tableHeaderRow: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    textAlign: 'left',
  },
  th: {
    padding: '15px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
  },
  tr: {
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  td: {
    padding: '15px',
  },
  riskBadge: {
    fontWeight: 'bold',
    borderWidth: '1px',
    borderStyle: 'solid',
    padding: '5px 10px',
    borderRadius: '4px',
    display: 'inline-block',
    width: '100%',
    textAlign: 'center',
  },
  alertName: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '5px',
  },
  countBadge: {
    marginLeft: '10px',
    fontSize: '0.8rem',
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: '2px 8px',
    borderRadius: '12px',
    color: '#fff',
  },
  description: {
    fontSize: '0.9rem',
    color: '#aaa',
    lineHeight: '1.5',
  },
  expandText: {
    marginTop: '10px',
    fontSize: '0.8rem',
    color: '#4dabf7',
    fontWeight: 'bold',
  },
};

export default ZapScanner;