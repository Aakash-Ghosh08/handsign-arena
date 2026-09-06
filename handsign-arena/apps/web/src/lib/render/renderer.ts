import type { GameState, PlayerSlot, Projectile } from "@handsign/shared";
import { ParticleSystem } from "./particles";

const PALETTE = {
  bg: "#14110F",
  bgGrid: "#221D18",
  ring: "#3A322A",
  p1: "#5FB4E0", // cool blue — matches "lightning" chakra tone for player 1 accent
  p2: "#E4762F", // warm ember — matches player 2 accent
  fire: "#FF6A3D",
  fireCore: "#FFD199",
  lightning: "#7FE6FF",
  lightningCore: "#FFFFFF",
  shield: "#6E8CFF",
  heal: "#63D48A",
  danger: "#FF4D4D",
  text: "#EDE7DC",
};

interface HitEvent {
  x: number;
  y: number;
  color: string;
}

export class ArenaRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fireballImage: HTMLImageElement;
  private particles = new ParticleSystem();
  private shakeUntil = 0;
  private shakeMag = 0;
  private prevState: GameState | null = null;
  private prevProjectileIds = new Set<string>();
  private prevHealth: Record<PlayerSlot, number> = { p1: 100, p2: 100 };
  private prevShield: Record<PlayerSlot, boolean> = { p1: false, p2: false };
  private flashUntil: Record<PlayerSlot, number> = { p1: 0, p2: 0 };
  private lastFrameTime = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.fireballImage = new Image();
    this.fireballImage.src = "/fireball.gif";
  }

  /** Call whenever a fresh authoritative snapshot arrives, to diff for feedback triggers. */
  applyState(state: GameState) {
    const now = performance.now();
    const ids = new Set(state.projectiles.map((p) => p.id));

    // New projectiles just spawned -> cast burst at the caster
    for (const proj of state.projectiles) {
      if (!this.prevProjectileIds.has(proj.id)) {
        const color = proj.kind === "fireball" ? PALETTE.fire : PALETTE.lightning;
        this.particles.burst(proj.pos.x, proj.pos.y, proj.kind === "fireball" ? 14 : 22, color, {
          speed: 90,
          size: proj.kind === "fireball" ? 3 : 4,
        });
      }
    }

    // Projectiles that vanished near a player = an impact
    if (this.prevState) {
      for (const prevProj of this.prevState.projectiles) {
        if (!ids.has(prevProj.id)) {
          const targetSlot: PlayerSlot = prevProj.owner === "p1" ? "p2" : "p1";
          const target = state.players[targetSlot];
          const dist = Math.hypot(target.pos.x - prevProj.pos.x, target.pos.y - prevProj.pos.y);
          if (dist < 90) {
            const blocked = target.shieldActive;
            const color = blocked ? PALETTE.shield : prevProj.kind === "fireball" ? PALETTE.fire : PALETTE.lightning;
            this.particles.burst(target.pos.x, target.pos.y, blocked ? 16 : 26, color, { speed: 200, size: 4 });
            if (!blocked) {
              this.shakeUntil = now + 220;
              this.shakeMag = prevProj.kind === "fireball" ? 6 : 11;
              this.flashUntil[targetSlot] = now + 180;
            }
          }
        }
      }
    }

    // heal sparkle: health went up without a projectile impact
    for (const slot of ["p1", "p2"] as PlayerSlot[]) {
      const player = state.players[slot];
      if (player.health > this.prevHealth[slot]) {
        this.particles.burst(player.pos.x, player.pos.y - 10, 12, PALETTE.heal, { speed: 60, size: 3, gravity: -40 });
      }
      if (!this.prevShield[slot] && player.shieldActive) {
        this.particles.burst(player.pos.x, player.pos.y, 10, PALETTE.shield, { speed: 70, size: 3 });
      }
      this.prevHealth[slot] = player.health;
      this.prevShield[slot] = player.shieldActive;
    }

    this.prevProjectileIds = ids;
    this.prevState = state;
  }

  /** Render one frame. `renderState` should already be interpolated by the caller for smoothness. */
  render(renderState: GameState) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    const { ctx, canvas } = this;
    const { width, height } = canvas;
    const scale = Math.min(width / renderState.arena.width, height / renderState.arena.height);
    const offsetX = (width - renderState.arena.width * scale) / 2;
    const offsetY = (height - renderState.arena.height * scale) / 2;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    let shakeX = 0;
    let shakeY = 0;
    if (now < this.shakeUntil) {
      const t = (this.shakeUntil - now) / 220;
      shakeX = (Math.random() - 0.5) * this.shakeMag * t;
      shakeY = (Math.random() - 0.5) * this.shakeMag * t;
    }
    ctx.translate(offsetX + shakeX, offsetY + shakeY);
    ctx.scale(scale, scale);

    this.drawBackground(renderState);

    this.particles.step(dt);

    for (const proj of renderState.projectiles) {
      this.drawProjectile(proj);
    }

    for (const slot of ["p1", "p2"] as PlayerSlot[]) {
      this.drawPlayer(renderState, slot, now);
    }

    this.particles.draw(ctx);

    ctx.restore();
  }

  private drawBackground(state: GameState) {
    const { ctx } = this;
    const { width, height } = state.arena;
    const grad = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, width * 0.7);
    grad.addColorStop(0, "#1C1712");
    grad.addColorStop(1, PALETTE.bg);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // faint concentric "seal" rings, off-center-quiet, reads as an arena without being noisy
    ctx.strokeStyle = PALETTE.ring;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (let r = 60; r < width * 0.6; r += 90) {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // center divider
    ctx.strokeStyle = "#2A241D";
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawProjectile(proj: Projectile) {
    const { ctx } = this;
    if (Math.random() < 0.6) {
      this.particles.trail(proj.pos.x, proj.pos.y, proj.kind === "fireball" ? PALETTE.fire : PALETTE.lightning, proj.kind === "fireball" ? 3 : 2.5);
    }
    ctx.save();
    if (proj.kind === "fireball") {
      if (this.fireballImage.complete && this.fireballImage.naturalWidth > 0) {
        const angle = Math.atan2(proj.dir.y, proj.dir.x) + Math.PI / 2;
        ctx.translate(proj.pos.x, proj.pos.y);
        ctx.rotate(angle);
        ctx.drawImage(this.fireballImage, -26, -26, 52, 52);
      }
    } else {
      const grad = ctx.createRadialGradient(proj.pos.x, proj.pos.y, 0, proj.pos.x, proj.pos.y, 22);
      grad.addColorStop(0, PALETTE.lightningCore);
      grad.addColorStop(0.4, PALETTE.lightning);
      grad.addColorStop(1, "rgba(127,230,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(proj.pos.x, proj.pos.y, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPlayer(state: GameState, slot: PlayerSlot, now: number) {
    const { ctx } = this;
    const player = state.players[slot];
    const accent = slot === "p1" ? PALETTE.p1 : PALETTE.p2;
    const { x, y } = player.pos;

    ctx.save();

    if (player.isDead) ctx.globalAlpha = 0.35;

    // hit flash ring
    if (now < this.flashUntil[slot]) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,77,77,0.25)";
      ctx.arc(x, y, 40, 0, Math.PI * 2);
      ctx.fill();
    }

    // shield
    if (player.shieldActive) {
      ctx.beginPath();
      ctx.strokeStyle = PALETTE.shield;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.85;
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = player.isDead ? 0.35 : 1;
    }

    // lightning-armed indicator
    if (player.lightningArmed && !player.isDead) {
      ctx.beginPath();
      ctx.strokeStyle = PALETTE.lightning;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 5]);
      ctx.arc(x, y, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // body glow
    const grad = ctx.createRadialGradient(x, y, 2, x, y, 26);
    grad.addColorStop(0, "#FFFFFF");
    grad.addColorStop(0.25, accent);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = accent;
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // name + health bar
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = PALETTE.text;
    ctx.font = "600 13px Inter, sans-serif";
    ctx.fillText(player.name, x, y - 46);

    const barW = 64;
    const pct = Math.max(0, player.health / player.maxHealth);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x - barW / 2, y - 40, barW, 6);
    ctx.fillStyle = pct > 0.4 ? PALETTE.heal : pct > 0.15 ? "#F4C24B" : PALETTE.danger;
    ctx.fillRect(x - barW / 2, y - 40, barW * pct, 6);
    ctx.restore();
  }

  resize(width: number, height: number, dpr = 1) {
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }
}

/** Linear-interpolate two authoritative snapshots for smooth 60fps rendering under a 30Hz network tick. */
export function interpolateState(a: GameState, b: GameState, t: number): GameState {
  const clampT = Math.max(0, Math.min(1, t));
  const lerp = (x: number, y: number) => x + (y - x) * clampT;
  const players = { ...a.players };
  (["p1", "p2"] as PlayerSlot[]).forEach((slot) => {
    players[slot] = {
      ...b.players[slot],
      pos: { x: lerp(a.players[slot].pos.x, b.players[slot].pos.x), y: lerp(a.players[slot].pos.y, b.players[slot].pos.y) },
    };
  });

  const bIds = new Set(b.projectiles.map((p) => p.id));
  const projectiles: Projectile[] = b.projectiles.map((proj) => {
    const prev = a.projectiles.find((p) => p.id === proj.id);
    if (!prev) return proj;
    return { ...proj, pos: { x: lerp(prev.pos.x, proj.pos.x), y: lerp(prev.pos.y, proj.pos.y) } };
  });
  // include projectiles that just disappeared this frame so their impact still reads as continuous motion
  for (const proj of a.projectiles) {
    if (!bIds.has(proj.id)) projectiles.push(proj);
  }

  return { ...b, players, projectiles };
}
