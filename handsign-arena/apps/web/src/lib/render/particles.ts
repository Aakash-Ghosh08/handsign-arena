export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity?: number;
  fade?: boolean;
}

export class ParticleSystem {
  particles: Particle[] = [];

  burst(x: number, y: number, count: number, color: string, opts: { speed?: number; size?: number; spread?: number; gravity?: number } = {}) {
    const speed = opts.speed ?? 140;
    const size = opts.size ?? 3;
    const spread = opts.spread ?? Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * spread - spread / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.5,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        gravity: opts.gravity ?? 0,
        fade: true,
      });
    }
  }

  trail(x: number, y: number, color: string, size = 3) {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      life: 0,
      maxLife: 0.25,
      size,
      color,
      fade: true,
    });
  }

  step(dt: number) {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      const alpha = p.fade ? 1 - t : 1;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size * (1 - t * 0.4)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.particles = [];
  }
}
