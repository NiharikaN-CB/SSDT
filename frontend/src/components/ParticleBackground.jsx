import React, { useRef, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import '../styles/ParticleBackground.scss';

const ParticleBackground = () => {
  const canvasRef = useRef(null);
  const { isPro } = useUser();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas to viewport size, not page size
    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    setCanvasSize();

    let particlesArray;

    const mouse = {
      x: null,
      y: null,
      radius: 100 // Fixed radius instead of calculated
    };

    let lastMouseX = null;
    let lastMouseY = null;
    
    const handleMouseMove = (event) => {
      // Only update if mouse moved at least 20 pixels
      if (!lastMouseX || !lastMouseY || 
          Math.abs(event.clientX - lastMouseX) > 20 || 
          Math.abs(event.clientY - lastMouseY) > 20) {
        mouse.x = event.clientX;
        mouse.y = event.clientY;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    class Particle {
      constructor(x, y, directionX, directionY, size) {
        this.x = x;
        this.y = y;
        this.directionX = directionX;
        this.directionY = directionY;
        this.size = size;
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
        ctx.fillStyle = isPro ? '#c084fc' : '#00b0c6';
        ctx.fill();
      }

      update() {
        // Bounce off walls
        if (this.x > canvas.width || this.x < 0) {
          this.directionX = -this.directionX;
        }
        if (this.y > canvas.height || this.y < 0) {
          this.directionY = -this.directionY;
        }

        // Mouse interaction - gentle repulsion
        let dx = mouse.x - this.x;
        let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < mouse.radius + this.size) {
          // Gentle push away from mouse
          if (mouse.x < this.x && this.x < canvas.width - this.size * 10) {
            this.x += 2;
          }
          if (mouse.x > this.x && this.x > this.size * 10) {
            this.x -= 2;
          }
          if (mouse.y < this.y && this.y < canvas.height - this.size * 10) {
            this.y += 2;
          }
          if (mouse.y > this.y && this.y > this.size * 10) {
            this.y -= 2;
          }
        }
        
        // Move particle
        this.x += this.directionX;
        this.y += this.directionY;
        
        this.draw();
      }
    }

    function init() {
      particlesArray = [];
      // Calculate number based on viewport area
      let numberOfParticles = Math.floor((canvas.height * canvas.width) / 15000);
      
      for (let i = 0; i < numberOfParticles; i++) {
        let size = (Math.random() * 3) + 1;
        let x = Math.random() * (canvas.width - size * 2) + size;
        let y = Math.random() * (canvas.height - size * 2) + size;
        let directionX = (Math.random() * 1.5) - 0.75; // Slower movement
        let directionY = (Math.random() * 1.5) - 0.75;

        particlesArray.push(new Particle(x, y, directionX, directionY, size));
      }
    }

    function animate() {
      requestAnimationFrame(animate);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
      }
      connect();
    }
    
    function connect() {
      for (let a = 0; a < particlesArray.length; a++) {
        for (let b = a + 1; b < particlesArray.length; b++) {
          let dx = particlesArray[a].x - particlesArray[b].x;
          let dy = particlesArray[a].y - particlesArray[b].y;
          let distance = Math.sqrt(dx * dx + dy * dy);
          
          // Draw lines between nearby particles
          if (distance < 120) { // Fixed distance
            let opacity = 1 - (distance / 120);
            // Purple for pro users: rgba(192, 132, 252, opacity), Cyan for regular users
            ctx.strokeStyle = isPro
              ? `rgba(192, 132, 252, ${opacity * 0.5})`
              : `rgba(0, 176, 198, ${opacity * 0.5})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
            ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
            ctx.stroke();
          }
        }
      }
    }

    const handleResize = () => {
      setCanvasSize();
      init();
    };

    window.addEventListener('resize', handleResize);
    
    init();
    animate();

    // Cleanup
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, [isPro]);

  return <canvas ref={canvasRef} className="particle-canvas" />;
};

export default ParticleBackground;