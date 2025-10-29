// File path: frontend/src/pages/auth/LoginPage.jsx

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '../../components/header';
import ParticleBackground from '../../components/ParticleBackground';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:3001/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        if (data.token) {
          // Direct login success (password reset user)
          localStorage.setItem('token', data.token);
          alert(data.message);
          navigate('/'); // Redirect to dashboard/home
        } else {
          // Normal flow: OTP required
          alert(data.message);
          navigate('/verify-otp', { state: { email } });
        }
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login failed. Please try again later.');
    }
  };

  return (
    <div className="auth-page">
      <ParticleBackground />
      <Header />
      <main>
        <div className="auth-container">
          <div className="auth-content">
            <h1 className="auth-title">Login</h1>
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="input-wrapper">
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="input-wrapper">
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit">Login</button>
            </form>
            <p className="auth-switch-link">
              New user? <Link to="/register">Register now</Link>
            </p>
            <p className="auth-switch-link">
              <Link to="/forgot-password">Forgot Password?</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;