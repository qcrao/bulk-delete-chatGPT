// Confetti burst from the middle of the screen, shown when a bulk delete
// finishes without failures. Self-contained canvas animation: no assets, no
// page globals touched besides window.BDConfetti.
if (typeof window.BDConfetti === "undefined") {
  (function () {
    const COLORS = ["#FF5F57", "#FEBC2E", "#28C840", "#2F80ED", "#BB6BD9", "#FF8AD8", "#56CCF2", "#F2994A"];
    const GRAVITY = 0.32;
    const DRAG = 0.985;
    const DURATION_MS = 3200;
    const FADE_MS = 700;

    let running = null;

    function prefersReducedMotion() {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }

    function createParticle(x, y, power) {
      // Mostly upwards, spread around the full circle so it reads as a burst.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
      const speed = power * (0.45 + Math.random() * 0.75);
      const isCircle = Math.random() < 0.25;
      return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        width: isCircle ? 7 : 6 + Math.random() * 6,
        height: isCircle ? 7 : 10 + Math.random() * 8,
        isCircle,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
        // Flutter: the piece flips around its horizontal axis as it falls.
        tilt: Math.random() * Math.PI * 2,
        tiltSpeed: 0.08 + Math.random() * 0.12,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.04 + Math.random() * 0.06
      };
    }

    function launch() {
      if (running) return running;
      if (prefersReducedMotion() || !document.body) return Promise.resolve();

      running = new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        canvas.dataset.bulkDeleteConfetti = "true";
        Object.assign(canvas.style, {
          position: "fixed",
          inset: "0",
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: "2147483647"
        });
        document.body.appendChild(canvas);
        const ctx = canvas.getContext("2d");

        const resize = () => {
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.round(window.innerWidth * dpr);
          canvas.height = Math.round(window.innerHeight * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener("resize", resize);

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const power = Math.max(14, Math.min(24, Math.min(window.innerWidth, window.innerHeight) / 32));
        const particles = [];
        const burst = (count, scale) => {
          for (let i = 0; i < count; i++) particles.push(createParticle(centerX, centerY, power * scale));
        };
        // A main burst and a smaller follow-up, like a firework's second pop.
        burst(140, 1);
        const followUp = setTimeout(() => burst(70, 0.75), 220);

        const startedAt = performance.now();
        let done = false;
        // requestAnimationFrame doesn't run in a background tab; make sure the
        // canvas still goes away and callers waiting on it carry on.
        const safety = setTimeout(() => finish(), DURATION_MS + 500);
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(safety);
          clearTimeout(followUp);
          window.removeEventListener("resize", resize);
          canvas.remove();
          running = null;
          resolve();
        };

        const frame = (now) => {
          if (done) return;
          const elapsed = now - startedAt;
          if (elapsed >= DURATION_MS) {
            finish();
            return;
          }
          const alpha = elapsed > DURATION_MS - FADE_MS ? (DURATION_MS - elapsed) / FADE_MS : 1;
          ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
          ctx.globalAlpha = Math.max(0, alpha);

          for (const p of particles) {
            p.vx *= DRAG;
            p.vy = p.vy * DRAG + GRAVITY;
            p.wobble += p.wobbleSpeed;
            p.x += p.vx + Math.cos(p.wobble) * 0.6;
            p.y += p.vy;
            p.rotation += p.spin;
            p.tilt += p.tiltSpeed;
            if (p.y > window.innerHeight + 40) continue;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.scale(1, Math.cos(p.tilt));
            ctx.fillStyle = p.color;
            if (p.isCircle) {
              ctx.beginPath();
              ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
            }
            ctx.restore();
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      return running;
    }

    window.BDConfetti = { launch };
  })();
}
