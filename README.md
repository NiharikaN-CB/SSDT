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
- SCSS styling
- Responsive design

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

## API Endpoints (New)

### ZAP Scanning

  - `POST /api/zap/scan` - Trigger a real-time active scan against a target URL.

### Authentication

  - `POST /auth/register` - Register new user
  - `POST /auth/login` - Login and send OTP
  - `POST /auth/verify-otp` - Verify OTP
  - `POST /auth/forgot-password` - Send password reset email
  - `POST /auth/reset-password` - Reset password with token

### Standard Scanning

  - `POST /api/vt/combined-url-scan` - Initiate combined scan (VT + PSI + Observatory)
  - `GET /api/vt/combined-analysis/:id` - Poll for scan results

## Rate Limiting & Security

  - **Combined Rate Limiter:** Respects external API limits (e.g., VirusTotal).
  - **ZAP Throttling:** Active scans are resource-intensive; backend queues ensure stability.
  - **Docker Isolation:** ZAP runs in a restricted container with regex-based API access control.

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
npm install express mongoose bcryptjs jsonwebtoken cookie-parser dotenv cors
