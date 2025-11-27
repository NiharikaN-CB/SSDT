import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext'; // <--- THIS WAS MISSING
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import './styles/NeonButtons.scss'; // Ensure these styles are imported
import './styles/ProTheme.scss';     // Ensure these styles are imported

// Check if the Client ID is loading correctly in the browser console
console.log("Google Client ID:", process.env.REACT_APP_GOOGLE_CLIENT_ID);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);