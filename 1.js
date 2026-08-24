/**
 * Capsule Mod v21.0 — аддон «темы под фильм»
 * Подключать ПОСЛЕ основного плагина Капсула (v20.6+).
 *
 * • Новые уникальные сцены с сильными отсылками (красный шар, REDRUM,
 *   бэт-сигнал, световые мечи, Кольцо, 88 MPH, ствол 007 и др.)
 * • Старые франшизы переведены на более точные фоны
 * • Расширенный каталог палитр
 */
(function () {
  "use strict";
  if (window.plugin_capsule_mod_v21) return;
  window.plugin_capsule_mod_v21 = true;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (n) => Math.floor(Math.random() * n);
  const pickOne = (arr) => arr[rnd(arr.length)];
  const TAU = Math.PI * 2;
  const N = (n) => clamp(Math.round(n * 0.9), 4, 180);

  const NEW_SCENES = {
    redballoon: () => {
      const mk = (bottom) => ({ x: .08 + Math.random() * .84, y: bottom ? 1.2 : Math.random(), r: 10 + Math.random() * 18, v: .018 + Math.random() * .03, sw: Math.random() * TAU, giant: false });
      const b = Array.from({ length: N(9) }, () => mk(false));
      b[0].giant = true; b[0].r = 28;
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt;
        b.forEach(o => {
          o.y -= o.v * dt; o.x += Math.sin(t * .5 + o.sw) * .0012;
          if (o.y < -.2) Object.assign(o, mk(true), { giant: o.giant, r: o.giant ? 28 : o.r });
          const x = o.x * W, y = o.y * H;
          ctx.globalAlpha = o.giant ? .28 : .16; ctx.fillStyle = "#E23636";
          ctx.beginPath(); ctx.ellipse(x, y, o.r * .78, o.r, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = .1; ctx.strokeStyle = "#8C1C2B";
          ctx.beginPath(); ctx.moveTo(x, y + o.r); ctx.quadraticCurveTo(x + Math.sin(t + o.sw) * 14, y + o.r + 50, x, y + o.r + 90); ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } };
    },
    redrum: () => {
      const L = "REDRUM".split("");
      const keys = Array.from({ length: N(18) }, () => ({ i: rnd(6), x: Math.random(), y: -Math.random(), v: .04 + Math.random() * .06, rot: (Math.random() - .5) * .4 }));
      let t = 0, flood = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; flood = (flood + dt * .04) % 1.6;
        const fh = clamp(Math.sin(flood * Math.PI) * .22, 0, .22);
        ctx.globalAlpha = .1; ctx.fillStyle = "#6B1018"; ctx.fillRect(0, H * (1 - fh), W, H * fh);
        ctx.fillStyle = "#C9A227"; ctx.font = Math.min(W, H) * .045 + "px monospace"; ctx.textAlign = "center";
        keys.forEach(k => {
          k.y += k.v * dt; if (k.y > 1.1) { k.y = -.1; k.x = Math.random(); k.i = rnd(6); }
          ctx.globalAlpha = .16; ctx.save(); ctx.translate(k.x * W, k.y * H); ctx.rotate(k.rot); ctx.fillText(L[k.i], 0, 0); ctx.restore();
        });
        ctx.textAlign = "start"; ctx.globalAlpha = 1;
      } };
    },
    batsignal: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt;
        const cx = W * .72, cy = H * .22, R = Math.min(W, H) * .16;
        const g = ctx.createRadialGradient(cx, cy, R * .2, cx, cy, R * 2.4);
        g.addColorStop(0, "rgba(210,220,240,.16)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 2.4, 0, TAU); ctx.fill();
        ctx.globalAlpha = .14; ctx.fillStyle = "#DCE3F0"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = .22; ctx.fillStyle = "#07080c";
        ctx.save(); ctx.translate(cx, cy); ctx.scale(R / 40, R / 40);
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.quadraticCurveTo(-18, -4, -28, 2); ctx.quadraticCurveTo(-16, -14, -8, -6); ctx.lineTo(-4, -14); ctx.lineTo(0, -8); ctx.lineTo(4, -14); ctx.lineTo(8, -6); ctx.quadraticCurveTo(16, -14, 28, 2); ctx.quadraticCurveTo(18, -4, 0, 6); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      } };
    },
    lightsaber: () => {
      let t = 0;
      return { fps: 28, draw(ctx, W, H, dt) {
        t += dt;
        const cx = W * .5, cy = H * .52, clash = .5 + .5 * Math.sin(t * 3.2);
        const blade = (ang, color, len) => {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
          ctx.strokeStyle = color; ctx.lineCap = "round";
          ctx.globalAlpha = .12; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke();
          ctx.globalAlpha = .32; ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
        };
        const L = Math.min(W, H) * .34;
        blade(-.55 - clash * .12, "#4BD5FF", L);
        blade(.55 + clash * .12, "#E23B3B", L);
        ctx.globalAlpha = 1;
      } };
    },
    onering: () => {
      let t = 0; const script = "Ash nazg durbatulûk";
      return { draw(ctx, W, H, dt) {
        t += dt;
        const cx = W * .5, cy = H * .48, R = Math.min(W, H) * .16;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * .35);
        ctx.globalAlpha = .18; ctx.strokeStyle = "#C9A227"; ctx.lineWidth = R * .18;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
        ctx.globalAlpha = .14; ctx.fillStyle = "#E7C55A"; ctx.font = R * .16 + "px serif"; ctx.textAlign = "center";
        for (let i = 0; i < script.length; i++) { ctx.save(); ctx.rotate((i / script.length) * TAU); ctx.fillText(script[i], 0, -R * .92); ctx.restore(); }
        ctx.restore(); ctx.globalAlpha = 1;
      } };
    },
    flux: () => {
      const trails = Array.from({ length: N(16) }, () => ({ x: 1.1, y: .35 + Math.random() * .35, len: .08 + Math.random() * .2, v: .7 + Math.random() * 1.1 }));
      let t = 0;
      return { fps: 28, draw(ctx, W, H, dt) {
        t += dt; ctx.strokeStyle = "#F0A202"; ctx.lineCap = "round";
        trails.forEach(o => {
          o.x -= o.v * dt; if (o.x < -.3) { o.x = 1.2; o.y = .35 + Math.random() * .35; }
          ctx.globalAlpha = .14; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.x * W, o.y * H); ctx.lineTo((o.x + o.len) * W, o.y * H); ctx.stroke();
        });
        ctx.globalAlpha = .16; ctx.fillStyle = "#F0A202"; ctx.font = "bold " + Math.min(W, H) * .08 + "px monospace"; ctx.textAlign = "center";
        ctx.fillText("88 MPH", W * .5, H * .22); ctx.textAlign = "start"; ctx.globalAlpha = 1;
      } };
    },
    gunbarrel: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .5, R = Math.min(W, H) * .22;
        ctx.globalAlpha = .08; ctx.strokeStyle = "#C8A64B"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, R * .55, 0, TAU); ctx.stroke();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * .15);
        for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; ctx.globalAlpha = .12; ctx.fillStyle = "#C8A64B"; ctx.beginPath(); ctx.arc(Math.cos(a) * R * .78, Math.sin(a) * R * .78, 5, 0, TAU); ctx.fill(); }
        ctx.restore(); ctx.globalAlpha = 1;
      } };
    },
    arcreactor: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .5, R = Math.min(W, H) * .14 * (1 + .04 * Math.sin(t * 3));
        const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, R * 3);
        g.addColorStop(0, "rgba(116,229,255,.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 3, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#74E5FF";
        for (let i = 0; i < 4; i++) { ctx.globalAlpha = .1 + .06 * Math.sin(t * 2 + i); ctx.beginPath(); ctx.arc(cx, cy, R * (.35 + i * .22), 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } };
    },
    redeye: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .46, pulse = .5 + .5 * Math.sin(t * 2.4);
        ctx.globalAlpha = .08; ctx.fillStyle = "#1a1c20"; ctx.fillRect(0, cy - 40, W, 80);
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 80);
        g.addColorStop(0, "rgba(226,59,59," + (.35 + pulse * .2) + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 80, 0, TAU); ctx.fill();
        ctx.globalAlpha = .45; ctx.fillStyle = "#E23B3B"; ctx.beginPath(); ctx.arc(cx, cy, 7 + pulse * 2, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } };
    },
    pokeball: () => {
      const mk = (top) => ({ x: Math.random(), y: top ? -.12 : Math.random(), s: 10 + Math.random() * 10, v: .05 + Math.random() * .08, rot: Math.random() * TAU, vr: (Math.random() - .5) * 3 });
      const o = Array.from({ length: N(14) }, () => mk(false));
      return { draw(ctx, W, H, dt) {
        o.forEach(p => {
          p.y += p.v * dt; p.rot += p.vr * dt; if (p.y > 1.14) Object.assign(p, mk(true));
          ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot);
          ctx.globalAlpha = .2; ctx.fillStyle = "#E23B3B"; ctx.beginPath(); ctx.arc(0, 0, p.s, Math.PI, 0); ctx.fill();
          ctx.fillStyle = "#EFEFEF"; ctx.beginPath(); ctx.arc(0, 0, p.s, 0, Math.PI); ctx.fill();
          ctx.strokeStyle = "#1A1A1A"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-p.s, 0); ctx.lineTo(p.s, 0); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, p.s * .22, 0, TAU); ctx.fill(); ctx.restore();
        });
        ctx.globalAlpha = 1;
      } };
    },
    strawhat: () => {
      const hats = Array.from({ length: N(8) }, () => ({ x: Math.random(), y: .55 + Math.random() * .4, s: 14 + Math.random() * 10, sw: Math.random() * TAU, drift: (Math.random() - .5) * .02 }));
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt;
        hats.forEach(o => {
          o.x += o.drift * dt; if (o.x < -.1) o.x = 1.1; if (o.x > 1.1) o.x = -.1;
          const x = o.x * W, y = (o.y + Math.sin(t * .8 + o.sw) * .01) * H;
          ctx.globalAlpha = .18; ctx.fillStyle = "#E8B33C";
          ctx.beginPath(); ctx.ellipse(x, y, o.s, o.s * .22, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(x, y - o.s * .25, o.s * .45, o.s * .28, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = .12; ctx.strokeStyle = "#C0392B"; ctx.beginPath(); ctx.moveTo(x - o.s * .4, y - o.s * .15); ctx.lineTo(x + o.s * .4, y - o.s * .15); ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } };
    },
    deathpages: () => {
      const mk = (top) => ({ x: Math.random(), y: top ? -.14 : Math.random(), w: 16 + Math.random() * 10, v: .035 + Math.random() * .05, rot: (Math.random() - .5) * .5, vr: (Math.random() - .5) * .8 });
      const o = Array.from({ length: N(12) }, () => mk(false));
      return { draw(ctx, W, H, dt) {
        o.forEach(p => {
          p.y += p.v * dt; p.rot += p.vr * dt; if (p.y > 1.14) Object.assign(p, mk(true));
          ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot);
          ctx.globalAlpha = .14; ctx.fillStyle = "#E8E4D8"; ctx.fillRect(-p.w / 2, -p.w * .7, p.w, p.w * 1.4); ctx.restore();
        });
        ctx.globalAlpha = 1;
      } };
    },
    alphabet: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const y = H * .28, gap = W / 14;
        for (let i = 0; i < 12; i++) {
          const on = Math.sin(t * 3 + i) > .3;
          ctx.globalAlpha = on ? .28 : .06; ctx.fillStyle = on ? "#E01E37" : "#5B8DEF";
          ctx.beginPath(); ctx.arc(gap * (i + 1.2), y, 5, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = "#E01E37"; ctx.font = Math.min(W, H) * .08 + "px monospace"; ctx.textAlign = "center";
        "RUN".split("").forEach((ch, i) => { ctx.globalAlpha = .12 + .16 * (.5 + .5 * Math.sin(t * 2 + i)); ctx.fillText(ch, W * (.38 + i * .12), H * .55); });
        ctx.textAlign = "start"; ctx.globalAlpha = 1;
      } };
    },
    formula: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; ctx.globalAlpha = .16; ctx.textAlign = "center";
        ctx.fillStyle = "#D6E24A"; ctx.font = "bold " + Math.min(W, H) * .12 + "px monospace";
        ctx.fillText("Br", W * .38, H * .48); ctx.fillStyle = "#1FAE96"; ctx.fillText("Ba", W * .62, H * .48);
        ctx.textAlign = "start"; ctx.globalAlpha = 1;
      } };
    },
    briefcase: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .62, pulse = .5 + .5 * Math.sin(t * 1.4);
        const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(W, H) * .45);
        g.addColorStop(0, "rgba(255,212,0," + (.18 + pulse * .1) + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = .16; ctx.fillStyle = "#1A1208";
        const bw = Math.min(W, H) * .22; ctx.fillRect(cx - bw / 2, cy - bw * .31, bw, bw * .62);
        ctx.globalAlpha = 1;
      } };
    },
    oranges: () => {
      const mk = (top) => ({ x: Math.random(), y: top ? -.1 : Math.random(), r: 7 + Math.random() * 8, v: .04 + Math.random() * .07, rot: Math.random() * TAU, vr: (Math.random() - .5) * 2 });
      const o = Array.from({ length: N(16) }, () => mk(false));
      return { draw(ctx, W, H, dt) {
        o.forEach(p => {
          p.y += p.v * dt; p.rot += p.vr * dt; if (p.y > 1.14) Object.assign(p, mk(true));
          ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot);
          ctx.globalAlpha = .2; ctx.fillStyle = "#E0762B"; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill(); ctx.restore();
        });
        ctx.globalAlpha = 1;
      } };
    },
    katana: () => {
      const slashes = []; let wait = .2;
      return { fps: 26, draw(ctx, W, H, dt) {
        wait -= dt;
        if (wait <= 0) { slashes.push({ x: .15 + Math.random() * .7, y: .2 + Math.random() * .6, a: -.6 + Math.random() * .4, age: 0, len: .18 + Math.random() * .2 }); wait = .55 + Math.random() * .9; }
        const unit = Math.min(W, H);
        for (let i = slashes.length - 1; i >= 0; i--) {
          const s = slashes[i]; s.age += dt;
          const k = clamp(s.age * 6, 0, 1), fade = 1 - clamp((s.age - .15) / .55, 0, 1);
          if (fade <= 0) { slashes.splice(i, 1); continue; }
          ctx.save(); ctx.translate(s.x * W, s.y * H); ctx.rotate(s.a);
          ctx.strokeStyle = "#F2C21B"; ctx.globalAlpha = .28 * fade; ctx.lineWidth = 2.4; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(-s.len * unit * k, 0); ctx.lineTo(s.len * unit * k, 0); ctx.stroke(); ctx.restore();
        }
        ctx.globalAlpha = 1;
      } };
    },
    iceberg: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const water = H * .62 + Math.sin(t * .4) * 4;
        ctx.globalAlpha = .06; ctx.fillStyle = "#5B8DEF"; ctx.fillRect(0, water, W, H - water);
        ctx.globalAlpha = .14; ctx.fillStyle = "#C9E9F7";
        ctx.beginPath(); ctx.moveTo(W * .58, water + 20); ctx.lineTo(W * .7, H * .22); ctx.lineTo(W * .86, water + 10); ctx.closePath(); ctx.fill();
        const rx = W * .28, ry = water - 8 + Math.sin(t) * 6;
        ctx.globalAlpha = .2; ctx.fillStyle = "#C0392B"; ctx.beginPath(); ctx.arc(rx, ry, 7, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } };
    },
    ironthrone: () => {
      return { draw(ctx, W, H) {
        const cx = W * .5, base = H * .78;
        ctx.strokeStyle = "#C0A062"; ctx.lineCap = "round";
        for (let i = 0; i < 18; i++) {
          const a = -.9 + (i / 17) * 1.8, len = Math.min(W, H) * (.18 + (i % 3) * .06);
          ctx.globalAlpha = .1 + (i % 2) * .04; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * 20, base); ctx.lineTo(cx + Math.sin(a) * len, base - Math.cos(a * .4) * len); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } };
    },
    mockingjay: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .42, s = Math.min(W, H) * .08;
        ctx.globalAlpha = .16; ctx.strokeStyle = "#E0762B"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, s, 0, TAU); ctx.stroke();
        ctx.fillStyle = "#E0762B"; ctx.beginPath();
        ctx.moveTo(cx, cy + s * .1); ctx.quadraticCurveTo(cx - s * .9, cy - s * .2, cx - s * 1.4, cy + s * .3);
        ctx.quadraticCurveTo(cx - s * .3, cy, cx, cy - s * .15); ctx.quadraticCurveTo(cx + s * .3, cy, cx + s * 1.4, cy + s * .3);
        ctx.quadraticCurveTo(cx + s * .9, cy - s * .2, cx, cy + s * .1); ctx.fill();
        ctx.globalAlpha = 1;
      } };
    },
    whipcrack: () => {
      let t = 0, crack = 0;
      return { fps: 26, draw(ctx, W, H, dt) {
        t += dt; crack -= dt; if (crack <= 0 && Math.random() < .02) crack = .35;
        const cx = W * .22, cy = H * .4;
        ctx.strokeStyle = "#C08A3E"; ctx.lineCap = "round"; ctx.lineWidth = 2; ctx.globalAlpha = .2;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        for (let i = 1; i <= 12; i++) { const q = i / 12, wave = Math.sin(t * 8 + q * 6) * (crack > 0 ? 28 : 10); ctx.lineTo(cx + q * W * .62, cy + wave + q * 40); }
        ctx.stroke(); ctx.globalAlpha = 1;
      } };
    },
    amber: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .48, R = Math.min(W, H) * .18;
        ctx.globalAlpha = .14; ctx.fillStyle = "#C4762A"; ctx.beginPath(); ctx.ellipse(cx, cy, R * .75, R, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = .1; ctx.fillStyle = "#3E6B3A"; ctx.beginPath(); ctx.ellipse(cx, cy + Math.sin(t) * 2, 8, 3, .4, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } };
    },
    tesseract: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .5, s = Math.min(W, H) * .16;
        ctx.strokeStyle = "#B8C4D6"; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const k = .55 + i * .22; ctx.globalAlpha = .08 + i * .03;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * (.2 + i * .08)); ctx.strokeRect(-s * k, -s * k, s * 2 * k, s * 2 * k); ctx.restore();
        }
        ctx.globalAlpha = 1;
      } };
    },
    wormsign: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; ctx.strokeStyle = "#E7B46A"; ctx.lineWidth = 1;
        for (let i = 0; i < 7; i++) {
          ctx.globalAlpha = .04 + i * .008; ctx.beginPath();
          for (let x = -20; x < W + 20; x += 16) { const y = H * (.4 + i * .07) + Math.sin(x * .012 + t * .4 + i) * 14; x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
          ctx.stroke();
        }
        const wx = ((t * .08) % 1.4) - .2;
        ctx.globalAlpha = .12; ctx.fillStyle = "#8C6B3F"; ctx.beginPath(); ctx.ellipse(wx * W, H * .7, 80, 18, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } };
    },
    goldcoin: () => {
      const mk = (top) => ({ x: Math.random(), y: top ? -.1 : Math.random(), s: 7 + Math.random() * 6, v: .05 + Math.random() * .08, rot: Math.random() * TAU, vr: 2 + Math.random() * 4 });
      const o = Array.from({ length: N(16) }, () => mk(false));
      return { draw(ctx, W, H, dt) {
        o.forEach(p => {
          p.y += p.v * dt; p.rot += p.vr * dt; if (p.y > 1.14) Object.assign(p, mk(true));
          ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.globalAlpha = .2; ctx.fillStyle = "#C9A227";
          ctx.beginPath(); ctx.ellipse(0, 0, p.s * Math.abs(Math.cos(p.rot)), p.s, 0, 0, TAU); ctx.fill(); ctx.restore();
        });
        ctx.globalAlpha = 1;
      } };
    },
    soot: () => {
      const s = Array.from({ length: N(22) }, () => ({ x: Math.random(), y: Math.random(), r: 3 + Math.random() * 5, a: Math.random() * TAU, v: .02 + Math.random() * .04 }));
      return { draw(ctx, W, H, dt) {
        s.forEach(o => {
          o.a += (Math.random() - .5) * dt; o.x = (o.x + Math.cos(o.a) * o.v * dt + 1) % 1; o.y = (o.y + Math.sin(o.a) * o.v * dt + 1) % 1;
          ctx.globalAlpha = .16; ctx.fillStyle = "#1A1A1A"; ctx.beginPath(); ctx.arc(o.x * W, o.y * H, o.r, 0, TAU); ctx.fill();
          ctx.globalAlpha = .2; ctx.fillStyle = "#F4FFC2"; ctx.beginPath(); ctx.arc(o.x * W - o.r * .3, o.y * H - o.r * .2, 1.2, 0, TAU); ctx.fill();
        });
        ctx.globalAlpha = 1;
      } };
    },
    memoryorbs: () => {
      const COL = ["#F2C21B", "#E05FA8", "#5B8DEF", "#E0453E", "#3FA34D"];
      const o = Array.from({ length: N(18) }, () => ({ x: Math.random(), y: Math.random(), r: 6 + Math.random() * 10, a: Math.random() * TAU, v: .01 + Math.random() * .02, c: pickOne(COL), ph: Math.random() * TAU }));
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt;
        o.forEach(s => {
          s.a += dt * .3; s.x = clamp(s.x + Math.cos(s.a) * s.v * dt, 0, 1); s.y = clamp(s.y + Math.sin(s.a) * s.v * dt * .6, 0, 1);
          const pulse = .5 + .5 * Math.sin(t * 1.5 + s.ph);
          ctx.globalAlpha = .08 * pulse; ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * 3, 0, TAU); ctx.fill();
          ctx.globalAlpha = .2; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, TAU); ctx.fill();
        });
        ctx.globalAlpha = 1;
      } };
    },
    houseup: () => {
      const COL = ["#E8792B", "#5B8DEF", "#E23636", "#F2C21B", "#3FA34D"];
      const b = Array.from({ length: N(16) }, () => ({ x: .35 + Math.random() * .3, y: .15 + Math.random() * .25, r: 6 + Math.random() * 10, sw: Math.random() * TAU, c: pickOne(COL) }));
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const hx = W * .5, hy = H * .62 + Math.sin(t * .5) * 8;
        b.forEach(o => {
          const x = (o.x + Math.sin(t * .4 + o.sw) * .02) * W, y = (o.y + Math.sin(t * .6 + o.sw) * .015) * H;
          ctx.globalAlpha = .16; ctx.fillStyle = o.c; ctx.beginPath(); ctx.ellipse(x, y, o.r * .75, o.r, 0, 0, TAU); ctx.fill();
        });
        ctx.globalAlpha = .14; ctx.fillStyle = "#E8792B"; ctx.fillRect(hx - 22, hy, 44, 32);
        ctx.beginPath(); ctx.moveTo(hx - 28, hy); ctx.lineTo(hx, hy - 22); ctx.lineTo(hx + 28, hy); ctx.fill();
        ctx.globalAlpha = 1;
      } };
    },
    pianokeys: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const y = H * .72, n = 16, kw = W / n;
        for (let i = 0; i < n; i++) {
          const on = Math.sin(t * 4 + i * .7) > .4;
          ctx.globalAlpha = on ? .16 : .06; ctx.fillStyle = "#EFEFEF"; ctx.fillRect(i * kw + 1, y, kw - 2, H * .18);
        }
        ctx.globalAlpha = 1;
      } };
    },
    lighthouse: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .7, cy = H * .38;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * .6);
        const g = ctx.createLinearGradient(0, 0, Math.min(W, H) * .7, 0);
        g.addColorStop(0, "rgba(200,220,255,.16)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Math.min(W, H) * .7, -.18, .18); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = .14; ctx.fillStyle = "#8FA3B8"; ctx.fillRect(cx - 8, cy, 16, H * .4); ctx.globalAlpha = 1;
      } };
    },
    logograms: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .5;
        ctx.strokeStyle = "#7EC8F0"; ctx.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) { ctx.globalAlpha = .1; ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * (.08 + i * .05), t + i, t + i + 4.2); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } };
    },
    infinitystones: () => {
      const COL = ["#C0392B", "#3FA34D", "#5B8DEF", "#F2C21B", "#8B5CF6", "#E0762B"];
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .5, R = Math.min(W, H) * .2;
        COL.forEach((c, i) => {
          const a = t * .25 + (i / 6) * TAU, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * .55, pulse = .5 + .5 * Math.sin(t * 2 + i);
          ctx.globalAlpha = .1 * pulse; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.fill();
          ctx.globalAlpha = .28; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
        });
        ctx.globalAlpha = 1;
      } };
    },
    web: () => {
      return { draw(ctx, W, H) {
        ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1;
        [[0, 0], [W, 0], [0, H], [W, H]].forEach(([cx, cy]) => {
          ctx.globalAlpha = .08;
          for (let i = 1; i <= 5; i++) { ctx.beginPath(); ctx.arc(cx, cy, i * 28, 0, TAU); ctx.stroke(); }
          for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 140, cy + Math.sin(a) * 140); ctx.stroke(); }
        });
        ctx.globalAlpha = 1;
      } };
    },
    acorn: () => {
      const mk = (top) => ({ x: Math.random(), y: top ? -.1 : Math.random(), s: 6 + Math.random() * 6, v: .04 + Math.random() * .07, rot: Math.random() * TAU, vr: (Math.random() - .5) * 2 });
      const o = Array.from({ length: N(18) }, () => mk(false));
      return { draw(ctx, W, H, dt) {
        o.forEach(p => {
          p.y += p.v * dt; p.rot += p.vr * dt; if (p.y > 1.14) Object.assign(p, mk(true));
          ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot);
          ctx.globalAlpha = .18; ctx.fillStyle = "#C08A3E"; ctx.beginPath(); ctx.ellipse(0, p.s * .2, p.s * .7, p.s, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = "#8C6B3F"; ctx.beginPath(); ctx.ellipse(0, -p.s * .35, p.s * .8, p.s * .45, 0, 0, TAU); ctx.fill(); ctx.restore();
        });
        ctx.globalAlpha = 1;
      } };
    },
    girlred: () => {
      const flakes = Array.from({ length: N(40) }, () => ({ x: Math.random(), y: Math.random(), r: .8 + Math.random() * 1.6, v: .02 + Math.random() * .04 }));
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; ctx.fillStyle = "#C9CDD2";
        flakes.forEach(f => { f.y += f.v * dt; if (f.y > 1.05) { f.y = -.05; f.x = Math.random(); } ctx.globalAlpha = .08; ctx.beginPath(); ctx.arc(f.x * W, f.y * H, f.r, 0, TAU); ctx.fill(); });
        const x = W * (.42 + Math.sin(t * .3) * .04), y = H * .62;
        ctx.globalAlpha = .28; ctx.fillStyle = "#8C1C2B"; ctx.beginPath(); ctx.ellipse(x, y, 7, 16, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y - 20, 5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      } };
    },
    ghostface: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .42, s = Math.min(W, H) * .16;
        ctx.globalAlpha = .14 + .04 * Math.sin(t); ctx.fillStyle = "#E8E8E8"; ctx.beginPath(); ctx.ellipse(cx, cy, s * .7, s, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = .22; ctx.fillStyle = "#07080c";
        ctx.beginPath(); ctx.ellipse(cx - s * .22, cy - s * .1, s * .16, s * .28, -.2, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + s * .22, cy - s * .1, s * .16, s * .28, .2, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx, cy + s * .35, s * .18, s * .28, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } };
    },
    xenomorph: () => {
      const eggs = Array.from({ length: N(6) }, () => ({ x: .15 + Math.random() * .7, y: .55 + Math.random() * .35, s: 16 + Math.random() * 14, ph: Math.random() * TAU }));
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt;
        eggs.forEach(e => {
          const pulse = .5 + .5 * Math.sin(t * 1.2 + e.ph);
          ctx.globalAlpha = .12; ctx.fillStyle = "#7FD8C0"; ctx.beginPath(); ctx.ellipse(e.x * W, e.y * H, e.s * .7, e.s * (1 + pulse * .05), 0, 0, TAU); ctx.fill();
        });
        ctx.globalAlpha = 1;
      } };
    },
    thermal: () => {
      const blobs = Array.from({ length: N(10) }, () => ({ x: Math.random(), y: Math.random(), r: 20 + Math.random() * 40, ph: Math.random() * TAU, c: pickOne(["#8FC93A", "#C0392B", "#E0762B"]) }));
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt;
        blobs.forEach(b => {
          ctx.globalAlpha = .06 + .04 * Math.sin(t * 2 + b.ph); ctx.fillStyle = b.c;
          ctx.beginPath(); ctx.arc((b.x + Math.sin(t * .3 + b.ph) * .02) * W, (b.y + Math.cos(t * .25 + b.ph) * .02) * H, b.r, 0, TAU); ctx.fill();
        });
        ctx.globalAlpha = 1;
      } };
    },
    lightcycle: () => {
      const trails = [{ y: .3, x: 0, v: .35, c: "#4BD5FF" }, { y: .55, x: .4, v: .28, c: "#F0A202" }, { y: .72, x: .1, v: .4, c: "#4BD5FF" }];
      return { fps: 28, draw(ctx, W, H, dt) {
        ctx.lineCap = "round";
        trails.forEach(tr => {
          tr.x += tr.v * dt; if (tr.x > 1.4) tr.x = -.2;
          ctx.strokeStyle = tr.c; ctx.globalAlpha = .16; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo((tr.x - .22) * W, tr.y * H); ctx.lineTo(tr.x * W, tr.y * H); ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } };
    },
    rasengan: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .5, R = Math.min(W, H) * .12;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 4); ctx.strokeStyle = "#2E6FD6";
        for (let i = 0; i < 8; i++) { ctx.globalAlpha = .12; ctx.beginPath(); ctx.ellipse(0, 0, R, R * .35, (i * Math.PI) / 8, 0, TAU); ctx.stroke(); }
        ctx.restore(); ctx.globalAlpha = 1;
      } };
    },
    walls: () => {
      return { draw(ctx, W, H) {
        ctx.strokeStyle = "#8C6B3F"; ctx.lineWidth = 8; ctx.globalAlpha = .1;
        ctx.beginPath(); ctx.moveTo(0, H * .35); ctx.lineTo(W, H * .35); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, H * .62); ctx.lineTo(W, H * .62); ctx.stroke();
        ctx.globalAlpha = 1;
      } };
    },
    dragonballs: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .5, R = Math.min(W, H) * .22;
        for (let i = 0; i < 7; i++) {
          const a = t * .2 + (i / 7) * TAU;
          ctx.globalAlpha = .2; ctx.fillStyle = "#F0A202"; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R * .55, 12, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } };
    },
    nichirin: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .5;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 1.4) * .4);
        ctx.strokeStyle = "#2E9BD6"; ctx.lineWidth = 3; ctx.globalAlpha = .2;
        ctx.beginPath(); ctx.moveTo(-Math.min(W, H) * .28, 0); ctx.quadraticCurveTo(0, -40, Math.min(W, H) * .28, 0); ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1;
      } };
    },
    jollyroger: () => {
      return { draw(ctx, W, H) {
        const cx = W * .5, cy = H * .4, s = Math.min(W, H) * .1;
        ctx.globalAlpha = .16; ctx.fillStyle = "#EFEFEF"; ctx.beginPath(); ctx.arc(cx, cy, s, 0, TAU); ctx.fill();
        ctx.fillStyle = "#07080c"; ctx.beginPath(); ctx.arc(cx - s * .3, cy - s * .1, s * .18, 0, TAU); ctx.arc(cx + s * .3, cy - s * .1, s * .18, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#EFEFEF"; ctx.lineWidth = 3; ctx.globalAlpha = .12;
        ctx.beginPath(); ctx.moveTo(cx - s * 1.4, cy + s * 1.2); ctx.lineTo(cx + s * 1.4, cy + s * 2.2);
        ctx.moveTo(cx + s * 1.4, cy + s * 1.2); ctx.lineTo(cx - s * 1.4, cy + s * 2.2); ctx.stroke();
        ctx.globalAlpha = 1;
      } };
    },
    plantboot: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .62;
        ctx.globalAlpha = .14; ctx.fillStyle = "#D9A441"; ctx.beginPath(); ctx.ellipse(cx, cy, 28, 14, 0, 0, TAU); ctx.fill(); ctx.fillRect(cx - 18, cy - 22, 36, 22);
        ctx.globalAlpha = .18; ctx.strokeStyle = "#7FBF6A"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy - 22); ctx.quadraticCurveTo(cx + 8, cy - 50, cx + Math.sin(t) * 6, cy - 70); ctx.stroke();
        ctx.globalAlpha = 1;
      } };
    },
    priderock: () => {
      return { draw(ctx, W, H) {
        const cx = W * .5, cy = H * .38, R = Math.min(W, H) * .14;
        const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, R * 2.5);
        g.addColorStop(0, "rgba(224,160,60,.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 2.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = .2; ctx.fillStyle = "#E0A03C"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } };
    },
    tripwire: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; ctx.strokeStyle = "#E0453E"; ctx.lineWidth = 1; ctx.globalAlpha = .12;
        for (let i = 0; i < 6; i++) { const y = H * (.25 + i * .1) + Math.sin(t + i) * 3; ctx.beginPath(); ctx.moveTo(W * .1, y); ctx.lineTo(W * .9, y + (i % 2 ? 20 : -10)); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } };
    },
    colosseum: () => {
      return { draw(ctx, W, H) {
        const cx = W * .5, cy = H * .55;
        ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 2; ctx.globalAlpha = .1;
        ctx.beginPath(); ctx.ellipse(cx, cy, W * .32, H * .16, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx, cy, W * .22, H * .1, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      } };
    },
    maze: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 1; ctx.globalAlpha = .08; const s = 40;
        for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
          ctx.beginPath();
          if ((x + y + Math.floor(t * 2) * s) % (s * 2) === 0) { ctx.moveTo(x, y); ctx.lineTo(x + s, y + s); } else { ctx.moveTo(x + s, y); ctx.lineTo(x, y + s); }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } };
    },
    debris: () => {
      const p = Array.from({ length: N(24) }, () => ({ x: Math.random(), y: Math.random(), s: 2 + Math.random() * 8, vx: (Math.random() - .5) * .03, vy: (Math.random() - .5) * .03, rot: Math.random() * TAU, vr: (Math.random() - .5) }));
      return { draw(ctx, W, H, dt) {
        ctx.fillStyle = "#B8C4D6";
        p.forEach(o => {
          o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
          if (o.x < -.1) o.x = 1.1; if (o.x > 1.1) o.x = -.1; if (o.y < -.1) o.y = 1.1; if (o.y > 1.1) o.y = -.1;
          ctx.globalAlpha = .12; ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot); ctx.fillRect(-o.s / 2, -o.s / 4, o.s, o.s / 2); ctx.restore();
        });
        ctx.globalAlpha = 1;
      } };
    },
    umbrella: () => {
      const u = Array.from({ length: N(7) }, () => ({ x: Math.random(), y: Math.random(), s: 16 + Math.random() * 14, v: .02 + Math.random() * .03, sw: Math.random() * TAU }));
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt;
        u.forEach(o => {
          o.y -= o.v * dt; if (o.y < -.15) { o.y = 1.1; o.x = Math.random(); }
          const x = o.x * W, y = o.y * H;
          ctx.globalAlpha = .14; ctx.fillStyle = "#5B8DEF"; ctx.beginPath(); ctx.arc(x, y, o.s, Math.PI, 0); ctx.fill();
        });
        ctx.globalAlpha = 1;
      } };
    },
    rubyslipper: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; ctx.fillStyle = "#F2C21B"; ctx.globalAlpha = .07; const s = 36;
        for (let y = H * .55; y < H; y += s) for (let x = 0; x < W; x += s * 1.6) ctx.fillRect(x + ((y / s) % 2) * s * .8, y, s * 1.4, s * .7);
        const cx = W * .5, cy = H * .42;
        ctx.globalAlpha = .2 + .08 * Math.sin(t * 4); ctx.fillStyle = "#C0392B";
        ctx.beginPath(); ctx.ellipse(cx - 16, cy, 12, 7, -.3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 16, cy, 12, 7, .3, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } };
    },
    trident: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; ctx.save(); ctx.translate(W * .5, H * .35); ctx.rotate(Math.sin(t * .6) * .15);
        ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 2; ctx.globalAlpha = .18;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, Math.min(W, H) * .4);
        ctx.moveTo(-16, 8); ctx.lineTo(-16, -28); ctx.moveTo(16, 8); ctx.lineTo(16, -28); ctx.moveTo(0, 8); ctx.lineTo(0, -36); ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1;
      } };
    },
    soap: () => {
      const mk = (top) => ({ x: Math.random(), y: top ? -.1 : Math.random(), w: 14 + Math.random() * 10, v: .03 + Math.random() * .05, rot: Math.random() * TAU, vr: (Math.random() - .5) });
      const o = Array.from({ length: N(14) }, () => mk(false));
      return { draw(ctx, W, H, dt) {
        o.forEach(p => { p.y += p.v * dt; p.rot += p.vr * dt; if (p.y > 1.14) Object.assign(p, mk(true));
          ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.globalAlpha = .14; ctx.fillStyle = "#E8E4D8"; ctx.fillRect(-p.w / 2, -p.w * .28, p.w, p.w * .56); ctx.restore(); });
        ctx.globalAlpha = 1;
      } };
    },
    cipher: () => {
      const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const cells = Array.from({ length: N(40) }, () => ({ x: Math.random(), y: Math.random(), ch: CH.charAt(rnd(CH.length)), ph: Math.random() * TAU }));
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; ctx.font = "12px monospace"; ctx.fillStyle = "#8C1C2B";
        cells.forEach(c => { if (Math.sin(t * 2 + c.ph) > .7) c.ch = CH.charAt(rnd(CH.length)); ctx.globalAlpha = .1 + .08 * Math.sin(t + c.ph); ctx.fillText(c.ch, c.x * W, c.y * H); });
        ctx.globalAlpha = 1;
      } };
    },
    pastry: () => {
      const mk = (top) => ({ x: Math.random(), y: top ? -.1 : Math.random(), s: 8 + Math.random() * 8, v: .03 + Math.random() * .05, rot: Math.random() * TAU, vr: (Math.random() - .5) * 1.2 });
      const o = Array.from({ length: N(12) }, () => mk(false));
      return { draw(ctx, W, H, dt) {
        o.forEach(p => { p.y += p.v * dt; p.rot += p.vr * dt; if (p.y > 1.14) Object.assign(p, mk(true));
          ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.globalAlpha = .16; ctx.fillStyle = "#E86FA0"; ctx.beginPath(); ctx.arc(0, 0, p.s, 0, TAU); ctx.fill(); ctx.restore(); });
        ctx.globalAlpha = 1;
      } };
    },
    letters: () => {
      const mk = (top) => ({ x: Math.random(), y: top ? -.12 : Math.random(), w: 18 + Math.random() * 10, v: .03 + Math.random() * .045, rot: (Math.random() - .5) * .4, vr: (Math.random() - .5) * .5 });
      const o = Array.from({ length: N(14) }, () => mk(false));
      return { draw(ctx, W, H, dt) {
        o.forEach(p => { p.y += p.v * dt; p.rot += p.vr * dt; if (p.y > 1.14) Object.assign(p, mk(true));
          ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.globalAlpha = .14; ctx.fillStyle = "#F2D9A0"; ctx.fillRect(-p.w / 2, -p.w * .65, p.w, p.w * 1.3); ctx.restore(); });
        ctx.globalAlpha = 1;
      } };
    },
    heisenberg: () => {
      return { draw(ctx, W, H) {
        const cx = W * .5, cy = H * .38;
        ctx.globalAlpha = .16; ctx.fillStyle = "#1A1A1A"; ctx.beginPath(); ctx.ellipse(cx, cy, 48, 10, 0, 0, TAU); ctx.fill(); ctx.fillRect(cx - 28, cy - 28, 56, 22);
        ctx.globalAlpha = .1; ctx.fillStyle = "#D6E24A"; ctx.font = "bold " + Math.min(W, H) * .05 + "px monospace"; ctx.textAlign = "center";
        ctx.fillText("SAY MY NAME", cx, H * .7); ctx.textAlign = "start"; ctx.globalAlpha = 1;
      } };
    },
    walkman: () => {
      return { draw(ctx, W, H) {
        const cx = W * .5, cy = H * .55;
        ctx.globalAlpha = .14; ctx.fillStyle = "#2B2B2B"; ctx.fillRect(cx - 36, cy - 22, 72, 44);
        ctx.fillStyle = "#7C4DFF"; ctx.fillRect(cx - 20, cy - 10, 40, 20); ctx.globalAlpha = 1;
      } };
    },
    origami: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .48, s = Math.min(W, H) * .1;
        ctx.save(); ctx.translate(cx, cy + Math.sin(t) * 6); ctx.globalAlpha = .16; ctx.fillStyle = "#F2B6FF";
        ctx.beginPath(); ctx.moveTo(0, s * .3); ctx.lineTo(-s, -s * .2); ctx.lineTo(-s * .2, -s * .05); ctx.lineTo(0, -s * .8); ctx.lineTo(s * .2, -s * .05); ctx.lineTo(s, -s * .2); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      } };
    },
    warrig: () => {
      const dust = Array.from({ length: N(30) }, () => ({ x: Math.random(), y: .55 + Math.random() * .4, r: 8 + Math.random() * 20, v: .08 + Math.random() * .12 }));
      return { draw(ctx, W, H, dt) {
        ctx.fillStyle = "#E0762B";
        dust.forEach(d => { d.x -= d.v * dt; if (d.x < -.1) { d.x = 1.1; d.y = .55 + Math.random() * .4; } ctx.globalAlpha = .06; ctx.beginPath(); ctx.arc(d.x * W, d.y * H, d.r, 0, TAU); ctx.fill(); });
        ctx.globalAlpha = 1;
      } };
    },
    boxing: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const hit = Math.sin(t * 5);
        ctx.strokeStyle = "#E23636"; ctx.globalAlpha = .1; ctx.strokeRect(W * .2, H * .25, W * .6, H * .5);
        ctx.globalAlpha = .18; ctx.fillStyle = "#E23636"; ctx.beginPath(); ctx.ellipse(W * .5 + hit * 30, H * .5, 22, 16, hit * .4, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } };
    },
    sharingan: () => {
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt; const cx = W * .5, cy = H * .5, R = Math.min(W, H) * .14;
        ctx.globalAlpha = .16; ctx.fillStyle = "#C0392B"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 1.2); ctx.fillStyle = "#1A1A1A";
        for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.arc(R * .45, 0, R * .12, 0, TAU); ctx.fill(); }
        ctx.restore(); ctx.globalAlpha = 1;
      } };
    },
    vegas: () => {
      const lights = Array.from({ length: N(24) }, () => ({ x: Math.random(), y: .15 + Math.random() * .5, ph: Math.random() * TAU, c: pickOne(["#F2C21B", "#E0453E", "#5B8DEF"]) }));
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt;
        lights.forEach(l => { ctx.globalAlpha = Math.sin(t * 6 + l.ph) > 0 ? .22 : .04; ctx.fillStyle = l.c; ctx.fillRect(l.x * W, l.y * H, 8, 18); });
        ctx.globalAlpha = 1;
      } };
    },
    eggo: () => {
      const mk = (top) => ({ x: Math.random(), y: top ? -.1 : Math.random(), s: 10 + Math.random() * 8, v: .03 + Math.random() * .05, rot: Math.random() * TAU, vr: (Math.random() - .5) * 1.5 });
      const o = Array.from({ length: N(10) }, () => mk(false));
      return { draw(ctx, W, H, dt) {
        o.forEach(p => { p.y += p.v * dt; p.rot += p.vr * dt; if (p.y > 1.14) Object.assign(p, mk(true));
          ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.globalAlpha = .16; ctx.fillStyle = "#E8B33C"; ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * .7, 0, 0, TAU); ctx.fill(); ctx.restore(); });
        ctx.globalAlpha = 1;
      } };
    },
    goldenticket: () => {
      const mk = (top) => ({ x: Math.random(), y: top ? -.12 : Math.random(), w: 22 + Math.random() * 10, v: .03 + Math.random() * .05, rot: Math.random() * TAU, vr: (Math.random() - .5) * 1.4 });
      const o = Array.from({ length: N(10) }, () => mk(false));
      return { draw(ctx, W, H, dt) {
        o.forEach(p => { p.y += p.v * dt; p.rot += p.vr * dt; if (p.y > 1.14) Object.assign(p, mk(true));
          ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.globalAlpha = .18; ctx.fillStyle = "#F2C21B"; ctx.fillRect(-p.w / 2, -p.w * .22, p.w, p.w * .44); ctx.restore(); });
        ctx.globalAlpha = 1;
      } };
    },
    slidingdoors: () => {
      const doors = Array.from({ length: 8 }, (_, i) => ({ x: (i % 4) / 4, y: Math.floor(i / 4) / 2, ph: i * .7 }));
      let t = 0;
      return { draw(ctx, W, H, dt) {
        t += dt;
        doors.forEach(d => {
          const open = .5 + .5 * Math.sin(t * .8 + d.ph), x = d.x * W + W * .04, y = d.y * H + H * .12, w = W * .18, h = H * .32;
          ctx.globalAlpha = .1; ctx.strokeStyle = "#5BC0EB"; ctx.strokeRect(x, y, w, h);
          ctx.globalAlpha = .08; ctx.fillStyle = "#3FA34D"; ctx.fillRect(x, y, w * (1 - open * .5), h);
        });
        ctx.globalAlpha = 1;
      } };
    }
  };

  const PI = Math.PI;
  const falling = (count, spawn, paint) => {
    return () => {
      const items = Array.from({ length: N(count) }, () => spawn(false));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          for (const o of items) {
            o.y += (o.v || 0.05) * dt * (o.dir || 1);
            o.x += (o.vx || 0) * dt;
            o.rot = (o.rot || 0) + (o.vr || 0) * dt;
            if (o.y > 1.16 || o.y < -0.2) Object.assign(o, spawn(true));
            paint(ctx, o, W, H, t);
          }
          ctx.globalAlpha = 1;
        },
      };
    };
  };

  const ICONIC = {
    sharkfin: () => {
      const fins = Array.from({ length: N(5) }, () => ({
        x: Math.random(),
        y: 0.58 + Math.random() * 0.12,
        s: 18 + Math.random() * 22,
        v: 0.04 + Math.random() * 0.05,
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#0A2A44";
          ctx.fillRect(0, H * 0.62, W, H);
          ctx.strokeStyle = "#1B6CA8";
          ctx.beginPath();
          for (let x = 0; x <= W; x += 12) {
            const y = H * 0.62 + Math.sin(x * 0.02 + t) * 5;
            x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
          for (const f of fins) {
            f.x += f.v * dt;
            if (f.x > 1.15) f.x = -0.12;
            const x = f.x * W;
            const y = f.y * H + Math.sin(t * 1.4 + f.x * 8) * 4;
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = "#1A1A1A";
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + f.s * 0.35, y - f.s);
            ctx.lineTo(x + f.s * 0.7, y);
            ctx.closePath();
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    myers: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.46 + Math.sin(t * 0.6) * 6;
          const s = Math.min(W, H) * 0.16;
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#F2EDE4";
          ctx.beginPath();
          ctx.ellipse(cx, cy, s * 0.72, s, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = "#0A0A0A";
          ctx.beginPath();
          ctx.ellipse(cx - s * 0.22, cy - s * 0.08, s * 0.12, s * 0.08, 0, 0, TAU);
          ctx.ellipse(cx + s * 0.22, cy - s * 0.08, s * 0.12, s * 0.08, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.ellipse(cx, cy + s * 0.28, s * 0.18, s * 0.05, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    squidshapes: falling(
      16,
      (top) => ({
        x: Math.random(),
        y: top ? -0.12 : Math.random(),
        s: 12 + Math.random() * 16,
        v: 0.03 + Math.random() * 0.05,
        k: rnd(3),
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 1.2,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = o.k === 0 ? "#E86FA0" : o.k === 1 ? "#3FA34D" : "#F2C21B";
        ctx.lineWidth = 2;
        const s = o.s;
        ctx.beginPath();
        if (o.k === 0) ctx.arc(0, 0, s * 0.45, 0, TAU);
        else if (o.k === 1) {
          ctx.moveTo(0, -s * 0.5);
          ctx.lineTo(s * 0.45, s * 0.4);
          ctx.lineTo(-s * 0.45, s * 0.4);
          ctx.closePath();
        } else ctx.strokeRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
        ctx.stroke();
        ctx.restore();
      },
    ),

    moth: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.48;
          const s = Math.min(W, H) * 0.18;
          const flap = 0.7 + 0.3 * Math.sin(t * 4);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#C9CDD2";
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(side * s * flap, -s * 0.6, side * s * 1.1 * flap, 0);
            ctx.quadraticCurveTo(side * s * flap, s * 0.7, 0, s * 0.15);
            ctx.fill();
          }
          ctx.fillStyle = "#8C1C2B";
          ctx.beginPath();
          ctx.ellipse(0, 0, s * 0.12, s * 0.32, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
        },
      };
    },

    fawkes: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.46 + Math.sin(t * 0.5) * 4;
          const s = Math.min(W, H) * 0.17;
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#E8E4D8";
          ctx.beginPath();
          ctx.ellipse(cx, cy, s * 0.7, s, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#C0392B";
          ctx.beginPath();
          ctx.ellipse(cx, cy + s * 0.18, s * 0.22, s * 0.12, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#1A1A1A";
          ctx.beginPath();
          ctx.ellipse(cx - s * 0.22, cy - s * 0.1, s * 0.14, s * 0.1, 0.2, 0, TAU);
          ctx.ellipse(cx + s * 0.22, cy - s * 0.1, s * 0.14, s * 0.1, -0.2, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = "#C0392B";
          for (let i = 0; i < 18; i++) {
            const a = t * 0.4 + (i / 18) * TAU;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * s * 2.2, cy + Math.sin(a) * s * 1.6, 3, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    pipes: falling(
      10,
      (top) => ({
        x: Math.random(),
        y: top ? -0.2 : Math.random(),
        s: 16 + Math.random() * 14,
        v: 0.04 + Math.random() * 0.05,
        k: rnd(2),
      }),
      (ctx, o, W, H) => {
        const x = o.x * W;
        const y = o.y * H;
        ctx.globalAlpha = 0.2;
        if (o.k === 0) {
          ctx.fillStyle = "#3FA34D";
          ctx.fillRect(x - o.s * 0.35, y, o.s * 0.7, o.s * 1.4);
          ctx.fillRect(x - o.s * 0.5, y - o.s * 0.2, o.s, o.s * 0.35);
        } else {
          ctx.fillStyle = "#E23B3B";
          ctx.beginPath();
          ctx.arc(x, y, o.s * 0.4, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#F2C21B";
          ctx.fillRect(x - o.s * 0.12, y - o.s * 0.15, o.s * 0.24, o.s * 0.3);
        }
      },
    ),

    goldrings: falling(
      18,
      (top) => ({
        x: Math.random(),
        y: top ? -0.1 : Math.random(),
        s: 8 + Math.random() * 10,
        v: 0.05 + Math.random() * 0.07,
        rot: Math.random() * TAU,
        vr: 2 + Math.random() * 3,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = "#F2C21B";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, o.s, o.s * 0.35, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      },
    ),

    voxels: falling(
      16,
      (top) => ({
        x: Math.random(),
        y: top ? -0.12 : Math.random(),
        s: 10 + Math.random() * 14,
        v: 0.04 + Math.random() * 0.06,
        rot: rnd(4) * (PI / 2),
        c: rnd(4),
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = ["#3FA34D", "#C08A3E", "#6B8E5A", "#8C6B3F"][o.c] || "#3FA34D";
        ctx.fillRect(-o.s / 2, -o.s / 2, o.s, o.s);
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#fff";
        ctx.fillRect(-o.s / 2, -o.s / 2, o.s, o.s * 0.3);
        ctx.restore();
      },
    ),

    spores: () => {
      const tend = Array.from({ length: N(14) }, () => ({
        x: Math.random(),
        y: 0.3 + Math.random() * 0.6,
        l: 40 + Math.random() * 80,
        ph: Math.random() * TAU,
        w: 1 + Math.random() * 2,
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.strokeStyle = "#C08A3E";
          for (const o of tend) {
            ctx.globalAlpha = 0.12;
            ctx.lineWidth = o.w;
            ctx.beginPath();
            ctx.moveTo(o.x * W, H);
            for (let i = 0; i <= 8; i++) {
              const p = i / 8;
              ctx.lineTo(
                o.x * W + Math.sin(t * 0.8 + o.ph + p * 4) * 18 * p,
                H - o.l * p,
              );
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    vault: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const R = Math.min(W, H) * 0.22;
          ctx.strokeStyle = "#3FA34D";
          ctx.globalAlpha = 0.16;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, TAU);
          ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, R * 0.72, 0, TAU);
          ctx.stroke();
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * 0.15);
          for (let i = 0; i < 8; i++) {
            ctx.rotate(TAU / 8);
            ctx.beginPath();
            ctx.moveTo(R * 0.2, 0);
            ctx.lineTo(R * 0.68, 0);
            ctx.stroke();
          }
          ctx.restore();
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#3FA34D";
          ctx.font = `bold ${Math.min(W, H) * 0.06}px ui-monospace,monospace`;
          ctx.textAlign = "center";
          ctx.fillText("111", cx, cy + 8);
          ctx.textAlign = "start";
          ctx.globalAlpha = 1;
        },
      };
    },

    teacup: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.52;
          const s = Math.min(W, H) * 0.12;
          ctx.globalAlpha = 0.18;
          ctx.strokeStyle = "#C9CDD2";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, s, s * 0.45, 0, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx + s * 1.15, cy, s * 0.28, -0.8, 0.8);
          ctx.stroke();
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * 1.6);
          ctx.globalAlpha = 0.14;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(s * 0.7, 0);
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#8C1C2B";
          ctx.beginPath();
          ctx.arc(cx, cy, s * 0.55, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    maypole: () => {
      const petals = Array.from({ length: N(20) }, () => ({
        x: Math.random(),
        y: Math.random(),
        s: 6 + Math.random() * 8,
        v: 0.02 + Math.random() * 0.03,
        c: pickOne(["#F2C21B", "#E86FA0", "#3FA34D", "#E0453E"]),
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          ctx.globalAlpha = 0.14;
          ctx.strokeStyle = "#F2C21B";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx, H * 0.12);
          ctx.lineTo(cx, H * 0.85);
          ctx.stroke();
          for (let i = 0; i < 6; i++) {
            const a = t * 0.4 + (i / 6) * TAU;
            ctx.globalAlpha = 0.1;
            ctx.beginPath();
            ctx.moveTo(cx, H * 0.14);
            ctx.quadraticCurveTo(
              cx + Math.cos(a) * 80,
              H * 0.45,
              cx + Math.cos(a) * 120,
              H * 0.82,
            );
            ctx.stroke();
          }
          for (const p of petals) {
            p.y += p.v * dt;
            if (p.y > 1.1) {
              p.y = -0.05;
              p.x = Math.random();
            }
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = p.c;
            ctx.beginPath();
            ctx.ellipse(p.x * W, p.y * H, p.s, p.s * 0.55, t, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    pinkbox: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const s = Math.min(W, H) * 0.22 * (1 + 0.02 * Math.sin(t));
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#E86FA0";
          ctx.fillRect(cx - s, cy - s * 1.15, s * 2, s * 2.3);
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = "#7EC8F0";
          ctx.fillRect(cx - s, cy - s * 1.15, s * 2, s * 0.18);
          ctx.strokeStyle = "#fff";
          ctx.globalAlpha = 0.12;
          ctx.strokeRect(cx - s * 0.7, cy - s * 0.7, s * 1.4, s * 1.4);
          ctx.globalAlpha = 1;
        },
      };
    },

    dualblades: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.52;
          const len = Math.min(W, H) * 0.38;
          const clash = 0.12 * Math.sin(t * 6);
          const blade = (ang) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(ang + clash);
            ctx.strokeStyle = "#E23B3B";
            ctx.lineCap = "round";
            ctx.globalAlpha = 0.12;
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(0, 20);
            ctx.lineTo(0, -len);
            ctx.stroke();
            ctx.globalAlpha = 0.28;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = "#B9B9B9";
            ctx.globalAlpha = 0.2;
            ctx.fillRect(-6, 8, 12, 28);
            ctx.restore();
          };
          blade(-0.55);
          blade(0.55);
          ctx.globalAlpha = 1;
        },
      };
    },

    perk: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.52;
          const s = Math.min(W, H) * 0.11;
          ctx.globalAlpha = 0.16;
          ctx.strokeStyle = "#E0453E";
          ctx.lineWidth = 3;
          ctx.strokeRect(cx - s * 2.2, cy - s * 1.6, s * 4.4, s * 3.2);
          ctx.fillStyle = "#F2C21B";
          ctx.beginPath();
          ctx.ellipse(cx, cy, s, s * 0.7, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "#E0453E";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx + s * 1.05, cy, s * 0.28, -1, 1);
          ctx.stroke();
          ctx.globalAlpha = 0.1;
          ctx.strokeStyle = "#C9CDD2";
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(cx - 6 + i * 6, cy - s * 0.9);
            ctx.quadraticCurveTo(
              cx - 6 + i * 6 + Math.sin(t * 2 + i) * 4,
              cy - s * 1.5,
              cx - 6 + i * 6,
              cy - s * 2.1,
            );
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    cowboyhat: falling(
      8,
      (top) => ({
        x: Math.random(),
        y: top ? -0.12 : Math.random(),
        s: 16 + Math.random() * 12,
        v: 0.03 + Math.random() * 0.04,
        rot: (Math.random() - 0.5) * 0.4,
        vr: (Math.random() - 0.5) * 0.6,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#C08A3E";
        ctx.beginPath();
        ctx.ellipse(0, 0, o.s, o.s * 0.22, 0, 0, TAU);
        ctx.fill();
        ctx.fillRect(-o.s * 0.4, -o.s * 0.55, o.s * 0.8, o.s * 0.5);
        ctx.fillStyle = "#E0453E";
        ctx.fillRect(-o.s * 0.4, -o.s * 0.12, o.s * 0.8, 3);
        ctx.restore();
      },
    ),

    plates: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const base = H * 0.72;
          ctx.fillStyle = "#3E6B3A";
          for (let i = 0; i < 9; i++) {
            const x = cx + (i - 4) * Math.min(W, H) * 0.045;
            const h = 28 + Math.sin(t * 1.5 + i) * 8 + (4 - Math.abs(i - 4)) * 10;
            ctx.globalAlpha = 0.16;
            ctx.beginPath();
            ctx.moveTo(x - 8, base);
            ctx.lineTo(x, base - h);
            ctx.lineTo(x + 8, base);
            ctx.fill();
          }
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#C4762A";
          ctx.fillRect(0, H * 0.78, W, H);
          ctx.globalAlpha = 1;
        },
      };
    },

    jets: () => {
      const trails = Array.from({ length: N(6) }, () => ({
        y: 0.15 + Math.random() * 0.5,
        x: Math.random(),
        v: 0.18 + Math.random() * 0.2,
        w: 40 + Math.random() * 80,
      }));
      return {
        draw(ctx, W, H, dt) {
          ctx.strokeStyle = "#5B8DEF";
          ctx.fillStyle = "#E23B3B";
          for (const tr of trails) {
            tr.x += tr.v * dt;
            if (tr.x > 1.2) {
              tr.x = -0.2;
              tr.y = 0.15 + Math.random() * 0.5;
            }
            ctx.globalAlpha = 0.12;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo((tr.x - 0.18) * W, tr.y * H);
            ctx.lineTo(tr.x * W, tr.y * H);
            ctx.stroke();
            ctx.globalAlpha = 0.22;
            ctx.beginPath();
            ctx.moveTo(tr.x * W, tr.y * H);
            ctx.lineTo(tr.x * W - 16, tr.y * H - 5);
            ctx.lineTo(tr.x * W - 16, tr.y * H + 5);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    scorpion: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.52;
          const s = Math.min(W, H) * 0.08;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.globalAlpha = 0.2;
          ctx.strokeStyle = "#E86FA0";
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.ellipse(0, 0, s * 1.1, s * 0.55, 0, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(s * 1.1, 0);
          ctx.quadraticCurveTo(s * 2.2, -s * 1.8 + Math.sin(t * 3) * 8, s * 1.4, -s * 2.2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(s * 1.35, -s * 2.25, 5, 0, TAU);
          ctx.stroke();
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * s * 0.6, s * 0.2);
            ctx.lineTo(side * s * 1.8, s * 1.1);
            ctx.stroke();
          }
          ctx.restore();
          ctx.globalAlpha = 1;
        },
      };
    },

    stairs: () => {
      const drops = Array.from({ length: N(40) }, () => ({
        x: Math.random(),
        y: Math.random(),
        v: 0.25 + Math.random() * 0.35,
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.strokeStyle = "#C9A227";
          ctx.globalAlpha = 0.1;
          for (let i = 0; i < 8; i++) {
            const y = H * (0.2 + i * 0.09);
            const inset = i * 18;
            ctx.beginPath();
            ctx.moveTo(W * 0.2 + inset, y);
            ctx.lineTo(W * 0.8 - inset, y);
            ctx.lineTo(W * 0.8 - inset - 18, y + H * 0.09);
            ctx.stroke();
          }
          ctx.fillStyle = "#7EC8F0";
          for (const d of drops) {
            d.y += d.v * dt;
            if (d.y > 1.1) {
              d.y = -0.05;
              d.x = Math.random();
            }
            ctx.globalAlpha = 0.12;
            ctx.fillRect(d.x * W, d.y * H, 1.2, 8);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    boxes: falling(
      7,
      (top) => ({
        x: Math.random(),
        y: top ? -0.12 : Math.random(),
        s: 16 + Math.random() * 10,
        v: 0.03 + Math.random() * 0.04,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 0.8,
        i: rnd(7),
      }),
      (ctx, o, W, H) => {
        const L = "GILPEWS";
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#2B2B2B";
        ctx.fillRect(-o.s / 2, -o.s / 2, o.s, o.s);
        ctx.strokeStyle = "#8C1C2B";
        ctx.strokeRect(-o.s / 2, -o.s / 2, o.s, o.s);
        ctx.fillStyle = "#C9CDD2";
        ctx.font = `${o.s * 0.55}px ui-monospace,monospace`;
        ctx.textAlign = "center";
        ctx.fillText(L[o.i] || "G", 0, o.s * 0.18);
        ctx.restore();
      },
    ),

    spiral: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          ctx.strokeStyle = "#3FA34D";
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 90; i++) {
            const a = i * 0.28 + t;
            const r = i * Math.min(W, H) * 0.0028;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.globalAlpha = 0.18;
          ctx.stroke();
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = "#B0392B";
          ctx.beginPath();
          ctx.arc(cx, cy, 6 + Math.sin(t * 3) * 2, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    assimilation: () => {
      const cells = Array.from({ length: N(18) }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: 8 + Math.random() * 16,
        ph: Math.random() * TAU,
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          for (const c of cells) {
            const pulse = 1 + 0.15 * Math.sin(t * 2 + c.ph);
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = Math.sin(t + c.ph) > 0.3 ? "#C0392B" : "#C9CDD2";
            ctx.beginPath();
            ctx.ellipse(c.x * W, c.y * H, c.r * pulse, c.r * 0.7 * pulse, c.ph, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    chipper: falling(
      22,
      (top) => ({
        x: 0.35 + Math.random() * 0.3,
        y: top ? -0.1 : Math.random(),
        s: 3 + Math.random() * 6,
        v: 0.12 + Math.random() * 0.18,
        vx: (Math.random() - 0.5) * 0.15,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 6,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#C9CDD2";
        ctx.fillRect(-o.s, -o.s * 0.3, o.s * 2, o.s * 0.6);
        ctx.restore();
      },
    ),

    mirrors: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * 0.2);
          for (let i = 0; i < 8; i++) {
            ctx.rotate(TAU / 8);
            ctx.globalAlpha = 0.08 + 0.06 * Math.sin(t * 2 + i);
            ctx.strokeStyle = "#C9A227";
            ctx.strokeRect(20, -30, 90, 60);
            ctx.strokeStyle = "#7C4DFF";
            ctx.strokeRect(40, -18, 50, 36);
          }
          ctx.restore();
          ctx.globalAlpha = 1;
        },
      };
    },

    inverted: () => {
      const bits = Array.from({ length: N(24) }, () => ({
        x: Math.random(),
        y: Math.random(),
        v: 0.06 + Math.random() * 0.1,
        dir: Math.random() > 0.5 ? 1 : -1,
        s: 2 + Math.random() * 3,
      }));
      return {
        draw(ctx, W, H, dt) {
          for (const b of bits) {
            b.y += b.v * dt * b.dir;
            if (b.y > 1.1) b.y = -0.05;
            if (b.y < -0.1) b.y = 1.05;
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = b.dir > 0 ? "#C9CDD2" : "#5B8DEF";
            ctx.fillRect(b.x * W, b.y * H, b.s, 10);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    sticks: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.55;
          const hit = Math.abs(Math.sin(t * 8));
          ctx.strokeStyle = "#C9A227";
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.globalAlpha = 0.2;
          ctx.beginPath();
          ctx.arc(cx, cy + 20, 70, PI, 0);
          ctx.stroke();
          ctx.save();
          ctx.translate(cx - 20, cy - 10);
          ctx.rotate(-0.6 - hit * 0.4);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -70);
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.translate(cx + 20, cy - 10);
          ctx.rotate(0.6 + hit * 0.4);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -70);
          ctx.stroke();
          ctx.restore();
          if (hit > 0.85) {
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = "#C0392B";
            ctx.beginPath();
            ctx.arc(cx, cy - 8, 6, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    screens: () => {
      const tiles = Array.from({ length: 12 }, (_, i) => ({
        x: (i % 4) / 4,
        y: Math.floor(i / 4) / 3,
        ph: i * 0.7,
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          for (const s of tiles) {
            const on = Math.sin(t * 2 + s.ph) > 0;
            ctx.globalAlpha = on ? 0.14 : 0.04;
            ctx.fillStyle = "#C9CDD2";
            ctx.fillRect(s.x * W + 12, s.y * H + 16, W * 0.2, H * 0.22);
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = "#2B2B2B";
            ctx.strokeRect(s.x * W + 12, s.y * H + 16, W * 0.2, H * 0.22);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    flash: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.55;
          const pulse = (t % 3) / 3;
          const R = Math.min(W, H) * pulse * 0.7;
          const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, R);
          g.addColorStop(0, `rgba(224,118,43,${0.28 * (1 - pulse)})`);
          g.addColorStop(0.4, `rgba(201,205,210,${0.12 * (1 - pulse)})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    comet: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const p = (t * 0.08) % 1.4;
          const x = W * (1.1 - p);
          const y = H * (0.15 + p * 0.35);
          ctx.strokeStyle = "#7EC8F0";
          ctx.globalAlpha = 0.2;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 90, y - 36);
          ctx.stroke();
          ctx.globalAlpha = 0.1;
          ctx.strokeStyle = "#E86FA0";
          ctx.lineWidth = 8;
          ctx.stroke();
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    razorcap: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.42;
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#2B2B2B";
          ctx.beginPath();
          ctx.ellipse(cx, cy, 54, 16, 0, 0, TAU);
          ctx.fill();
          ctx.fillRect(cx - 40, cy - 28, 80, 24);
          ctx.fillStyle = "#C9A227";
          ctx.fillRect(cx - 40, cy - 6, 80, 3);
          ctx.globalAlpha = 0.14;
          ctx.strokeStyle = "#C9CDD2";
          ctx.lineWidth = 1;
          for (let i = 0; i < 5; i++) {
            const a = t * 0.5 + i;
            ctx.beginPath();
            ctx.moveTo(cx - 30 + i * 15, cy + 20);
            ctx.lineTo(cx - 24 + i * 15 + Math.sin(a) * 4, cy + 48);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    cello: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const s = Math.min(W, H) * 0.12;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(Math.sin(t * 1.2) * 0.08);
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = "#C9CDD2";
          ctx.beginPath();
          ctx.ellipse(0, s * 0.4, s * 0.7, s * 1.1, 0, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(0, -s * 0.7, s * 0.45, s * 0.7, 0, 0, TAU);
          ctx.fill();
          ctx.fillRect(-3, -s * 2, 6, s * 1.2);
          ctx.strokeStyle = "#2B2B2B";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-s * 1.4, -s * 0.2);
          ctx.lineTo(s * 1.2, s * 0.8);
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 1;
        },
      };
    },

    kaneda: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const p = (t * 0.25) % 1.3;
          const x = W * (p - 0.15);
          const y = H * 0.62;
          ctx.strokeStyle = "#E23B3B";
          ctx.globalAlpha = 0.2;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(x - 120, y + 8);
          ctx.quadraticCurveTo(x - 40, y - 10, x, y);
          ctx.stroke();
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#E23B3B";
          ctx.beginPath();
          ctx.ellipse(x, y, 28, 10, -0.2, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = "#5B8DEF";
          ctx.fillRect(x - 8, y - 18, 16, 12);
          ctx.globalAlpha = 1;
        },
      };
    },

    evacross: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.48;
          const s = Math.min(W, H) * (0.18 + 0.04 * Math.sin(t));
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#C0392B";
          ctx.fillRect(cx - s * 0.12, cy - s * 1.3, s * 0.24, s * 2.6);
          ctx.fillRect(cx - s * 0.7, cy - s * 0.18, s * 1.4, s * 0.28);
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#5B8DEF";
          ctx.beginPath();
          ctx.arc(cx, cy, s * 1.6, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    autobot: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const s = Math.min(W, H) * 0.16 * (1 + 0.03 * Math.sin(t * 2));
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#E23B3B";
          ctx.beginPath();
          ctx.moveTo(cx, cy - s);
          ctx.lineTo(cx + s * 0.85, cy - s * 0.2);
          ctx.lineTo(cx + s * 0.55, cy + s);
          ctx.lineTo(cx - s * 0.55, cy + s);
          ctx.lineTo(cx - s * 0.85, cy - s * 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#0A0A0A";
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.moveTo(cx, cy - s * 0.35);
          ctx.lineTo(cx + s * 0.28, cy + s * 0.15);
          ctx.lineTo(cx - s * 0.28, cy + s * 0.15);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    visor: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cy = H * 0.46;
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = "#1A1A1A";
          ctx.fillRect(0, cy - 36, W, 72);
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#5B8DEF";
          ctx.fillRect(W * 0.18, cy - 10, W * 0.64, 20);
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = "#C9A227";
          const scan = ((t * 0.35) % 1) * W;
          ctx.fillRect(scan, cy - 36, 3, 72);
          ctx.font = `${Math.min(W, H) * 0.028}px ui-monospace,monospace`;
          ctx.fillStyle = "#5B8DEF";
          ctx.globalAlpha = 0.16;
          ctx.fillText("DIRECTIVE 4", W * 0.2, cy + 40);
          ctx.globalAlpha = 1;
        },
      };
    },

    domain: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const R = Math.min(W, H) * 0.28;
          ctx.strokeStyle = "#8B5CF6";
          for (let i = 0; i < 3; i++) {
            ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 2 + i);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, R * (0.4 + i * 0.28), t + i, t + i + 4.5);
            ctx.stroke();
          }
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#8B5CF6";
          ctx.beginPath();
          ctx.arc(cx, cy, 6, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    heartstone: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const s = Math.min(W, H) * 0.08 * (1 + 0.08 * Math.sin(t * 2));
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, s * 4);
          g.addColorStop(0, "rgba(28,169,201,.22)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, s * 4, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = "#1CA9C9";
          ctx.beginPath();
          ctx.moveTo(cx, cy + s);
          ctx.bezierCurveTo(cx + s * 1.4, cy - s * 0.2, cx + s * 0.5, cy - s * 1.1, cx, cy - s * 0.3);
          ctx.bezierCurveTo(cx - s * 0.5, cy - s * 1.1, cx - s * 1.4, cy - s * 0.2, cx, cy + s);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    snowflake: falling(
      16,
      (top) => ({
        x: Math.random(),
        y: top ? -0.1 : Math.random(),
        s: 6 + Math.random() * 10,
        v: 0.02 + Math.random() * 0.03,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 1.2,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = "#7EC8F0";
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 6; i++) {
          ctx.rotate(TAU / 6);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -o.s);
          ctx.moveTo(0, -o.s * 0.5);
          ctx.lineTo(-o.s * 0.25, -o.s * 0.7);
          ctx.moveTo(0, -o.s * 0.5);
          ctx.lineTo(o.s * 0.25, -o.s * 0.7);
          ctx.stroke();
        }
        ctx.restore();
      },
    ),

    saucer: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5 + Math.sin(t * 0.4) * 40;
          const cy = H * 0.32 + Math.sin(t * 0.7) * 10;
          const s = Math.min(W, H) * 0.14;
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = "#C08A3E";
          ctx.beginPath();
          ctx.moveTo(cx - s * 0.4, cy + 8);
          ctx.lineTo(cx, H * 0.85);
          ctx.lineTo(cx + s * 0.4, cy + 8);
          ctx.fill();
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#C9CDD2";
          ctx.beginPath();
          ctx.ellipse(cx, cy, s, s * 0.28, 0, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(cx, cy - s * 0.12, s * 0.45, s * 0.28, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    bagel: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const R = Math.min(W, H) * 0.16;
          ctx.globalAlpha = 0.18;
          ctx.strokeStyle = "#E86FA0";
          ctx.lineWidth = 18;
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, TAU);
          ctx.stroke();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#F2C21B";
          for (let i = 0; i < 16; i++) {
            const a = t * 0.3 + (i / 16) * TAU;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 3, 0, TAU);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    marigolds: falling(
      22,
      (top) => ({
        x: Math.random(),
        y: top ? -0.1 : Math.random(),
        s: 5 + Math.random() * 7,
        v: 0.03 + Math.random() * 0.04,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 1.5,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#E0762B";
        for (let i = 0; i < 5; i++) {
          ctx.rotate(TAU / 5);
          ctx.beginPath();
          ctx.ellipse(0, -o.s, o.s * 0.45, o.s, 0, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = "#F2C21B";
        ctx.beginPath();
        ctx.arc(0, 0, o.s * 0.35, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    ),

    casita: () => {
      const doors = Array.from({ length: 6 }, (_, i) => ({
        x: 0.15 + (i % 3) * 0.25,
        y: 0.3 + Math.floor(i / 3) * 0.28,
        ph: i,
        c: pickOne(["#E86FA0", "#F2C21B", "#3FA34D", "#5B8DEF"]),
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          for (const d of doors) {
            const glow = 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(t * 1.5 + d.ph));
            ctx.globalAlpha = glow;
            ctx.fillStyle = d.c;
            ctx.fillRect(d.x * W, d.y * H, W * 0.16, H * 0.2);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    jackmoon: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.72;
          const cy = H * 0.28;
          const R = Math.min(W, H) * 0.16;
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = "#F2C21B";
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#0A0A0A";
          ctx.beginPath();
          ctx.moveTo(cx - 10, cy - 8);
          ctx.lineTo(cx - 2, cy + 4);
          ctx.lineTo(cx - 18, cy + 4);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cx + 10, cy - 8);
          ctx.lineTo(cx + 2, cy + 4);
          ctx.lineTo(cx + 18, cy + 4);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cx - 16, cy + 12);
          ctx.lineTo(cx, cy + 22);
          ctx.lineTo(cx + 16, cy + 12);
          ctx.lineTo(cx, cy + 16);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    buttons: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.46;
          const s = Math.min(W, H) * 0.16;
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#E8E4D8";
          ctx.beginPath();
          ctx.ellipse(cx, cy, s * 0.7, s, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#1A1A1A";
          ctx.globalAlpha = 0.28;
          for (const side of [-1, 1]) {
            const x = cx + side * s * 0.22;
            const y = cy - s * 0.08;
            ctx.beginPath();
            ctx.arc(x, y, s * 0.14, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = "#C9CDD2";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x - 4, y);
            ctx.lineTo(x + 4, y);
            ctx.moveTo(x, y - 4);
            ctx.lineTo(x, y + 4);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    stripes: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const off = (t * 20) % 28;
          for (let i = -1; i < 24; i++) {
            ctx.globalAlpha = 0.08;
            ctx.fillStyle = i % 2 ? "#F2C21B" : "#1A1A1A";
            ctx.fillRect(0, i * 28 + off, W, 28);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    lamp: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.55;
          const g = ctx.createRadialGradient(cx, cy - 20, 4, cx, cy - 20, 120);
          g.addColorStop(0, `rgba(242,194,27,${0.18 + 0.08 * Math.sin(t * 3)})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy - 20, 120, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#C9A227";
          ctx.beginPath();
          ctx.ellipse(cx, cy, 36, 16, 0, 0, TAU);
          ctx.fill();
          ctx.fillRect(cx - 8, cy - 28, 16, 20);
          ctx.globalAlpha = 1;
        },
      };
    },

    rose: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.46;
          ctx.globalAlpha = 0.12;
          ctx.strokeStyle = "#3FA34D";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy + 10);
          ctx.lineTo(cx, cy + 90);
          ctx.stroke();
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#C0392B";
          for (let i = 0; i < 6; i++) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((i / 6) * TAU + t * 0.15);
            ctx.beginPath();
            ctx.ellipse(0, -12, 10, 18, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
          }
          const petals = (t * 0.15) % 1;
          if (petals > 0.7) {
            ctx.globalAlpha = 0.14;
            ctx.beginPath();
            ctx.ellipse(cx + 30, cy + petals * 80, 8, 12, 0.4, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    money: falling(
      16,
      (top) => ({
        x: Math.random(),
        y: top ? -0.12 : Math.random(),
        s: 14 + Math.random() * 10,
        v: 0.05 + Math.random() * 0.07,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 2,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#3FA34D";
        ctx.fillRect(-o.s, -o.s * 0.45, o.s * 2, o.s * 0.9);
        ctx.strokeStyle = "#C9A227";
        ctx.strokeRect(-o.s, -o.s * 0.45, o.s * 2, o.s * 0.9);
        ctx.restore();
      },
    ),

    shieldcap: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const R = Math.min(W, H) * 0.16;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * 0.4);
          const cols = ["#E23B3B", "#EFEFEF", "#E23B3B", "#1F6FEB"];
          for (let i = 0; i < 4; i++) {
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = cols[i];
            ctx.beginPath();
            ctx.arc(0, 0, R * (1 - i * 0.22), 0, TAU);
            ctx.fill();
          }
          ctx.fillStyle = "#EFEFEF";
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = -PI / 2 + (i * TAU) / 5;
            const r = i % 2 === 0 ? R * 0.28 : R * 0.12;
            const fn = i === 0 ? ctx.moveTo : ctx.lineTo;
            fn.call(ctx, Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
        },
      };
    },

    xlogo: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const s = Math.min(W, H) * 0.16 * (1 + 0.04 * Math.sin(t * 2));
          ctx.strokeStyle = "#E23B3B";
          ctx.lineWidth = 10;
          ctx.lineCap = "round";
          ctx.globalAlpha = 0.2;
          ctx.beginPath();
          ctx.moveTo(cx - s, cy - s);
          ctx.lineTo(cx + s, cy + s);
          ctx.moveTo(cx + s, cy - s);
          ctx.lineTo(cx - s, cy + s);
          ctx.stroke();
          ctx.globalAlpha = 1;
        },
      };
    },

    smiley: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const R = Math.min(W, H) * 0.16;
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = "#F2C21B";
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#1A1A1A";
          ctx.beginPath();
          ctx.arc(cx - R * 0.28, cy - R * 0.15, 5, 0, TAU);
          ctx.arc(cx + R * 0.28, cy - R * 0.15, 5, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "#1A1A1A";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy + 4, R * 0.45, 0.2, PI - 0.2);
          ctx.stroke();
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = "#C0392B";
          ctx.beginPath();
          ctx.arc(cx + R * 0.35, cy - R * 0.45, 7, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    chips: falling(
      14,
      (top) => ({
        x: Math.random(),
        y: top ? -0.1 : Math.random(),
        s: 8 + Math.random() * 8,
        v: 0.04 + Math.random() * 0.06,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 2,
        c: rnd(3),
      }),
      (ctx, o, W, H) => {
        const cols = ["#C9A227", "#C0392B", "#2B2B2B"];
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = cols[o.c] || "#C9A227";
        ctx.beginPath();
        ctx.ellipse(0, 0, o.s, o.s * 0.35, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    ),

    headphones: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.48;
          const s = Math.min(W, H) * 0.14;
          ctx.strokeStyle = "#E0453E";
          ctx.lineWidth = 4;
          ctx.globalAlpha = 0.2;
          ctx.beginPath();
          ctx.arc(cx, cy, s, PI, 0);
          ctx.stroke();
          ctx.fillStyle = "#E0453E";
          ctx.fillRect(cx - s - 8, cy - 8, 16, 28);
          ctx.fillRect(cx + s - 8, cy - 8, 16, 28);
          ctx.globalAlpha = 0.1;
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(cx, cy + 20, 20 + i * 12 + Math.sin(t * 4 + i) * 4, 0.2, PI - 0.2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    polaroid: falling(
      8,
      (top) => ({
        x: Math.random(),
        y: top ? -0.18 : Math.random(),
        s: 28 + Math.random() * 16,
        v: 0.03 + Math.random() * 0.04,
        rot: (Math.random() - 0.5) * 0.5,
        vr: (Math.random() - 0.5) * 0.5,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#E8E4D8";
        ctx.fillRect(-o.s / 2, -o.s * 0.6, o.s, o.s * 1.2);
        ctx.fillStyle = "#2B2B2B";
        ctx.fillRect(-o.s / 2 + 4, -o.s * 0.55, o.s - 8, o.s * 0.7);
        ctx.restore();
      },
    ),

    numbers: () => {
      const cells = Array.from({ length: N(28) }, () => ({
        x: Math.random(),
        y: Math.random(),
        n: rnd(10),
        ph: Math.random() * TAU,
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.font = `${Math.min(W, H) * 0.035}px ui-monospace,monospace`;
          ctx.textAlign = "center";
          for (const c of cells) {
            if (Math.sin(t * 2 + c.ph) > 0.85) c.n = rnd(10);
            ctx.globalAlpha = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t + c.ph));
            ctx.fillStyle = "#5B8DEF";
            ctx.fillText(String(c.n), c.x * W, c.y * H);
          }
          ctx.textAlign = "start";
          ctx.globalAlpha = 1;
        },
      };
    },

    potato: falling(
      10,
      (top) => ({
        x: Math.random(),
        y: top ? -0.12 : Math.random(),
        s: 10 + Math.random() * 10,
        v: 0.03 + Math.random() * 0.04,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 1,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#C08A3E";
        ctx.beginPath();
        ctx.ellipse(0, 0, o.s, o.s * 0.7, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    ),

    cointoss: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const y = H * 0.35 + Math.abs(Math.sin(t * 2.2)) * H * 0.25;
          const squash = 0.25 + 0.75 * Math.abs(Math.cos(t * 8));
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#C9A227";
          ctx.beginPath();
          ctx.ellipse(cx, y, 18, 18 * squash, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#2B2B2B";
          ctx.beginPath();
          ctx.ellipse(cx, H * 0.78, 22, 6, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    jaeger: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const base = H * 0.82;
          const s = Math.min(W, H) * 0.12;
          const sway = Math.sin(t * 0.8) * 6;
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#5B8DEF";
          ctx.fillRect(cx - s * 0.35 + sway, base - s * 3.2, s * 0.7, s * 1.6);
          ctx.fillRect(cx - s * 0.9 + sway, base - s * 1.8, s * 0.5, s * 1.8);
          ctx.fillRect(cx + s * 0.4 + sway, base - s * 1.8, s * 0.5, s * 1.8);
          ctx.fillRect(cx - s * 1.3 + sway, base - s * 2.6, s * 0.7, s * 0.25);
          ctx.fillRect(cx + s * 0.6 + sway, base - s * 2.6, s * 0.7, s * 0.25);
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = "#C9A227";
          ctx.fillRect(0, base, W, H);
          ctx.globalAlpha = 1;
        },
      };
    },

    fivenotes: () => {
      const notes = [0, 2, 4, 5, 7];
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.55;
          for (let i = 0; i < 5; i++) {
            const on = Math.floor(t * 1.4) % 5 === i;
            ctx.globalAlpha = on ? 0.28 : 0.08;
            ctx.fillStyle = "#C9A227";
            const x = cx + (i - 2) * 36;
            ctx.beginPath();
            ctx.arc(x, cy - notes[i] * 8, on ? 10 : 7, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    finger: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.55;
          const glow = 0.15 + 0.15 * Math.sin(t * 3);
          const g = ctx.createRadialGradient(cx, cy - 40, 2, cx, cy - 40, 80);
          g.addColorStop(0, `rgba(127,191,106,${glow})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy - 40, 80, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#E0762B";
          ctx.fillRect(cx - 8, cy - 20, 16, 70);
          ctx.beginPath();
          ctx.ellipse(cx, cy - 36, 9, 16, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    dice: falling(
      10,
      (top) => ({
        x: Math.random(),
        y: top ? -0.12 : Math.random(),
        s: 12 + Math.random() * 10,
        v: 0.05 + Math.random() * 0.07,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 3,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#E8E4D8";
        ctx.fillRect(-o.s / 2, -o.s / 2, o.s, o.s);
        ctx.fillStyle = "#1A1A1A";
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, TAU);
        ctx.arc(-o.s * 0.22, -o.s * 0.22, 2, 0, TAU);
        ctx.arc(o.s * 0.22, o.s * 0.22, 2, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    ),

    bamboo: () => {
      const stalks = Array.from({ length: N(12) }, () => ({
        x: Math.random(),
        ph: Math.random() * TAU,
        w: 4 + Math.random() * 5,
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.strokeStyle = "#3FA34D";
          for (const s of stalks) {
            ctx.globalAlpha = 0.12;
            ctx.lineWidth = s.w;
            ctx.beginPath();
            const sway = Math.sin(t * 0.6 + s.ph) * 18;
            ctx.moveTo(s.x * W, H);
            ctx.quadraticCurveTo(s.x * W + sway, H * 0.5, s.x * W + sway * 1.4, H * 0.05);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    tva: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const R = Math.min(W, H) * 0.18;
          ctx.strokeStyle = "#C9A227";
          ctx.globalAlpha = 0.16;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, TAU);
          ctx.stroke();
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * 0.4);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -R * 0.7);
          ctx.stroke();
          ctx.rotate(t * 4.8);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(R * 0.5, 0);
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 1;
        },
      };
    },

    sitcom: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.globalAlpha = 0.06;
          ctx.fillStyle = "#E86FA0";
          for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
          const w = 0.5 + 0.5 * Math.sin(t * 2);
          ctx.globalAlpha = 0.08 * w;
          ctx.fillStyle = "#C9A227";
          ctx.fillRect(W * 0.15, H * 0.2, W * 0.7, H * 0.55);
          ctx.globalAlpha = 1;
        },
      };
    },

    marmalade: falling(
      8,
      (top) => ({
        x: Math.random(),
        y: top ? -0.14 : Math.random(),
        s: 12 + Math.random() * 8,
        v: 0.03 + Math.random() * 0.04,
        rot: (Math.random() - 0.5) * 0.3,
        vr: (Math.random() - 0.5) * 0.8,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#E0762B";
        ctx.fillRect(-o.s * 0.4, -o.s * 0.2, o.s * 0.8, o.s);
        ctx.fillStyle = "#C0392B";
        ctx.fillRect(-o.s * 0.45, -o.s * 0.35, o.s * 0.9, o.s * 0.2);
        ctx.restore();
      },
    ),

    wardrobe: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const open = 0.35 + 0.15 * Math.sin(t * 0.6);
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = "#C08A3E";
          ctx.fillRect(cx - 70, H * 0.2, 140, H * 0.6);
          ctx.fillStyle = "#7EC8F0";
          ctx.globalAlpha = 0.12;
          ctx.fillRect(cx - 50, H * 0.25, 100 * open, H * 0.5);
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = "#C9CDD2";
          for (let i = 0; i < 6; i++) {
            ctx.fillRect(cx - 40 + i * 12, H * 0.28, 8, H * 0.22);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    osorb: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const R = Math.min(W, H) * 0.1 * (1 + 0.06 * Math.sin(t * 2));
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, R * 3);
          g.addColorStop(0, "rgba(232,111,140,.22)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, R * 3, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#E86F8C";
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    crow: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const birds = 5;
          ctx.fillStyle = "#C9CDD2";
          for (let i = 0; i < birds; i++) {
            const x = ((t * 0.08 + i * 0.2) % 1.3) * W;
            const y = H * (0.2 + i * 0.1) + Math.sin(t * 2 + i) * 8;
            const flap = Math.sin(t * 8 + i) * 12;
            ctx.globalAlpha = 0.16;
            ctx.beginPath();
            ctx.moveTo(x - 16, y + flap);
            ctx.lineTo(x, y);
            ctx.lineTo(x + 16, y + flap);
            ctx.strokeStyle = "#C9CDD2";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    faun: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.42;
          ctx.strokeStyle = "#3FA34D";
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.18;
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(cx + side * 10, cy);
            ctx.quadraticCurveTo(cx + side * 40, cy - 50, cx + side * 18, cy - 80);
            ctx.stroke();
          }
          ctx.fillStyle = "#C9A227";
          ctx.beginPath();
          ctx.arc(cx, cy + 20, 22, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    luckycat: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.52;
          const wave = Math.sin(t * 5) * 0.5;
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = "#E8E4D8";
          ctx.beginPath();
          ctx.ellipse(cx, cy, 28, 32, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#E23B3B";
          ctx.beginPath();
          ctx.arc(cx, cy + 8, 8, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "#E8E4D8";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(cx + 20, cy - 4);
          ctx.quadraticCurveTo(cx + 40, cy - 30 + wave * 20, cx + 22, cy - 48);
          ctx.stroke();
          ctx.globalAlpha = 1;
        },
      };
    },

    chef: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.4;
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = "#C9CDD2";
          ctx.fillRect(cx - 22, cy, 44, 10);
          ctx.fillRect(cx - 16, cy - 36, 32, 36);
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = "#C0392B";
          for (let i = 0; i < 8; i++) {
            const x = cx + (i - 4) * 10;
            const h = 20 + Math.sin(t * 6 + i) * 12;
            ctx.fillRect(x, H * 0.72 - h, 6, h);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    nunface: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.46 + Math.sin(t * 0.5) * 4;
          const s = Math.min(W, H) * 0.16;
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#1A1A1A";
          ctx.beginPath();
          ctx.ellipse(cx, cy - s * 0.2, s * 0.9, s * 1.1, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#E8E4D8";
          ctx.beginPath();
          ctx.ellipse(cx, cy + s * 0.1, s * 0.5, s * 0.55, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#1A1A1A";
          ctx.beginPath();
          ctx.ellipse(cx - s * 0.16, cy, s * 0.08, s * 0.05, 0, 0, TAU);
          ctx.ellipse(cx + s * 0.16, cy, s * 0.08, s * 0.05, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    shields: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.fillStyle = "#C0392B";
          for (let i = 0; i < 9; i++) {
            const x = W * (0.12 + (i % 5) * 0.18);
            const y = H * (0.35 + Math.floor(i / 5) * 0.28) + Math.sin(t + i) * 4;
            ctx.globalAlpha = 0.14;
            ctx.beginPath();
            ctx.ellipse(x, y, 28, 34, 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = "#C9A227";
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    rainfree: () => {
      const drops = Array.from({ length: N(50) }, () => ({
        x: Math.random(),
        y: Math.random(),
        v: 0.4 + Math.random() * 0.5,
      }));
      return {
        draw(ctx, W, H, dt) {
          ctx.fillStyle = "#C9CDD2";
          for (const d of drops) {
            d.y += d.v * dt;
            if (d.y > 1.1) {
              d.y = -0.05;
              d.x = Math.random();
            }
            ctx.globalAlpha = 0.12;
            ctx.fillRect(d.x * W, d.y * H, 1.4, 12);
          }
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#3FA34D";
          ctx.fillRect(0, H * 0.78, W, H);
          ctx.globalAlpha = 1;
        },
      };
    },

    hextech: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          for (let i = 0; i < 6; i++) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(t * 0.2 + (i * TAU) / 6);
            ctx.strokeStyle = i % 2 ? "#7C4DFF" : "#C9A227";
            ctx.globalAlpha = 0.12;
            ctx.strokeRect(20, -16, 70, 32);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    cigarette: () => {
      const puffs = Array.from({ length: N(16) }, () => ({
        x: 0.55 + Math.random() * 0.2,
        y: 0.45 + Math.random() * 0.1,
        r: 8 + Math.random() * 18,
        v: 0.03 + Math.random() * 0.04,
      }));
      return {
        draw(ctx, W, H, dt) {
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#C9A227";
          ctx.fillRect(W * 0.38, H * 0.5, 70, 6);
          ctx.fillStyle = "#C0392B";
          ctx.fillRect(W * 0.38 + 70, H * 0.5, 8, 6);
          ctx.fillStyle = "#C9CDD2";
          for (const p of puffs) {
            p.y -= p.v * dt;
            p.x += Math.sin(p.y * 8) * 0.002;
            if (p.y < 0.1) {
              p.y = 0.5;
              p.x = 0.58;
            }
            ctx.globalAlpha = 0.08;
            ctx.beginPath();
            ctx.arc(p.x * W, p.y * H, p.r, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    wakanda: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          const s = Math.min(W, H) * 0.14;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#C9A227";
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.quadraticCurveTo(s * 0.9, -s * 0.2, s * 0.6, s * 0.7);
          ctx.lineTo(0, s * 0.25);
          ctx.lineTo(-s * 0.6, s * 0.7);
          ctx.quadraticCurveTo(-s * 0.9, -s * 0.2, 0, -s);
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 0.08;
          for (let i = 0; i < 12; i++) {
            const a = t * 0.3 + (i / 12) * TAU;
            ctx.fillStyle = "#7C1F2B";
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * s * 2, cy + Math.sin(a) * s * 1.4, 3, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    plusultra: () => {
      const sparks = Array.from({ length: N(20) }, () => ({
        a: Math.random() * TAU,
        r: Math.random(),
        v: 0.2 + Math.random() * 0.3,
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          ctx.strokeStyle = "#2E6FD6";
          for (const s of sparks) {
            s.r += s.v * dt;
            if (s.r > 1) s.r = 0;
            ctx.globalAlpha = 0.16 * (1 - s.r);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(s.a) * s.r * 180, cy + Math.sin(s.a) * s.r * 180);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    gridface: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.48;
          ctx.strokeStyle = "#5BC0EB";
          ctx.globalAlpha = 0.12;
          for (let i = -4; i <= 4; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * 16, cy - 50);
            ctx.lineTo(cx + i * 16, cy + 50);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - 50, cy + i * 16);
            ctx.lineTo(cx + 50, cy + i * 16);
            ctx.stroke();
          }
          ctx.globalAlpha = 0.16;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 40, 52, 0, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        },
      };
    },

    thumbs: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#5B8DEF";
          ctx.fillRect(cx - 18, cy - 8, 36, 28);
          ctx.fillRect(cx + 10, cy - 28, 12, 24);
          ctx.globalAlpha = 0.1;
          ctx.font = `${Math.min(W, H) * 0.04}px ui-monospace,monospace`;
          ctx.fillText("it's complicated", cx - 70, cy + 60);
          ctx.globalAlpha = 1;
        },
      };
    },

    copacabana: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.strokeStyle = "#C9A227";
          ctx.globalAlpha = 0.1;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 8) {
            const y = H * 0.7 + Math.sin(x * 0.04 + t) * 10;
            x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#2B2B2B";
          for (let i = 0; i < 8; i++) {
            ctx.fillRect(W * 0.1 + i * 40, H * 0.3, 8, H * 0.35);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    mountain: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = "#E0453E";
          ctx.beginPath();
          ctx.moveTo(W * 0.2, H * 0.8);
          ctx.lineTo(W * 0.5, H * 0.25 + Math.sin(t) * 6);
          ctx.lineTo(W * 0.8, H * 0.8);
          ctx.fill();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#F2C21B";
          ctx.beginPath();
          ctx.arc(W * 0.5, H * 0.28, 8, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    birdcage: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.48;
          ctx.strokeStyle = "#C9A227";
          ctx.globalAlpha = 0.16;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 40, 55, 0, 0, TAU);
          ctx.stroke();
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * 12, cy - 50);
            ctx.lineTo(cx + i * 12, cy + 50);
            ctx.stroke();
          }
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = "#C9CDD2";
          ctx.beginPath();
          ctx.ellipse(cx + Math.sin(t * 2) * 8, cy, 8, 5, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    passports: falling(
      8,
      (top) => ({
        x: Math.random(),
        y: top ? -0.14 : Math.random(),
        s: 18 + Math.random() * 10,
        v: 0.04 + Math.random() * 0.05,
        rot: (Math.random() - 0.5) * 0.4,
        vr: (Math.random() - 0.5) * 0.8,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#1F3A5C";
        ctx.fillRect(-o.s * 0.4, -o.s * 0.55, o.s * 0.8, o.s * 1.1);
        ctx.fillStyle = "#C9A227";
        ctx.fillRect(-o.s * 0.15, -o.s * 0.2, o.s * 0.3, o.s * 0.3);
        ctx.restore();
      },
    ),

    camcorder: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.globalAlpha = 0.08;
          ctx.strokeStyle = "#C0392B";
          ctx.strokeRect(W * 0.12, H * 0.12, W * 0.76, H * 0.76);
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#C0392B";
          ctx.beginPath();
          ctx.arc(W * 0.18, H * 0.18, 6, 0, TAU);
          ctx.fill();
          ctx.font = `${Math.min(W, H) * 0.03}px ui-monospace,monospace`;
          ctx.fillText("REC", W * 0.22, H * 0.2);
          const rec = Math.sin(t * 6) > 0;
          ctx.globalAlpha = rec ? 0.25 : 0.05;
          ctx.beginPath();
          ctx.arc(W * 0.16, H * 0.18, 4, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    nos: () => {
      const streaks = Array.from({ length: N(16) }, () => ({
        y: Math.random(),
        x: Math.random(),
        v: 0.4 + Math.random() * 0.5,
        w: 30 + Math.random() * 80,
      }));
      return {
        draw(ctx, W, H, dt) {
          ctx.strokeStyle = "#E23B3B";
          for (const s of streaks) {
            s.x -= s.v * dt;
            if (s.x < -0.2) {
              s.x = 1.2;
              s.y = Math.random();
            }
            ctx.globalAlpha = 0.12;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(s.x * W, s.y * H);
            ctx.lineTo(s.x * W + s.w, s.y * H);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    littleboats: () => {
      const boats = Array.from({ length: N(8) }, () => ({
        x: Math.random(),
        y: 0.62 + Math.random() * 0.2,
        s: 10 + Math.random() * 10,
        v: 0.02 + Math.random() * 0.03,
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#7A8B99";
          ctx.fillRect(0, H * 0.6, W, H);
          ctx.fillStyle = "#C9CDD2";
          for (const b of boats) {
            b.x += b.v * dt;
            if (b.x > 1.1) b.x = -0.1;
            const y = b.y * H + Math.sin(t * 1.5 + b.x * 8) * 3;
            ctx.globalAlpha = 0.16;
            ctx.beginPath();
            ctx.moveTo(b.x * W - b.s, y);
            ctx.lineTo(b.x * W + b.s, y);
            ctx.lineTo(b.x * W + b.s * 0.6, y + 8);
            ctx.lineTo(b.x * W - b.s * 0.6, y + 8);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    erasure: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.fillStyle = "#7EC8F0";
          for (let i = 0; i < 20; i++) {
            const x = ((i * 0.08 + t * 0.05) % 1) * W;
            ctx.globalAlpha = 0.08;
            ctx.fillRect(x, 0, 18, H);
          }
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = "#E86F8C";
          ctx.beginPath();
          ctx.arc(W * 0.5, H * 0.5, 20 + Math.sin(t) * 4, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    train: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const y = H * 0.55;
          ctx.globalAlpha = 0.12;
          ctx.strokeStyle = "#7EC8F0";
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
          ctx.fillStyle = "#C9CDD2";
          const off = (t * 40) % 80;
          for (let i = -1; i < 12; i++) {
            ctx.globalAlpha = 0.14;
            ctx.fillRect(i * 80 + off, y - 28, 60, 28);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    handheld: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const shake = Math.sin(t * 18) * 3;
          ctx.save();
          ctx.translate(shake, Math.cos(t * 14) * 2);
          ctx.globalAlpha = 0.1;
          ctx.strokeStyle = "#C9CDD2";
          ctx.strokeRect(W * 0.1, H * 0.1, W * 0.8, H * 0.8);
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#C0392B";
          ctx.font = `${Math.min(W, H) * 0.04}px ui-monospace,monospace`;
          ctx.fillText("REC 00:14", W * 0.14, H * 0.18);
          ctx.restore();
          ctx.globalAlpha = 1;
        },
      };
    },

    omaha: () => {
      const bits = Array.from({ length: N(24) }, () => ({
        x: Math.random(),
        y: 0.4 + Math.random() * 0.5,
        r: 4 + Math.random() * 10,
        v: 0.02 + Math.random() * 0.04,
      }));
      return {
        draw(ctx, W, H, dt) {
          ctx.fillStyle = "#6B7A4F";
          for (const b of bits) {
            b.y -= b.v * dt;
            if (b.y < 0.3) {
              b.y = 1;
              b.x = Math.random();
            }
            ctx.globalAlpha = 0.1;
            ctx.beginPath();
            ctx.arc(b.x * W, b.y * H, b.r, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#8C1C2B";
          ctx.fillRect(0, H * 0.72, W, H);
          ctx.globalAlpha = 1;
        },
      };
    },

    milkshake: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          ctx.globalAlpha = 0.16;
          ctx.strokeStyle = "#C9A227";
          ctx.lineWidth = 3;
          ctx.strokeRect(cx - 16, cy - 30, 32, 70);
          ctx.fillStyle = "#C0392B";
          ctx.globalAlpha = 0.14;
          ctx.fillRect(cx - 14, cy - 10, 28, 48);
          ctx.strokeStyle = "#C9CDD2";
          ctx.beginPath();
          ctx.moveTo(cx + 8, cy - 28);
          ctx.lineTo(cx + 8, cy - 70 + Math.sin(t * 2) * 4);
          ctx.stroke();
          ctx.globalAlpha = 1;
        },
      };
    },

    woad: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.48;
          ctx.strokeStyle = "#6B8E5A";
          ctx.globalAlpha = 0.16;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx - 30, cy - 20);
          ctx.lineTo(cx + 30, cy + 20);
          ctx.moveTo(cx + 30, cy - 20);
          ctx.lineTo(cx - 30, cy + 20);
          ctx.moveTo(cx, cy - 36);
          ctx.lineTo(cx, cy + 36);
          ctx.stroke();
          ctx.globalAlpha = 1;
        },
      };
    },

    redroom: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.globalAlpha = 0.1 + 0.04 * Math.sin(t * 2);
          ctx.fillStyle = "#E23B3B";
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 0.12;
          ctx.strokeStyle = "#C9CDD2";
          for (let i = 0; i < 6; i++) {
            ctx.strokeRect(W * 0.15 + i * 8, H * 0.2, W * 0.7 - i * 16, H * 0.6);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    personalities: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const n = 1 + Math.floor((0.5 + 0.5 * Math.sin(t * 0.8)) * 5);
          ctx.strokeStyle = "#C9CDD2";
          for (let i = 0; i < n; i++) {
            ctx.globalAlpha = 0.1;
            ctx.beginPath();
            ctx.ellipse(W * 0.5 + i * 8, H * 0.48, 40, 52, 0, 0, TAU);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    precog: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.strokeStyle = "#5B8DEF";
          ctx.globalAlpha = 0.12;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(W * (0.3 + i * 0.2), H * 0.5, 28 + Math.sin(t * 2 + i) * 6, 0, TAU);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    greekisles: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = "#2E9BD6";
          ctx.fillRect(0, H * 0.55, W, H);
          ctx.fillStyle = "#F2C21B";
          ctx.globalAlpha = 0.14;
          ctx.beginPath();
          ctx.arc(W * 0.78, H * 0.22, 24, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#EFEFEF";
          ctx.globalAlpha = 0.12;
          for (let i = 0; i < 5; i++) {
            ctx.fillRect(W * 0.2 + i * 30, H * 0.42, 18, H * 0.14);
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    fan: falling(
      10,
      (top) => ({
        x: Math.random(),
        y: top ? -0.12 : Math.random(),
        s: 16 + Math.random() * 12,
        v: 0.03 + Math.random() * 0.04,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 1.2,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#E86FA0";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, o.s, -0.6, 0.6);
        ctx.fill();
        ctx.restore();
      },
    ),

    standingstone: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          ctx.fillStyle = "#6B8E5A";
          ctx.globalAlpha = 0.16;
          ctx.fillRect(W * 0.42, H * 0.28, 18, H * 0.45);
          ctx.fillRect(W * 0.55, H * 0.34, 16, H * 0.4);
          ctx.globalAlpha = 0.1 + 0.08 * Math.sin(t * 2);
          ctx.fillStyle = "#C9A227";
          ctx.beginPath();
          ctx.arc(W * 0.5, H * 0.32, 10, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    plate: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.5;
          ctx.strokeStyle = "#C9CDD2";
          ctx.globalAlpha = 0.16;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 70, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, 52, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = "#C0392B";
          ctx.beginPath();
          ctx.arc(cx, cy, 8 + Math.sin(t) * 2, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    splitface: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.48;
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#E86FA0";
          ctx.beginPath();
          ctx.ellipse(cx - 8, cy, 36, 48, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#C9CDD2";
          ctx.beginPath();
          ctx.ellipse(cx + 8, cy, 36, 48, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = "#2B2B2B";
          ctx.fillRect(cx - 1, cy - 50, 2, 100);
          ctx.globalAlpha = 1;
        },
      };
    },

    papal: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = t % 6 < 3 ? "#EFEFEF" : "#C0392B";
          ctx.beginPath();
          ctx.ellipse(cx, H * 0.35, 40 + Math.sin(t) * 6, 18, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#C9CDD2";
          ctx.globalAlpha = 0.08;
          ctx.beginPath();
          ctx.ellipse(cx, H * 0.28, 28, 12, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      };
    },

    jazzsouls: () => {
      const orbs = Array.from({ length: N(16) }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: 4 + Math.random() * 10,
        ph: Math.random() * TAU,
      }));
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          for (const o of orbs) {
            ctx.globalAlpha = 0.1 + 0.08 * Math.sin(t * 2 + o.ph);
            ctx.fillStyle = "#7EC8F0";
            ctx.beginPath();
            ctx.arc(
              o.x * W,
              o.y * H + Math.sin(t + o.ph) * 8,
              o.r,
              0,
              TAU,
            );
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    toque: () => {
      let t = 0;
      return {
        draw(ctx, W, H, dt) {
          t += dt;
          const cx = W * 0.5;
          const cy = H * 0.42;
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = "#EFEFEF";
          ctx.fillRect(cx - 24, cy, 48, 12);
          ctx.beginPath();
          ctx.ellipse(cx, cy - 28, 22, 28, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = "#C08A3E";
          ctx.fillRect(cx - 40, H * 0.7, 80, 8);
          ctx.globalAlpha = 1;
        },
      };
    },

    shell: falling(
      10,
      (top) => ({
        x: Math.random(),
        y: top ? -0.1 : Math.random(),
        s: 8 + Math.random() * 10,
        v: 0.03 + Math.random() * 0.04,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 1,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#E86FA0";
        ctx.beginPath();
        ctx.ellipse(0, 0, o.s, o.s * 0.7, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    ),

    tickets: falling(
      10,
      (top) => ({
        x: Math.random(),
        y: top ? -0.12 : Math.random(),
        s: 22 + Math.random() * 10,
        v: 0.04 + Math.random() * 0.05,
        rot: (Math.random() - 0.5) * 0.5,
        vr: (Math.random() - 0.5) * 1,
      }),
      (ctx, o, W, H) => {
        ctx.save();
        ctx.translate(o.x * W, o.y * H);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#5B8DEF";
        ctx.fillRect(-o.s / 2, -o.s * 0.22, o.s, o.s * 0.44);
        ctx.restore();
      },
    ),
  };

  Object.assign(NEW_SCENES, ICONIC);

  const REMAP = {
    itfilm: "redballoon", shining: "redrum", batman: "batsignal", starwars: "lightsaber",
    ring: "onering", bttf: "flux", bond: "gunbarrel", ironman: "arcreactor", terminator: "redeye",
    pokemon: "pokeball", onepiece: "strawhat", deathnote: "deathpages", stranger: "alphabet",
    breakingbad: "formula", pulpfiction: "briefcase", godfather: "oranges", killbill: "katana",
    titanic: "iceberg", got: "ironthrone", hunger: "mockingjay", indiana: "whipcrack",
    jurassic: "amber", interstellar: "tesseract", dune: "wormsign", wick: "goldcoin",
    ghibli: "soot", insideout: "memoryorbs", monsters: "slidingdoors", charlie: "goldenticket",
    up: "houseup", lalaland: "pianokeys", shutterisland: "lighthouse", arrival: "logograms",
    avengers: "infinitystones", spider: "web", iceage: "acorn", schindler: "girlred",
    scream: "ghostface", alien: "xenomorph", predator: "thermal", tron: "lightcycle",
    naruto: "rasengan", titan: "walls", dragonball: "dragonballs", demonslayer: "nichirin",
    pirates: "jollyroger", walle: "plantboot", lionking: "priderock", homealone: "tripwire",
    gladiator: "colosseum", westworld: "maze", gravity: "debris", marypoppins: "umbrella",
    wizardofoz: "rubyslipper", percyjackson: "trident", fightclub: "soap", zodiac: "cipher",
    grandbudapest: "pastry", notebook: "letters", guardians: "walkman", blade: "origami",
    madmax: "warrig", hangover: "vegas", rocky: "boxing",
    jaws: "sharkfin", halloween: "myers", squidgame: "squidshapes", silence: "moth",
    vforvendetta: "fawkes", mario: "pipes", sonic: "goldrings", minecraft: "voxels",
    lastofus: "spores", fallout: "vault", jordanpeele: "teacup", getout2: "teacup",
    midsommar: "maypole", barbie: "pinkbox", barbie2: "pinkbox", deadpool: "dualblades",
    friends: "perk", toystory: "cowboyhat", godzilla: "plates", topgun: "jets",
    drive: "scorpion", parasite: "stairs", se7en: "boxes", saw: "spiral",
    thing: "assimilation", fargo: "chipper", doctorstrange: "mirrors", tenet: "inverted",
    whiplash: "sticks", blackmirror: "screens", oppenheimer: "flash", yourname: "comet",
    peaky: "razorcap", wednesday: "cello", akira: "kaneda", evangelion: "evacross",
    transformers: "autobot", robocop: "visor", jujutsu: "domain", moana: "heartstone",
    frozen: "snowflake", nope: "saucer", everything: "bagel", paddington: "marmalade",
    narnia: "wardrobe", her: "osorb", thecrow: "crow", panlabyrinth: "faun",
    bullettrain: "luckycat", thebear: "chef", nun: "nunface", threehundred: "shields",
    shawshank: "rainfree", arcane: "hextech", bebop: "cigarette", blackpanther: "wakanda",
    memento: "polaroid", wandavision: "sitcom", loki: "tva", severance: "numbers",
    martian: "potato", noCountry: "cointoss", pacificrim: "jaeger", closeencounters: "fivenotes",
    et: "finger", jumanji: "dice", crouchingtiger: "bamboo", captainamerica: "shieldcap",
    xmen: "xlogo", watchmen: "smiley", oceans: "chips", babydriver: "headphones",
    myhero: "plusultra", exmachina: "gridface", socialnetwork: "thumbs", goodfellas: "copacabana",
    scarface: "mountain", prestige: "birdcage", prestige2: "birdcage", bourne: "passports",
    nightcrawler: "camcorder", fast: "nos", dunkirk: "littleboats", eternalsunshine: "erasure",
    snowpiercer: "train", cloverfield: "handheld", privateryan: "omaha", therewillbeblood: "milkshake",
    braveheart: "woad", blackwidow: "redroom", split: "personalities", minority: "precog",
    mammamia: "greekisles", bridgerton: "fan", outlander: "standingstone", kingsman: "umbrella",
    fightclub: "soap", frozen: "snowflake"
  };

  const EXTRA = [
    { key: "inceptionf", name: "Начало", re: /inception|начало нолана/, accent: "#E9B487", accent2: "#C98A5E", bg: "#0A0A0C", fx: "inception" },
    { key: "oppenheimer", name: "Оппенгеймер", re: /oppenheimer|оппенгеймер/, accent: "#E0762B", accent2: "#C9CDD2", bg: "#0C0A08", fx: "flash" },
    { key: "barbie", name: "Барби", re: /^barbie$|^барби$/, accent: "#E86FA0", accent2: "#7EC8F0", bg: "#140A12", fx: "pinkbox" },
    { key: "topgun", name: "Топ Ган", re: /top gun|топ ган/, accent: "#5B8DEF", accent2: "#E23B3B", bg: "#060A14", fx: "jets" },
    { key: "et", name: "Инопланетянин", re: /инопланетянин|extra terrestrial/, accent: "#E0762B", accent2: "#7FBF6A", bg: "#0A0C10", fx: "finger" },
    { key: "jaws", name: "Челюсти", re: /^jaws$|^челюсти$/, accent: "#1B6CA8", accent2: "#C0392B", bg: "#041018", fx: "sharkfin" },
    { key: "parasite", name: "Паразиты", re: /parasite|паразиты/, accent: "#C9A227", accent2: "#2B2B2B", bg: "#0A0A08", fx: "stairs" },
    { key: "yourname", name: "Твоё имя", re: /your name|твоё имя|kimi no na wa/, accent: "#7EC8F0", accent2: "#E86FA0", bg: "#081018", fx: "comet" },
    { key: "lastofus", name: "Одни из нас", re: /last of us|одни из нас/, accent: "#6B8E5A", accent2: "#C08A3E", bg: "#0A0C08", fx: "spores" },
    { key: "squidgame", name: "Игра в кальмара", re: /squid game|игра в кальмара/, accent: "#E86FA0", accent2: "#3FA34D", bg: "#140A10", fx: "squidshapes" },
    { key: "wednesday", name: "Уэнсдей", re: /wednesday|уэнсдей/, accent: "#C9CDD2", accent2: "#2B2B2B", bg: "#08080A", fx: "cello" },
    { key: "peaky", name: "Острые козырьки", re: /peaky blinders|острые козырьки/, accent: "#C9A227", accent2: "#8C1C2B", bg: "#0A0806", fx: "razorcap" },
    { key: "severance", name: "Разделение", re: /severance|разделение/, accent: "#5B8DEF", accent2: "#C9CDD2", bg: "#06080E", fx: "numbers" },
    { key: "shogun", name: "Сёгун", re: /shogun|сёгун/, accent: "#C0392B", accent2: "#C9A227", bg: "#0A0806", fx: "katana" },
    { key: "everything", name: "Всё везде и сразу", re: /everything everywhere|всё везде/, accent: "#E86FA0", accent2: "#F2C21B", bg: "#120A10", fx: "bagel" },
    { key: "tenet", name: "Довод", re: /^tenet$|^довод$/, accent: "#C9CDD2", accent2: "#5B8DEF", bg: "#06080C", fx: "inverted" },
    { key: "whiplash", name: "Одержимость", re: /whiplash|одержимость/, accent: "#C0392B", accent2: "#C9A227", bg: "#0A0808", fx: "sticks" },
    { key: "drive", name: "Драйв", re: /^drive$|^драйв$/, accent: "#E86FA0", accent2: "#5B8DEF", bg: "#0A0810", fx: "scorpion" },
    { key: "arcane", name: "Аркейн", re: /arcane|аркейн/, accent: "#7C4DFF", accent2: "#C9A227", bg: "#0A0812", fx: "hextech" },
    { key: "theboys", name: "Пацаны", re: /the boys|пацаны/, accent: "#E23B3B", accent2: "#2B2B2B", bg: "#0A0708", fx: "comic" },
    { key: "coco", name: "Тайна Коко", re: /тайна коко|^coco$|^коко$/, accent: "#E0762B", accent2: "#C9A227", bg: "#140A08", fx: "marigolds" },
    { key: "encanto", name: "Энканто", re: /encanto|энканто/, accent: "#E86FA0", accent2: "#3FA34D", bg: "#120A10", fx: "casita" },
    { key: "soul", name: "Душа", re: /^soul$|^душа$/, accent: "#7EC8F0", accent2: "#C9A227", bg: "#081018", fx: "jazzsouls" },
    { key: "ratatouille", name: "Рататуй", re: /ratatouille|рататуй/, accent: "#C08A3E", accent2: "#3FA34D", bg: "#0A1008", fx: "toque" },
    { key: "nbc", name: "Кошмар перед Рождеством", re: /nightmare before christmas|кошмар перед рождеством/, accent: "#C9A227", accent2: "#C9CDD2", bg: "#0A0A0C", fx: "jackmoon" },
    { key: "coraline", name: "Коралина", re: /coraline|коралина/, accent: "#C9A227", accent2: "#2B2B2B", bg: "#0A0A08", fx: "buttons" },
    { key: "beetlejuice", name: "Битлджус", re: /beetlejuice|битлджус/, accent: "#F2C21B", accent2: "#2B2B2B", bg: "#0A0A08", fx: "stripes" },
    { key: "aladdin", name: "Аладдин", re: /aladdin|аладдин/, accent: "#C9A227", accent2: "#5B8DEF", bg: "#0A0C14", fx: "lamp" },
    { key: "mermaid", name: "Русалочка", re: /little mermaid|русалочка/, accent: "#E86FA0", accent2: "#1CA9C9", bg: "#04121A", fx: "shell" },
    { key: "beauty", name: "Красавица и чудовище", re: /beauty and the beast|красавица и чудовище/, accent: "#C9A227", accent2: "#C0392B", bg: "#0A0A08", fx: "rose" },
    { key: "wolf", name: "Волк с Уолл-стрит", re: /wolf of wall street|волк с уолл/, accent: "#3FA34D", accent2: "#C9A227", bg: "#0A0A08", fx: "money" },
    { key: "catchme", name: "Поймай меня, если сможешь", re: /catch me if you can|поймай меня/, accent: "#5B8DEF", accent2: "#C9A227", bg: "#0A0C14", fx: "tickets" },
    { key: "themenu", name: "Меню", re: /the menu|^меню$/, accent: "#C9CDD2", accent2: "#C0392B", bg: "#0A0A08", fx: "plate" },
    { key: "substance", name: "Субстанция", re: /the substance|субстанция/, accent: "#E86FA0", accent2: "#C9CDD2", bg: "#12080C", fx: "splitface" },
    { key: "conclave", name: "Конклав", re: /conclave|конклав/, accent: "#C9CDD2", accent2: "#C0392B", bg: "#0A0A08", fx: "papal" }
  ];

  const boot = () => {
    const API = window.CapsuleModAPI;
    if (!API || !API.SCENES || !API.FILM_THEMES) { setTimeout(boot, 280); return; }
    Object.assign(API.SCENES, NEW_SCENES);
    API.FILM_THEMES.forEach((f) => { if (REMAP[f.key]) f.fx = REMAP[f.key]; });
    EXTRA.forEach((t) => {
      if (!API.FILM_THEMES.some((x) => x.key === t.key)) API.FILM_THEMES.push(t);
    });
    try { console.log("[Капсула] v21 аддон: сцен +" + Object.keys(NEW_SCENES).length + ", палитр " + API.FILM_THEMES.length); } catch (e) {}
  };
  boot();
})();
