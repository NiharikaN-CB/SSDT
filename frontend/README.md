# Web Check Frontend

## Overview

This is the frontend React application for Web Check, a website security analysis tool. The app features a dark-themed landing page with a particle background animation, a header with logo and GitHub link, and a hero section with a URL input form.

## Features Added

- **Particle Background Animation:** Interactive particles that move, connect, and respond to mouse movement, implemented in `src/components/ParticleBackground.jsx` with styles in `src/styles/ParticleBackground.scss`.
- **Landing Page Update:** The landing page (`src/pages/LandingPage.jsx`) now includes the particle background component layered behind the header and hero components.
- **New Styles:** SCSS styles for the landing page, header, hero, and particle background to support the dark theme and layout.
- **Updated Fonts:** Google Fonts link for the Inconsolata font added in `public/index.html`.
- **Simplified Routing:** `src/App.js` simplified to only include the landing page route.
- **New Components:** Header and Hero components redesigned and added.

## Authentication Features

### User Registration

- **Page:** `/register`
- **Features:**
  - Name, email, and password input fields
  - Client-side validation
  - After successful registration, users are redirected to OTP verification
  - Email verification required before account activation

### User Login

- **Page:** `/login`
- **Features:**
  - Email and password input fields
  - After successful credential verification, users are redirected to OTP verification
  - Two-factor authentication via email OTP

### OTP Email Verification

- **Page:** `/verify-otp`
- **Features:**
  - 6-digit OTP input field (numeric only)
  - Verify button to authenticate and complete login/registration
  - Resend OTP button with rate limiting (1 request per minute)
  - Automatic input validation (exactly 6 digits required)
  - Professional email template with security warnings
  - OTP expires after 10 minutes
  - Clear user feedback for success/error states

### Authentication Flow

1. **Registration:**

   - User fills registration form
   - Account created in database (unverified)
   - OTP sent to email
   - User redirected to OTP verification page
   - After OTP verification, user is logged in with JWT token

2. **Login:**
   - User enters email and password
   - Credentials verified against database
   - OTP sent to email
   - User redirected to OTP verification page
   - After OTP verification, user receives JWT token

### Security Features

- **Email Verification:** All accounts require email verification via OTP
- **Rate Limiting:** OTP resend limited to 1 request per minute
- **OTP Expiration:** 10-minute validity window
- **Secure Storage:** OTP stored hashed in database
- **JWT Authentication:** Token-based authentication after verification

## Installation and Running

1. Install dependencies:
   ```
   npm install
   ```
2. Start the development server:
   ```
   npm start
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser to view the app.

## Dependencies

- React 19.x
- react-router-dom 7.x
- react-icons 5.x
- sass 1.x (for SCSS support)

## File Structure Highlights

- `src/components/ParticleBackground.jsx` - Particle animation component
- `src/styles/ParticleBackground.scss` - Styles for particle background canvas
- `src/pages/LandingPage.jsx` - Landing page including particle background
- `src/styles/LandingPage.scss` - Landing page layout styles
- `public/index.html` - Updated with Google Fonts link and title

## Testing

- Verify the particle background renders and animates correctly on the landing page.
- Confirm the header and hero components display properly on top of the background.
- Test responsiveness and performance of the animation.
- Ensure routing works correctly with only the landing page route active.

## Notes

- The particle animation uses the HTML5 canvas and React hooks for rendering and interaction.
- SCSS is used for styling; ensure `sass` is installed as a dependency.
- Old unused components and styles have been removed for a cleaner codebase.

For any issues or further enhancements, please refer to the source code or contact the development team.

# VirusTotal Scanner Backend

A Node.js backend API for scanning files and URLs using the VirusTotal API.

## 🚀 Features

- User authentication (register/login)
- File scanning with VirusTotal
- URL scanning with VirusTotal
- Analysis result retrieval
- Scan history tracking
- Rate limiting for API calls

## 📋 Prerequisites

- Node.js >= 18.0.0
- MongoDB (local or Atlas)
- VirusTotal API Key ([Get one here](https://www.virustotal.com/gui/my-apikey))
- Email service credentials (Gmail SMTP for OTP emails)

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the backend directory:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
MONGO_URI=mongodb://localhost:27017/virustotal-scanner
JWT_SECRET=your_super_secret_jwt_key_here_change_this
VT_API_KEY=your_virustotal_api_key_here
EMAIL_USER=your_gmail_address@gmail.com
EMAIL_PASS=your_gmail_app_password
PORT=3001
NODE_ENV=development
```

### Setting up Gmail for OTP Emails

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password:**
   - Go to [Google Account Settings](https://myaccount.google.com/)
   - Navigate to Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Use this 16-character password as `EMAIL_PASS` in your `.env` file

**Note:** Never use your main Gmail password - always use an app-specific password for security.

### 4. Start MongoDB

Make sure MongoDB is running on your system:

```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas connection string in MONGO_URI
```

### 5. Run the server

Development mode (with auto-restart):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## 🔑 Getting VirusTotal API Key

1. Go to [VirusTotal](https://www.virustotal.com/)
2. Create an account or log in
3. Navigate to your [API Key page](https://www.virustotal.com/gui/my-apikey)
4. Copy your API key
5. Paste it in your `.env` file as `VT_API_KEY`

**Note:** Free tier allows 4 requests per minute.

## 📡 API Endpoints

### Authentication

#### Register

```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response (Success - OTP Sent):**

```json
{
  "message": "User registered successfully. Please check your email for verification code.",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

#### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response (Success - OTP Sent):**

```json
{
  "message": "Credentials verified. Please check your email for the verification code.",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

#### Verify OTP

```http
POST /auth/verify-otp
Content-Type: application/json

{
  "email": "john@example.com",
  "otp": "123456"
}
```

**Response (Success - Authenticated):**

```json
{
  "message": "OTP verified successfully. Login successful.",
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "isVerified": true
  }
}
```

#### Resend OTP

```http
POST /auth/resend-otp
Content-Type: application/json

{
  "email": "john@example.com"
}
```

**Response (Success):**

```json
{
  "message": "OTP sent successfully. Please check your email."
}
```

#### Get Current User

```http
GET /auth/me
x-auth-token: <your-jwt-token>
```

### VirusTotal Scanning

**All endpoints require authentication via `x-auth-token` header.**

#### Scan File

```http
POST /api/vt/file
x-auth-token: <your-jwt-token>
Content-Type: multipart/form-data

file: <your-file>
```

#### Scan URL

```http
POST /api/vt/url
x-auth-token: <your-jwt-token>
Content-Type: application/json

{
  "url": "https://example.com"
}
```

#### Get Analysis Result

```http
GET /api/vt/analysis/:id
x-auth-token: <your-jwt-token>
```

#### Get Scan History

```http
GET /api/vt/history
x-auth-token: <your-jwt-token>
```

#### Get File Report by Hash

```http
GET /api/vt/file-report/:hash
x-auth-token: <your-jwt-token>
```

### Health Check

```http
GET /health
```

## 🐛 Troubleshooting

### Issue 1: "VT_API_KEY is not set"

**Solution:** Make sure you have created a `.env` file with your VirusTotal API key:

```bash
VT_API_KEY=your_actual_api_key_here
```

### Issue 2: "analysisID retrieval error"

**Causes:**

- Invalid API key
- Rate limit exceeded (free tier: 4 requests/minute)
- Network issues

**Solutions:**

1. Verify your API key is correct in `.env`
2. Wait 1 minute between requests if hitting rate limits
3. Check the console logs for detailed error messages

### Issue 3: MongoDB connection failed

**Solutions:**

1. Make sure MongoDB is running
2. Check your `MONGO_URI` in `.env`
3. For local MongoDB: `mongodb://localhost:27017/virustotal-scanner`
4. For MongoDB Atlas: Use your Atlas connection string

### Issue 4: "Token is not valid"

**Solution:**

- Make sure you're sending the token in the `x-auth-token` header
- Token expires after 7 days - log in again to get a new token

## 📁 Project Structure

```
backend/
├── middleware/
│   └── auth.js                 # JWT authentication middleware
├── models/
│   ├── ScanResult.js          # Scan result schema
│   └── User.js                # User schema
├── routes/
│   ├── auth.js                # Authentication routes
│   └── virustotalRoutes.js    # VirusTotal API routes
├── services/
│   └── virustotalService.js   # VirusTotal API integration
├── uploads/                   # Temporary file storage
├── .env.example              # Environment variables template
├── .gitignore               # Git ignore rules
├── db.js                    # MongoDB connection
├── package.json             # Dependencies
├── README.md               # This file
└── server.js              # Express server setup
```

## 🔒 Security Notes

- Never commit `.env` file to version control
- Use strong JWT_SECRET (generate with: `openssl rand -base64 32`)
- Keep your VirusTotal API key private
- Use HTTPS in production
- Implement rate limiting on auth endpoints for production

## 📊 Rate Limiting

The app includes built-in rate limiting for VirusTotal API:

- **Free tier:** 4 requests per minute
- **Automatic:** Requests are queued and spaced appropriately

## 🚀 Deployment Tips

### Environment Variables for Production

```env
NODE_ENV=production
MONGO_URI=<your-production-mongodb-uri>
JWT_SECRET=<strong-random-secret>
VT_API_KEY=<your-virustotal-api-key>
PORT=3001
CLIENT_URL=https://your-frontend-domain.com
```

### Recommended Services

- **Backend:** Railway, Render, Heroku
- **Database:** MongoDB Atlas
- **Frontend:** Vercel, Netlify

## 📝 Testing with cURL

### Complete Authentication Flow

#### 1. Register a user (sends OTP to email)

```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

#### 2. Verify OTP (completes registration and login)

```bash
curl -X POST http://localhost:3001/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "otp": "123456"
  }'
```

#### 3. Login (sends OTP to email)

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

#### 4. Resend OTP (if needed)

```bash
curl -X POST http://localhost:3001/auth/resend-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com"
  }'
```

#### 5. Get current user (requires JWT token)

```bash
curl -X GET http://localhost:3001/auth/me \
  -H "x-auth-token: YOUR_JWT_TOKEN_HERE"
```

### VirusTotal Scanning (requires authentication)

#### Scan a URL (replace TOKEN with your JWT)

```bash
curl -X POST http://localhost:3001/api/vt/url \
  -H "Content-Type: application/json" \
  -H "x-auth-token: YOUR_TOKEN_HERE" \
  -d '{"url":"https://example.com"}'
```

#### Check analysis (replace ID and TOKEN)

```bash
curl -X GET http://localhost:3001/api/vt/analysis/ANALYSIS_ID \
  -H "x-auth-token: YOUR_TOKEN_HERE"
```

## 📞 Support

If you encounter issues:

1. Check the console logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure MongoDB is running
4. Confirm your VirusTotal API key is valid
5. For email issues: Verify Gmail credentials and app password setup

### Common Email Issues

#### Issue 5: "Email not sending" or "Authentication failed"

**Causes:**

- Incorrect Gmail credentials
- 2FA not enabled on Gmail account
- Using main password instead of app password
- Gmail security blocking the app

**Solutions:**

1. Enable 2FA on your Gmail account
2. Generate an app password specifically for this app
3. Use the 16-character app password in `EMAIL_PASS`
4. Check Gmail's "Less secure app access" settings
5. Verify the email address in `EMAIL_USER` is correct

#### Issue 6: "OTP not received"

**Solutions:**

1. Check spam/junk folder
2. Verify the email address used during registration/login
3. Wait a few minutes - emails may be delayed
4. Try resending the OTP
5. Check server logs for email sending errors

## 📄 License

ISC

Important commands:
npm install --save-dev nodemon
npm install express mongoose bcryptjs jsonwebtoken cookie-parser dotenv cors
