// Enhanced ZAP Report Display Component
// Shows vulnerabilities grouped by type with expandable URL lists
// File: frontend/src/components/ZapReportEnhanced.jsx

import React, { useState } from 'react';
import '../styles/ZapReportEnhanced.scss';

const API_BASE = 'http://localhost:3001';

const ZapReportEnhanced = ({ zapData, scanId }) => {
    const [expandedAlerts, setExpandedAlerts] = useState(new Set());
    const [downloadingDetailed, setDownloadingDetailed] = useState(false);

    if (!zapData || !zapData.alerts) {
        return null;
    }

    const toggleAlert = (alertName) => {
        const newExpanded = new Set(expandedAlerts);
        if (newExpanded.has(alertName)) {
            newExpanded.delete(alertName);
        } else {
            newExpanded.add(alertName);
        }
        setExpandedAlerts(newExpanded);
    };

    const downloadDetailedReport = async () => {
        setDownloadingDetailed(true);
        try {
            const response = await fetch(`${API_BASE}/api/zap/detailed-report/${scanId}`, {
                headers: {
                    'x-auth-token': localStorage.getItem('token')
                }
            });

            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `zap_detailed_report_${scanId}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download error:', error);
            alert('Failed to download detailed report');
        } finally {
            setDownloadingDetailed(false);
        }
    };

    const getRiskColor = (risk) => {
        switch (risk) {
            case 'High': return '#e81123';
            case 'Medium': return '#ff8c00';
            case 'Low': return '#ffb900';
            default: return '#00d084';
        }
    };

    const getRiskIcon = (risk) => {
        switch (risk) {
            case 'High': return '🔴';
            case 'Medium': return '🟠';
            case 'Low': return '🟡';
            default: return '🔵';
        }
    };

    return (
        <div className="zap-report-enhanced">
            <div className="report-header">
                <h3>⚡ OWASP ZAP Vulnerability Report</h3>
                <div className="report-stats">
                    <span className="stat">
                        <strong>{zapData.totalAlerts}</strong> Alert Types
                    </span>
                    <span className="stat">
                        <strong>{zapData.totalOccurrences}</strong> Total Occurrences
                    </span>
                    <button
                        onClick={downloadDetailedReport}
                        disabled={downloadingDetailed}
                        className="download-btn"
                    >
                        {downloadingDetailed ? 'Downloading...' : '📥 Download Full Report (All URLs)'}
                    </button>
                </div>
            </div>

            {/* Risk Summary */}
            <div className="risk-summary">
                {Object.entries(zapData.riskCounts || {}).map(([risk, count]) => (
                    count > 0 && (
                        <div key={risk} className={`risk-badge risk-${risk.toLowerCase()}`}>
                            {getRiskIcon(risk)} {risk}: {count}
                        </div>
                    )
                ))}
            </div>

            {/* Alert List */}
            <div className="alerts-list">
                {zapData.alerts.map((alert, idx) => {
                    const isExpanded = expandedAlerts.has(alert.alert);

                    return (
                        <div key={idx} className="alert-card">
                            <div
                                className="alert-header"
                                onClick={() => toggleAlert(alert.alert)}
                                style={{ borderLeftColor: getRiskColor(alert.risk) }}
                            >
                                <div className="alert-title">
                                    <span className="alert-icon">{getRiskIcon(alert.risk)}</span>
                                    <span className="alert-name">{alert.alert}</span>
                                    <span className="occurrence-count">
                                        {alert.totalOccurrences} occurrence{alert.totalOccurrences !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="alert-meta">
                                    <span className={`risk-label risk-${alert.risk.toLowerCase()}`}>
                                        {alert.risk}
                                    </span>
                                    <span className="expand-icon">
                                        {isExpanded ? '▼' : '▶'}
                                    </span>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="alert-details">
                                    <div className="detail-section">
                                        <h4>Description</h4>
                                        <p>{alert.description}</p>
                                    </div>

                                    <div className="detail-section">
                                        <h4>Solution</h4>
                                        <p>{alert.solution}</p>
                                    </div>

                                    <div className="detail-section">
                                        <h4>Affected URLs ({alert.sampleUrls.length} shown{alert.hasMoreUrls ? ', more in full report' : ''})</h4>
                                        <ul className="url-list">
                                            {alert.sampleUrls.map((url, urlIdx) => (
                                                <li key={urlIdx} className="url-item">
                                                    <span className="url-icon">🔗</span>
                                                    <a
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="url-link"
                                                    >
                                                        {url}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                        {alert.hasMoreUrls && (
                                            <p className="more-urls-notice">
                                                ⚠️ This vulnerability affects {alert.totalOccurrences} URLs total.
                                                Download the full report to see all affected URLs.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {zapData.alerts.length === 0 && (
                <div className="no-alerts">
                    ✅ No security vulnerabilities detected. Great job!
                </div>
            )}
        </div>
    );
};

export default ZapReportEnhanced;
