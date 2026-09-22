import { describe, expect, it } from 'vitest';
import { advectFlowField, FlowParticle } from './AiWait';

/**
 * Regression test for the bug this field was rewritten to fix: the original
 * advection read a direction straight off a scalar potential, which has sinks,
 * so after roughly 30 seconds of a deep search every particle had drained into
 * one and the "researching" cloud was a single clump.
 *
 * The fix was to advect along the CURL of the potential (exactly
 * divergence-free, so no sinks) and to wrap on the field's own period so the
 * seam stays continuous. Neither property is visible in the DOM — the whole
 * animation lives on a canvas — so it is asserted on the maths directly.
 */

/** The two canvases AiWait actually mounts, at their real CSS heights. */
const RESEARCH = { w: 320, h: 96, drift: 0.62 };
const THINK = { w: 640, h: 112, drift: 0.22 };

/** A 60fps frame, as the loop sees it (`dt` is clamped to 1..34ms there). */
const FRAME_MS = 16.67;

function seedGrid(w: number, h: number, cols: number, rows: number): FlowParticle[] {
  const out: FlowParticle[] = [];
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      out.push({
        // Offset by half a cell so no particle starts exactly on an edge or a
        // field node, which would be an unfairly easy (or hard) start.
        x: ((i + 0.5) / cols) * w,
        y: ((j + 0.5) / rows) * h,
        vx: 0,
        vy: 0,
      });
    }
  }
  return out;
}

function run(
  field: { w: number; h: number; drift: number },
  frames: number,
  particles: FlowParticle[],
) {
  for (let f = 0; f < frames; f += 1) {
    advectFlowField(particles, { ...field, t: f * FRAME_MS, dt: FRAME_MS });
  }
  return particles;
}

const GRID_X = 8;
const GRID_Y = 4;
const CELLS = GRID_X * GRID_Y;

function stats(particles: FlowParticle[], w: number, h: number) {
  const xs = particles.map((p) => p.x);
  const ys = particles.map((p) => p.y);
  const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;
  const sd = (v: number[]) => {
    const m = mean(v);
    return Math.sqrt(mean(v.map((n) => (n - m) ** 2)));
  };
  // Occupancy is the assertion that actually catches a collapse. Standard
  // deviation stays high when the cloud piles onto two distant attractors, and
  // the span stays wide if a single particle is left behind — but a clumped
  // cloud always empties most of the grid.
  const occupied = new Set<string>();
  for (const p of particles) {
    const cx = Math.min(GRID_X - 1, Math.floor((p.x / w) * GRID_X));
    const cy = Math.min(GRID_Y - 1, Math.floor((p.y / h) * GRID_Y));
    occupied.add(`${cx}:${cy}`);
  }
  return {
    sdX: sd(xs),
    sdY: sd(ys),
    spanX: Math.max(...xs) - Math.min(...xs),
    spanY: Math.max(...ys) - Math.min(...ys),
    occupied: occupied.size,
  };
}

describe('advectFlowField — the cloud never collapses', () => {
  it('keeps the research field spread after 6000 frames (~100s at 60fps)', () => {
    const particles = run(RESEARCH, 6000, seedGrid(RESEARCH.w, RESEARCH.h, 20, 10));
    const { sdX, sdY, spanX, spanY, occupied } = stats(particles, RESEARCH.w, RESEARCH.h);

    // A perfectly uniform spread has sd = size/sqrt(12) ≈ 0.289·size. The old
    // sink-driven collapse drove both standard deviations to ~0.
    expect(sdX).toBeGreaterThan(RESEARCH.w * 0.2);
    expect(sdY).toBeGreaterThan(RESEARCH.h * 0.2);
    // The cloud still reaches across most of the canvas in both axes.
    expect(spanX).toBeGreaterThan(RESEARCH.w * 0.75);
    expect(spanY).toBeGreaterThan(RESEARCH.h * 0.75);
    // …and it fills the canvas rather than piling onto a few attractors.
    expect(occupied).toBeGreaterThanOrEqual(CELLS * 0.75);
  });

  it('keeps the slower think field spread over the same run', () => {
    const particles = run(THINK, 6000, seedGrid(THINK.w, THINK.h, 12, 8));
    const { sdX, sdY, spanX, spanY, occupied } = stats(particles, THINK.w, THINK.h);

    expect(sdX).toBeGreaterThan(THINK.w * 0.2);
    expect(sdY).toBeGreaterThan(THINK.h * 0.2);
    expect(spanX).toBeGreaterThan(THINK.w * 0.75);
    expect(spanY).toBeGreaterThan(THINK.h * 0.75);
    // 96 particles over 32 cells, so a few empty cells are just sampling.
    expect(occupied).toBeGreaterThanOrEqual(CELLS * 0.6);
  });

  it('never lets a particle leave [0,w) × [0,h), even after 20000 frames', () => {
    const particles = run(RESEARCH, 20000, seedGrid(RESEARCH.w, RESEARCH.h, 20, 10));
    for (const p of particles) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(RESEARCH.w);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(RESEARCH.h);
    }
  });

  it('does not lose spread as the run gets longer', () => {
    // The collapse was gradual, so a short run looked fine. Spread at 20000
    // frames must be in the same league as at 600.
    const at = (frames: number) =>
      stats(run(RESEARCH, frames, seedGrid(RESEARCH.w, RESEARCH.h, 20, 10)), RESEARCH.w, RESEARCH.h);
    const early = at(600);
    const late = at(20000);
    expect(late.sdX).toBeGreaterThan(early.sdX * 0.7);
    expect(late.sdY).toBeGreaterThan(early.sdY * 0.7);
    expect(late.occupied).toBeGreaterThanOrEqual(early.occupied * 0.9);
  });

  it('is area-preserving: the field has no sink to drain a cell into', () => {
    // Numerical divergence of the velocity field, sampled on a grid. A curl
    // field is divergence-free everywhere; the direction field it replaced was
    // not, and that is precisely what made a cell shrink to a point.
    const { w, h, drift } = RESEARCH;
    const eps = 1e-4;
    const velocity = (x: number, y: number) => {
      const p: FlowParticle = { x, y, vx: 0, vy: 0 };
      // dt = 0 leaves the position untouched but still fills in the velocity.
      advectFlowField([p], { w, h, drift, t: 12345, dt: 0 });
      return { vx: p.vx, vy: p.vy };
    };

    let worst = 0;
    for (let i = 1; i < 12; i += 1) {
      for (let j = 1; j < 12; j += 1) {
        const x = (i / 12) * w;
        const y = (j / 12) * h;
        const dvx = (velocity(x + eps, y).vx - velocity(x - eps, y).vx) / (2 * eps);
        const dvy = (velocity(x, y + eps).vy - velocity(x, y - eps).vy) / (2 * eps);
        worst = Math.max(worst, Math.abs(dvx + dvy));
      }
    }
    // Only finite-difference noise should be left.
    expect(worst).toBeLessThan(1e-6);
  });

  it('wraps on the field period, so the seam is continuous', () => {
    // Identical phase at x and x+w, and at y and y+h: a particle that wraps
    // lands in the same flow it left instead of an unrelated part of the field.
    const { w, h, drift } = RESEARCH;
    const sample = (x: number, y: number) => {
      const p: FlowParticle = { x, y, vx: 0, vy: 0 };
      advectFlowField([p], { w, h, drift, t: 4321, dt: 0 });
      return p;
    };
    const a = sample(3, 11);
    const bx = sample(3 + w, 11);
    const by = sample(3, 11 + h);
    expect(bx.vx).toBeCloseTo(a.vx, 9);
    expect(bx.vy).toBeCloseTo(a.vy, 9);
    expect(by.vx).toBeCloseTo(a.vx, 9);
    expect(by.vy).toBeCloseTo(a.vy, 9);
  });
});
