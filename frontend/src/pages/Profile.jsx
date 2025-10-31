import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/header';
import ParticleBackground from '../components/ParticleBackground';
import '../styles/Profile.scss';

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', bio: '' });
  const [saveMessage, setSaveMessage] = useState('');
  const navigate = useNavigate();

  const fetchProfile = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const res = await fetch('/api/profile', {
        headers: {
          'x-auth-token': token
        }
      });

      if (!res.ok) {
        throw new Error('Failed to fetch profile');
      }

      const data = await res.json();
      setProfile(data);
      setFormData({ name: data.user.name, bio: data.user.bio || '' });
      setLoading(false);
    } catch (err) {
      console.error('Profile fetch error:', err);
      setError('Failed to load profile');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = () => {
    setEditing(true);
    setSaveMessage('');
  };

  const handleCancel = () => {
    setEditing(false);
    setFormData({ name: profile.user.name, bio: profile.user.bio || '' });
    setSaveMessage('');
  };

  const handleSave = async () => {
    const token = localStorage.getItem('token');

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        throw new Error('Failed to update profile');
      }

      const data = await res.json();

      // Update profile state
      setProfile(prev => ({
        ...prev,
        user: { ...prev.user, name: data.user.name, bio: data.user.bio }
      }));

      setEditing(false);
      setSaveMessage('Profile updated successfully!');

      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error('Profile update error:', err);
      setSaveMessage('Failed to update profile');
    }
  };

  const handleUpgradeToPro = async () => {
    const token = localStorage.getItem('token');

    try {
      const res = await fetch('/api/profile/upgrade-to-pro', {
        method: 'POST',
        headers: {
          'x-auth-token': token
        }
      });

      const data = await res.json();

      // For now, just show an alert with the response
      alert(data.message + '\n\n' + JSON.stringify(data.proFeatures, null, 2));
    } catch (err) {
      console.error('Upgrade error:', err);
      alert('Failed to process upgrade request');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="profile-page">
        <ParticleBackground />
        <Header />
        <main>
          <div className="profile-container">
            <div className="loading">Loading profile...</div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="profile-page">
        <ParticleBackground />
        <Header />
        <main>
          <div className="profile-container">
            <div className="error">{error}</div>
          </div>
        </main>
      </div>
    );
  }

  const { user, limits, recentScans } = profile;

  return (
    <div className="profile-page">
      <ParticleBackground />
      <Header />
      <main>
        <div className="profile-container">
      <div className="profile-header">
        <h1>My Profile</h1>
        {user.isPro && (
          <span className="pro-badge">PRO</span>
        )}
      </div>

      {saveMessage && (
        <div className={`save-message ${saveMessage.includes('Failed') ? 'error' : 'success'}`}>
          {saveMessage}
        </div>
      )}

      {/* Account Information */}
      <div className="profile-section">
        <div className="section-header">
          <h2>Account Information</h2>
          {!editing ? (
            <button onClick={handleEdit} className="btn-edit">Edit Profile</button>
          ) : (
            <div className="edit-buttons">
              <button onClick={handleSave} className="btn-save">Save</button>
              <button onClick={handleCancel} className="btn-cancel">Cancel</button>
            </div>
          )}
        </div>

        <div className="profile-info">
          <div className="info-row">
            <label>Name:</label>
            {editing ? (
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="edit-input"
              />
            ) : (
              <span>{user.name}</span>
            )}
          </div>

          <div className="info-row">
            <label>Email:</label>
            <span>{user.email}</span>
          </div>

          <div className="info-row">
            <label>Bio:</label>
            {editing ? (
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="edit-textarea"
                placeholder="Tell us about yourself (max 500 characters)"
                maxLength={500}
              />
            ) : (
              <span>{user.bio || 'No bio added yet'}</span>
            )}
          </div>

          <div className="info-row">
            <label>Account Type:</label>
            <span className={`account-type ${user.accountType}`}>
              {user.accountType.toUpperCase()}
            </span>
          </div>

          <div className="info-row">
            <label>Member Since:</label>
            <span>{formatDate(user.createdAt)}</span>
          </div>

          <div className="info-row">
            <label>Last Login:</label>
            <span>{formatDate(user.lastLoginAt)}</span>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="profile-section">
        <h2>Statistics</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{user.totalScans}</div>
            <div className="stat-label">Total Scans</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{user.scansThisMonth}</div>
            <div className="stat-label">This Month</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{limits.scansPerDay === -1 ? '∞' : limits.scansPerDay}</div>
            <div className="stat-label">Daily Limit</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{(limits.maxFileSize / (1024 * 1024)).toFixed(0)}MB</div>
            <div className="stat-label">Max File Size</div>
          </div>
        </div>
      </div>

      {/* Recent Scans */}
      <div className="profile-section">
        <h2>Recent Scans</h2>
        {recentScans.length > 0 ? (
          <div className="recent-scans">
            {recentScans.map((scan) => (
              <div key={scan._id} className="scan-item">
                <div className="scan-target">{scan.target}</div>
                <div className="scan-details">
                  <span className={`scan-status ${scan.status}`}>{scan.status}</span>
                  <span className="scan-date">{formatDate(scan.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-scans">No scans yet. Start by analyzing a URL!</p>
        )}
      </div>

      {/* Upgrade to Pro (only for free users) */}
      {!user.isPro && (
        <div className="profile-section pro-upgrade-section">
          <h2>Upgrade to Pro</h2>
          <div className="pro-features">
            <p>Unlock premium features:</p>
            <ul>
              <li>✨ Unlimited scans per day</li>
              <li>📦 Larger file size limit (100MB)</li>
              <li>⚡ Priority scanning queue</li>
              <li>📊 Advanced analytics reports</li>
              <li>🔌 API access (coming soon)</li>
            </ul>
            <button onClick={handleUpgradeToPro} className="btn-upgrade">
              Upgrade to Pro - $9.99/month
            </button>
            <p className="upgrade-note">
              Note: Payment integration coming soon. This is a preview of Pro features.
            </p>
          </div>
        </div>
      )}

      {/* Pro Account Info (only for pro users) */}
      {user.isPro && user.proExpiresAt && (
        <div className="profile-section pro-info-section">
          <h2>Pro Subscription</h2>
          <div className="pro-info">
            <p>Your Pro subscription is active until:</p>
            <p className="expiry-date">{formatDate(user.proExpiresAt)}</p>
          </div>
        </div>
      )}
        </div>
      </main>
    </div>
  );
};

export default Profile;
