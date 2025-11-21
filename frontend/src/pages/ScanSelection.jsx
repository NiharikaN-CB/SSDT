import React from 'react';
import { Link } from 'react-router-dom';
import ParticleBackground from '../components/ParticleBackground'; // Re-use your background

const ScanSelection = () => {
  return (
    <div className="scan-selection-page" style={styles.container}>
      <ParticleBackground />
      
      <div style={styles.content}>
        <h1 style={styles.heading}>Choose Your Scan Mode</h1>
        <p style={styles.subheading}>Select the depth of security analysis you need.</p>

        <div style={styles.grid}>
          
          {/* OPTION 1: PASSIVE SCAN (Safe) */}
          {/* You need to create a PassiveScanner component later if you haven't yet. 
              For now, I'll point this to '/passive-scan' */}
          <Link to="/passive-scan" style={{ textDecoration: 'none' }}>
            <div style={{ ...styles.card, ...styles.cardPassive }}>
              <div style={styles.icon}>🔍</div>
              <h2 style={styles.cardTitle}>Passive Scan</h2>
              <div style={styles.badgeGreen}>Safe & Fast</div>
              <p style={styles.text}>
                Analyzes site reputation, SSL headers, and performance using VirusTotal & Mozilla Observatory.
              </p>
              <ul style={styles.list}>
                <li>✅ No attacks sent</li>
                <li>✅ Completed in ~10 seconds</li>
                <li>✅ Safe for any website</li>
              </ul>
              <button style={styles.btnGreen}>Select Passive</button>
            </div>
          </Link>

          {/* OPTION 2: ACTIVE SCAN (Aggressive) */}
          <Link to="/scanner" style={{ textDecoration: 'none' }}>
            <div style={{ ...styles.card, ...styles.cardActive }}>
              <div style={styles.icon}>⚔️</div>
              <h2 style={styles.cardTitle}>Aggressive Scan</h2>
              <div style={styles.badgeRed}>Authorized Only</div>
              <p style={styles.text}>
                Launches a full OWASP ZAP Spider & Active Attack to find SQL Injection, XSS, and critical flaws.
              </p>
              <ul style={styles.list}>
                <li>⚠️ Simulates real cyber-attacks</li>
                <li>⚠️ Takes 5-10 minutes</li>
                <li>⚠️ Use ONLY on your own sites</li>
              </ul>
              <button style={styles.btnRed}>Select Aggressive</button>
            </div>
          </Link>

        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    fontFamily: "'Segoe UI', sans-serif",
  },
  content: {
    zIndex: 2,
    textAlign: 'center',
    width: '100%',
    maxWidth: '1200px',
    padding: '20px'
  },
  heading: {
    color: '#fff',
    fontSize: '3rem',
    marginBottom: '10px',
    textShadow: '0 2px 10px rgba(0,0,0,0.5)'
  },
  subheading: {
    color: '#ccc',
    fontSize: '1.2rem',
    marginBottom: '50px'
  },
  grid: {
    display: 'flex',
    justifyContent: 'center',
    gap: '40px',
    flexWrap: 'wrap'
  },
  card: {
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    padding: '40px',
    borderRadius: '20px',
    width: '350px',
    textAlign: 'left',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    color: 'white'
  },
  cardPassive: { borderTop: '5px solid #28a745' },
  cardActive: { borderTop: '5px solid #dc3545' },
  icon: { fontSize: '4rem', marginBottom: '20px' },
  cardTitle: { fontSize: '2rem', marginBottom: '10px', fontWeight: 'bold' },
  badgeGreen: { display: 'inline-block', background: '#28a745', padding: '5px 10px', borderRadius: '5px', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '15px' },
  badgeRed: { display: 'inline-block', background: '#dc3545', padding: '5px 10px', borderRadius: '5px', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '15px' },
  text: { opacity: 0.9, lineHeight: '1.6', marginBottom: '20px', minHeight: '60px' },
  list: { listStyle: 'none', padding: 0, marginBottom: '30px', opacity: 0.8, fontSize: '0.9rem' },
  btnGreen: { width: '100%', padding: '15px', borderRadius: '8px', border: 'none', background: '#28a745', color: 'white', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' },
  btnRed: { width: '100%', padding: '15px', borderRadius: '8px', border: 'none', background: '#dc3545', color: 'white', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }
};

export default ScanSelection;