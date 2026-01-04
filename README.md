# SSDT - Security Scanning & Detection Tool

A comprehensive web security and performance analysis tool that scans URLs for malware, performance issues, security configuration problems, and **active vulnerabilities**.

## Features

### Combined URL Scanning

Scan any URL and get a complete analysis in one request:

1. **VirusTotal** - Malware detection across 70+ security engines
2. **PageSpeed Insights** - Performance, Accessibility, Best Practices, SEO scores
3. **Mozilla Observatory** - Security configuration and headers analysis
4. **OWASP ZAP (New)** - Real-time Active Scanning (DAST) for vulnerabilities like SQL Injection, XSS, and more.
5. **AI Analysis** - Gemini-powered comprehensive security & performance report

### User Authentication

- Google Login & Sign up - Seamless authentication using Google OAuth 2.0
- User registration with email verification
- OTP-based login for enhanced security
- JWT token authentication
- Forgot password with email reset link
- Password reset with secure token validation
- Skip OTP for recently reset passwords (24-hour window)
- Inline UI messages instead of browser alerts

### Multi-language Support

- English and Japanese translation support
- Google Translate API integration

## Tech Stack

### Infrastructure (New)
- **Docker & Docker Compose** (Orchestration)
- **OWASP ZAP** (Running as a Sidecar Container)

### Backend
- Node.js + Express
- MongoDB (Mongoose)
- Google Auth Library (OAuth 2.0)
- **APIs:**
  - VirusTotal API
  - Google PageSpeed Insights API
  - Mozilla Observatory API v2
  - OWASP ZAP API (Local Docker)
  - Google Gemini AI
  - Google Translate API

### Frontend
- React 19
- React Router
- Google OAuth (@react-oauth/google)
- SCSS styling
- Responsive design

## Setup

### Prerequisites

- Node.js >= 18.0.0
- MongoDB Atlas account or local MongoDB
- API Keys (see `.env.example`)

### Installation

1. **Clone and install dependencies:**

   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd frontend
   npm install
   ```

2. **Configure environment variables:**

   ```bash
   #Terminal 1 - Backend
   cd backend
   cp .env.example .env
   # Edit .env with your API keys
   ```

     ```bash
   #Terminal 1 - Frontend
   cd frontend
   cp .env.example .env
   # Edit .env with your API keys
   ```


3. **Start the application:**

   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev

   # Terminal 2 - Frontend
   cd frontend
   npm start
   ```

4. **Access the app:**

   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001
   - Backend Health Check: http://localhost:3001/health

   **IMPORTANT**: Make sure the backend is running BEFORE accessing the frontend to avoid "Failed to fetch" errors.

## Usage

1. Register :
   - Use Sign up with Google for instant access.
   - OR Register manually with email/password and verify via OTP.
2. Login with OTP verification (or directly if password was recently reset)
3. Enter a URL to scan (e.g., https://github.com)
4. Wait 30-60 seconds for complete analysis
5. View results:
   - Security grade from VirusTotal
   - Performance scores (4 metrics)
   - Security configuration grade from Observatory
   - AI-generated comprehensive analysis


## Project Structure

```

SSDT/
├── docker-compose.yml         \# Orchestrates App, DB, and Scanner
├── .env                       \# Root Environment Variables
├── backend/
│   ├── Dockerfile             \# Backend Container Logic
│   ├── middleware/            \# Auth, rate limiting
│   ├── models/                \# MongoDB schemas
│   ├── routes/                \# API endpoints (includes zapRoutes)
│   ├── services/              \# Logic (VT, PSI, ZAP, Gemini)
│   └── server.js              \# Express server
├── frontend/
│   ├── Dockerfile             \# Frontend Container Logic
│   ├── src/
│   └── ...
└── README.md

````

## Setup & Installation (Docker Method)

**Recommended:** This project is containerized. Running with Docker ensures the OWASP ZAP scanner works correctly without complex local installation.

### Prerequisites
- Docker Desktop (or Docker Engine + Compose)
- API Keys (VirusTotal, PageSpeed, Gemini)

### Steps

1. **Clone and install dependencies:**
   ```bash
   git clone [https://github.com/yourusername/ssdt.git](https://github.com/yourusername/ssdt.git)
   cd ssdt
````

2.  **Configure Environment Variables:**
    Create a `.env` file in the `backend/` directory.

    ```bash
    # backend/.env

    # Server
    PORT=3001
    NODE_ENV=development

    # Database (Docker Service Name)
    MONGO_URI=mongodb://ssdt-mongo:27017/virustotal-scanner

    # Secrets
    JWT_SECRET=your_super_secret_jwt_key

    # External APIs
    VT_API_KEY=your_virustotal_key
    PSI_API_KEY=your_pagespeed_key
    GEMINI_API_KEY=your_gemini_key

    # OWASP ZAP Configuration (Internal Docker Network)
    ZAP_API_URL=http://zap-daemon:8080
    ZAP_API_KEY=your_zap_api_key_here

    # Google OAuth Configuration for backend authentication
    GOOGLE_CLIENT_ID=your_google_client_id_from_cloud_console

    # Email
    EMAIL_USER=your_email@gmail.com
    EMAIL_PASS=your_app_password
    ```

3.  **Start the Application:**
    Run this command in the root folder to build and start Backend, Frontend, Database, and ZAP Scanner.

    ```bash
    docker-compose up -d --build
    ```

4.  **Access the App:**

      - **Frontend:** [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000)
      - **Backend API:** [http://localhost:3001](https://www.google.com/search?q=http://localhost:3001)
      - **ZAP Interface:** [http://localhost:8080](https://www.google.com/search?q=http://localhost:8080) (Verify scanner is running)

## Development (Manual Method)

If you want to run Node.js locally (outside Docker) while keeping ZAP in Docker:

1.  **Start ZAP & Mongo Only:**
    ```bash
    # Edit docker-compose.yml to comment out 'backend' and 'frontend' services
    docker-compose up -d
    ```
2.  **Run Backend:**
    ```bash
    cd backend
    npm install
    node server.js
    ```
3.  **Run Frontend:**
    ```bash
    cd frontend
    npm install
    npm start
    ```

## API Endpoints

### ZAP Scanning

  - `POST /api/zap/scan` - Trigger a real-time active scan against a target URL.

### Authentication

- `POST /auth/google` - Login or Register with Google (Access Token flow)
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and send OTP (skips OTP for recently reset passwords)
- `POST /auth/verify-otp` - Verify OTP and get JWT token
- `POST /auth/resend-otp` - Resend OTP
- `POST /auth/forgot-password` - Send password reset email
- `POST /auth/reset-password` - Reset password with token
- `GET /auth/me` - Get current user (protected)

### Standard Scanning

  - `POST /api/vt/combined-url-scan` - Initiate combined scan (VT + PSI + Observatory)
  - `GET /api/vt/combined-analysis/:id` - Poll for scan results

### Translation

- `POST /api/translate` - Translate text (protected)

## Environment Variables

Required in `backend/.env`:

```bash
# MongoDB
MONGO_URI=your_mongodb_connection_string

# Authentication
JWT_SECRET=your_jwt_secret

# APIs
VT_API_KEY=your_virustotal_api_key
PSI_API_KEY=your_pagespeed_api_key

# Gemini API Keys (with fallback support)
GEMINI_API_KEY=your_gemini_api_key
GEMINI_API_KEY_2=your_second_gemini_api_key  # Optional fallback
GEMINI_API_KEY_3=your_third_gemini_api_key   # Optional fallback

# Email (for OTP)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# OWASP ZAP Configuration
ZAP_API_URL=http://zap-daemon:8080
ZAP_API_KEY=your_zap_api_key_here

# Google OAuth Configuration for backend authentication
GOOGLE_CLIENT_ID=your_google_client_id_from_cloud_console

# Server
PORT=3001
NODE_ENV=development
```

Required in `frontend/.env`:

```bash
# Google OAuth Client ID for frontend authentication
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id_here

```

### Multiple Gemini API Keys (Recommended)

To avoid rate limiting and "model overloaded" errors, you can configure multiple Gemini API keys:

1. **Get multiple API keys** from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. **Add them to your `.env`** file:

   ```bash
   GEMINI_API_KEY=your_first_key
   GEMINI_API_KEY_2=your_second_key
   GEMINI_API_KEY_3=your_third_key
   # Add as many as you need...
   ```

3. **How it works:**
   - The system automatically tries keys in order
   - If one key is overloaded/rate-limited, it switches to the next
   - Logs show which key is being used
   - 500ms delay between fallback attempts

**Benefits:**

- No more "AI analysis temporarily unavailable" errors
- Higher throughput for scans
- Better reliability during peak usage
- Automatic failover

## Rate Limiting & Security

- **Combined Rate Limiter:** Respects external API limits (e.g., VirusTotal).
- **ZAP Throttling:** Active scans are resource-intensive; backend queues ensure stability.
- **Docker Isolation:** ZAP runs in a restricted container with regex-based API access control.
- Auth endpoints: 10 requests per 15 minutes
- API endpoints: 100 requests per 15 minutes
- Scan endpoints: 5 scans per 15 minutes per user

## Security Features

- JWT-based authentication
- OTP email verification
- Rate limiting on all endpoints
- Input validation
- CORS protection
- Secure password hashing (bcrypt)

## Development

```bash
# Backend (with auto-reload)
cd backend
npm run dev

# Frontend (with hot-reload)
cd frontend
npm start

# Build frontend for production
cd frontend
npm run build
```

## Recent Updates

### Multiple Gemini API Keys & Improvements (Latest)

- **Multiple API Key Support**: Add unlimited fallback Gemini API keys to prevent rate limiting
- **Enhanced URL Validation**: Blocks invalid URLs, local/private IPs, non-HTTP(S) protocols
- **User-Based Rate Limiting**: Rate limits now track by user ID instead of IP
- **Improved Error Handling**: Better error messages in Observatory service with specific status codes
- **Enhanced Loading States**: Step-by-step progress indicators in frontend (4 stages)
- **Database Auto-Retry**: Automatic reconnection with exponential backoff (5 retries)

### Enhanced Error Handling

- Improved error messages for better debugging
- Detailed error messages for "Failed to fetch" errors
- Better authentication error handling
- Rate limit detection and user-friendly messages

### Authentication Improvements

- **Forgot Password Flow**: Complete password recovery with email reset links
- **Password Reset Security**: Secure token-based password reset with expiration
- **OTP Bypass for Reset Users**: Skip OTP verification for 24 hours after password reset
- **Inline UI Messages**: Replaced browser alerts with inline success/error messages in auth pages
- **Enhanced UX**: Loading states, auto-redirects and better user feedback

### Observatory Integration

- Integrated Mozilla Observatory API v2 into combined scan
- Displays security configuration grade (A+ to F)
- Shows security header analysis
- AI analysis now includes security configuration recommendations
- All results available in single unified report

## Troubleshooting

**ZAP Connection Failed:**

  - Ensure the Docker container `zap-daemon` is running (`docker ps`).
  - Check if `ZAP_API_KEY` in `.env` matches the key in `docker-compose.yml`.

**Ports Not Available:**

  - Stop any local MongoDB or Node processes running on ports 3000, 3001 or 27017 before running `docker-compose up`.

## License

ISC

```

## Important commands to run the code

npm install --save-dev nodemon
npm install express mongoose bcryptjs jsonwebtoken cookie-parser dotenv cors
