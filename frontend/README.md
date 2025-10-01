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
