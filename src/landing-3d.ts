export function initLanding3DEffects(cardId: string, canvasId: string) {
  // 1. Initializing 3D Card Tilt on sandbox card
  const cardEl = document.getElementById(cardId);
  if (cardEl) {
    cardEl.style.transformStyle = "preserve-3d";
    
    cardEl.addEventListener("mousemove", (e: MouseEvent) => {
      const rect = cardEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      // Calculate rotation based on coordinates relative to center (max 12deg for aesthetic constraints)
      const rotateX = ((centerY - y) / centerY) * 12;
      const rotateY = ((x - centerX) / centerX) * 12;
      
      // Calculate dynamic holographic shine reflection coords
      const flashX = (x / rect.width) * 100;
      const flashY = (y / rect.height) * 100;
      
      cardEl.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.025, 1.025, 1.025)`;
      cardEl.style.backgroundImage = `radial-gradient(circle at ${flashX}% ${flashY}%, rgba(168, 85, 247, 0.2) 0%, rgba(59, 130, 246, 0.08) 50%, transparent 80%)`;
      cardEl.style.boxShadow = `0 25px 50px -12px rgba(0,0,0,0.7), 0 0 25px rgba(168, 85, 247, ${Math.min(0.4, Math.max(0.1, Math.abs(rotateY)/15))})`;
    });
    
    cardEl.addEventListener("mouseleave", () => {
      cardEl.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
      cardEl.style.backgroundImage = "";
      cardEl.style.boxShadow = "";
      cardEl.style.transition = "transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), background-image 0.6s, box-shadow 0.6s";
    });
    
    cardEl.addEventListener("mouseenter", () => {
      cardEl.style.transition = "none";
    });
  }

  // 2. Initializing 3D Interactive Canvas
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  // Track mouse coordinates to manipulate camera position slightly (3D sway parallax)
  let targetAngleX = 0;
  let targetAngleY = 0;
  let currentAngleX = 0;
  let currentAngleY = 0;

  window.addEventListener("mousemove", (e) => {
    const mouseX = e.clientX - window.innerWidth / 2;
    const mouseY = e.clientY - window.innerHeight / 2;
    targetAngleY = (mouseX / (window.innerWidth / 2)) * 0.35; // Tilt camera up to 0.35 rad (approx 20 deg)
    targetAngleX = -(mouseY / (window.innerHeight / 2)) * 0.35;
  });

  // 3D Nodes Setup
  interface Node3D {
    x: number;
    y: number;
    z: number;
    size: number;
    color: string;
    text?: string;
    isRune?: boolean;
  }

  // Define German Words and Runes to Render floating in 3D space
  const elementsPool = [
    "Zauberei", "Drache", "Burg", "Abenteuer", "überwinden",
    "Sieg", "Lernen", "Wort", "Macht", "Schwert", "🦉"
  ];
  const runeSet = ["᚛", "ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ", "ᚺ", "ᚾ", "ᛁ", "ᛃ", "ᛇ", "ᛈ", "ᛉ", "ᛋ", "ᛏ", "ᛒ", "ᛖ", "ᛗ", "ᛚ", "ᛜ", "ᛞ", "ᛟ"];

  const nodes: Node3D[] = [];

  // Generate 75 subtle background stars
  for (let i = 0; i < 75; i++) {
    nodes.push({
      x: (Math.random() - 0.5) * 1200,
      y: (Math.random() - 0.5) * 1200,
      z: (Math.random() - 0.5) * 1000,
      size: Math.random() * 2 + 1,
      color: `rgba(${139 + Math.random() * 50}, ${92 + Math.random() * 50}, 246, ${Math.random() * 0.2 + 0.05})`,
    });
  }

  // Generate 12 specialized floating vocabulary labels
  for (let i = 0; i < 12; i++) {
    const isText = Math.random() > 0.45;
    const txt = isText 
      ? elementsPool[Math.floor(Math.random() * elementsPool.length)]
      : runeSet[Math.floor(Math.random() * runeSet.length)];
      
    nodes.push({
      x: (Math.random() - 0.5) * 1000,
      y: (Math.random() - 0.5) * 1000,
      z: (Math.random() - 0.5) * 800,
      size: isText ? 10 : 15,
      color: isText ? "rgba(167, 139, 250, 0.4)" : "rgba(34, 197, 94, 0.18)",
      text: txt,
      isRune: !isText,
    });
  }

  // Focal length constant for 3D projections
  const focalLength = 350;

  // Active loop rendering logic
  function animate() {
    ctx!.clearRect(0, 0, width, height);

    // Filter mouse drift mathematically
    currentAngleX += (targetAngleX - currentAngleX) * 0.04;
    currentAngleY += (targetAngleY - currentAngleY) * 0.04;

    // Depth sorting so nodes closer are drawn last, correctly overlaying nodes behind details
    nodes.sort((a, b) => b.z - a.z);

    // Apply very subtle continuous orbital rotation (yaw drift)
    const yawSpeed = 0.0006;
    const cosYaw = Math.cos(yawSpeed);
    const sinYaw = Math.sin(yawSpeed);

    for (const node of nodes) {
      // 1. Slow drift in space coordinates
      node.z -= 0.55; // particles moving towards perspective
      if (node.z < -focalLength) {
        node.z = 800; // recycle back to target distance range
      }

      // 2. Passive orbital rotation around Y-axis
      const rx = node.x * cosYaw - node.z * sinYaw;
      const rz = node.z * cosYaw + node.x * sinYaw;
      node.x = rx;
      node.z = rz;

      // 3. Projection sway mapping with active mouse movement yaw + pitch
      const cosY = Math.cos(currentAngleY);
      const sinY = Math.sin(currentAngleY);
      const cosX = Math.cos(currentAngleX);
      const sinX = Math.sin(currentAngleX);

      // Rotate camera around Y-axis
      const x1 = node.x * cosY - node.z * sinY;
      const z1 = node.z * cosY + node.x * sinY;

      // Rotate camera around X-axis
      const y1 = node.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + node.y * sinX;

      // 4. Perspective projection formula values
      if (z2 > -focalLength) {
        const projScale = focalLength / (focalLength + z2);
        const screenX = width / 2 + x1 * projScale;
        const screenY = height / 2 + y1 * projScale;

        // Render point if visible inside browser viewport frame
        if (screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height) {
          const depthMultiplier = Math.max(0, Math.min(1.2, (z2 + focalLength) / 1000));
          const opacity = projScale * 0.6 * depthMultiplier;

          if (node.text) {
            ctx!.save();
            ctx!.font = `${node.isRune ? "italic 600" : "500"} ${Math.round(node.size * projScale * 1.5)}px var(--font-display, sans-serif)`;
            ctx!.fillStyle = node.isRune 
              ? `rgba(167, 139, 250, ${opacity * 0.8})` 
              : `rgba(99, 102, 241, ${opacity * 0.7})`;
            ctx!.textAlign = "center";
            ctx!.textBaseline = "middle";

            if (node.isRune) {
              ctx!.shadowBlur = 8 * projScale;
              ctx!.shadowColor = "rgba(139, 92, 246, 0.45)";
            }

            ctx!.fillText(node.text, screenX, screenY);
            ctx!.restore();
          } else {
            ctx!.beginPath();
            ctx!.arc(screenX, screenY, Math.max(0.6, node.size * projScale), 0, Math.PI * 2);
            ctx!.fillStyle = `rgba(139, 92, 246, ${opacity})`;
            ctx!.fill();
          }
        }
      }
    }

    requestAnimationFrame(animate);
  }

  animate();
}
