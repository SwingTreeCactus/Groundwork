/* RV app: garden characters (v2.16). The potted plants, their care poses, eyes and motion, and the
   growth moment. Art and CSS ported from the "Groundwork garden insights" canvas (boards: Characters,
   Characters in lists, Growing up). viewBox 0 0 60 92 per plant, pot at the bottom. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  // ---------- art ----------
  // Seed and sprout have no lush parts: Potential and Initial Call top out at Healthy.
  const SEED = '<ellipse cx="30" cy="63" rx="5.5" ry="6.5" fill="currentColor"/>' +
    '<path class="fall" d="M27 58 L31 62 L28 67" stroke="var(--pl-pot)" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<path class="g3" d="M30 56.5 C30 54 31 52.5 32.5 51.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
    '<path class="g4" d="M32.5 51.5 C33.5 48 35 46.5 37 46" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  const SPROUT = '<path d="M30 70 V46" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
    '<path d="M30 60 C23 60 19 56 19 50 C25 50 30 54 30 60Z" fill="currentColor"/>' +
    '<path class="nb1" d="M30 55 C37 55 41 51 41 45 C35 45 30 49 30 55Z" fill="currentColor"/>' +
    '<path class="g4" d="M30 50 C24 50 21 47 21 42 C26 42 30 45 30 50Z" fill="currentColor"/>';
  const LEAFY = '<path d="M30 70 V26" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
    '<path d="M30 66 C22 66 18 61 18 55 C25 55 30 59 30 66Z" fill="currentColor"/>' +
    '<path class="nb1" d="M30 62 C38 62 42 57 42 51 C35 51 30 55 30 62Z" fill="currentColor"/>' +
    '<path class="g3" d="M30 54 C22 54 18 49 18 43 C25 43 30 47 30 54Z" fill="currentColor"/>' +
    '<path class="g3" d="M30 50 C38 50 42 45 42 39 C35 39 30 43 30 50Z" fill="currentColor"/>' +
    '<path class="g4" d="M30 42 C23 42 20 38 20 33 C26 33 30 36 30 42Z" fill="currentColor"/>' +
    '<path class="g4" d="M30 38 C37 38 40 34 40 29 C34 29 30 32 30 38Z" fill="currentColor"/>' +
    '<path class="g5" d="M30 30 C26 30 23 27 23 23 C27 23 30 25 30 30Z" fill="currentColor"/>' +
    '<path class="g5" d="M30 28 C34 28 37 25 37 21 C33 21 30 23 30 28Z" fill="currentColor"/>';
  const SHRUB = '<path d="M30 70 V20" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" fill="none"/>' +
    '<path class="g3" d="M30 46 L19 36 M30 40 L42 30" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
    '<path d="M30 64 C22 64 18 59 18 53 C25 53 30 57 30 64Z" fill="currentColor"/>' +
    '<path class="nb1" d="M30 60 C38 60 42 55 42 49 C35 49 30 53 30 60Z" fill="currentColor"/>' +
    '<path class="g3" d="M30 54 C23 54 20 50 20 45 C26 45 30 48 30 54Z" fill="currentColor"/>' +
    '<path class="g4" d="M30 34 C37 34 40 30 40 25 C34 25 30 28 30 34Z" fill="currentColor"/>' +
    '<path class="lt4" d="M30 7 C35 11 35 17 30 21 C25 17 25 11 30 7Z" fill="currentColor"/>' +
    '<g class="g4"><circle cx="30" cy="7" r="5" fill="currentColor" opacity=".55"/><circle cx="36" cy="11.5" r="5" fill="currentColor" opacity=".55"/><circle cx="34" cy="18" r="5" fill="currentColor" opacity=".55"/><circle cx="26" cy="18" r="5" fill="currentColor" opacity=".55"/><circle cx="24" cy="11.5" r="5" fill="currentColor" opacity=".55"/><circle cx="30" cy="13" r="3.6" fill="currentColor"/></g>' +
    '<g class="g5"><circle cx="17" cy="34" r="4" fill="currentColor" opacity=".55"/><circle cx="17" cy="34" r="1.8" fill="currentColor"/><circle cx="44" cy="28" r="4" fill="currentColor" opacity=".55"/><circle cx="44" cy="28" r="1.8" fill="currentColor"/></g>' +
    // one small fruit bud per study session logged (up to three)
    '<circle class="bud b1" cx="21" cy="47" r="2.4" fill="currentColor"/><circle class="bud b2" cx="40" cy="42" r="2.4" fill="currentColor"/><circle class="bud b3" cx="25" cy="27" r="2.4" fill="currentColor"/>';
  const TREE = '<path d="M30 70 V38" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" fill="none"/>' +
    '<path d="M30 50 L18 38 M30 45 L43 34 M30 40 L30 26" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
    '<circle class="nb1" cx="30" cy="30" r="10" fill="currentColor" opacity=".35"/>' +
    '<circle class="g3" cx="19" cy="37" r="9" fill="currentColor" opacity=".35"/><circle class="g3" cx="41" cy="34" r="9" fill="currentColor" opacity=".35"/>' +
    '<circle class="g4" cx="23" cy="23" r="9" fill="currentColor" opacity=".35"/><circle class="g4" cx="37" cy="22" r="9" fill="currentColor" opacity=".35"/>' +
    '<circle class="g5" cx="30" cy="14" r="10" fill="currentColor" opacity=".35"/><circle class="g5" cx="11" cy="29" r="7" fill="currentColor" opacity=".35"/><circle class="g5" cx="49" cy="27" r="7" fill="currentColor" opacity=".35"/>' +
    '<circle class="g3" cx="27" cy="33" r="2.8" fill="currentColor"/><circle class="g3" cx="40" cy="37" r="2.8" fill="currentColor"/>' +
    '<circle class="g4" cx="19" cy="40" r="2.8" fill="currentColor"/><circle class="g4" cx="34" cy="24" r="2.8" fill="currentColor"/><circle class="g4" cx="44" cy="30" r="2.8" fill="currentColor"/>' +
    '<circle class="g5" cx="28" cy="16" r="2.8" fill="currentColor"/><circle class="g5" cx="13" cy="30" r="2.8" fill="currentColor"/><circle class="g5" cx="48" cy="25" r="2.8" fill="currentColor"/><circle class="g5" cx="22" cy="24" r="2.8" fill="currentColor"/>';
  const FORMS = { 1: SEED, 2: SPROUT, 3: LEAFY, 4: SHRUB, 5: TREE };
  // dropped leaves under wilting plants
  const FALLEN = {
    1: '',
    2: '<ellipse class="fall2" cx="6" cy="89.5" rx="3.5" ry="1.5" fill="currentColor" opacity=".7"/>',
    3: '<ellipse class="fall2" cx="6" cy="89.5" rx="3.5" ry="1.5" fill="currentColor" opacity=".7"/><ellipse class="fall" cx="54" cy="89.5" rx="3.5" ry="1.5" fill="currentColor" opacity=".7"/>',
    4: '<ellipse class="fall2" cx="6" cy="89.5" rx="3.5" ry="1.5" fill="currentColor" opacity=".7"/><ellipse class="fall" cx="54" cy="89.5" rx="3.5" ry="1.5" fill="currentColor" opacity=".7"/>',
    5: '<ellipse class="fall2" cx="5" cy="89.5" rx="3.5" ry="1.5" fill="currentColor" opacity=".7"/><ellipse class="fall" cx="55" cy="89.5" rx="3.5" ry="1.5" fill="currentColor" opacity=".7"/><ellipse class="fall" cx="9" cy="90.5" rx="3" ry="1.3" fill="currentColor" opacity=".7"/>',
  };
  const plantSvg = (form) => '<svg class="plant-svg" aria-hidden="true" viewBox="0 0 60 92">' + FALLEN[form] +
    '<g class="lean"><g class="body"><g class="sway">' + FORMS[form] + '</g></g></g></svg>';
  // The pot is the character: two dot eyes by care, a water-drop bubble when thirsty, shimmer when lush.
  // small = list/tile geometry (bigger eyes and bubble so they read at row size), else the large one.
  function potSvg(small) {
    const r = small ? 2.7 : 2.3, sw = small ? 2.1 : 1.8;
    const eyes = small
      ? '<g class="e-happy" stroke-width="2.1"><path d="M22.4 82.2 Q25 78 27.6 82.2"/><path d="M32.4 82.2 Q35 78 37.6 82.2"/></g>' +
        '<g class="e-drowsy"><path d="M22.3 81 A2.7 2.7 0 0 0 27.7 81 Z"/><path d="M32.3 81 A2.7 2.7 0 0 0 37.7 81 Z"/></g>' +
        '<g class="e-sleep" stroke-width="1.9"><path d="M22.8 81.5 H27.2"/><path d="M32.8 81.5 H37.2"/></g>'
      : '<g class="e-happy" stroke-width="' + sw + '"><path d="M22.6 82 Q25 78.4 27.4 82"/><path d="M32.6 82 Q35 78.4 37.4 82"/></g>' +
        '<g class="e-drowsy"><path d="M22.7 81 A2.3 2.3 0 0 0 27.3 81 Z"/><path d="M32.7 81 A2.3 2.3 0 0 0 37.3 81 Z"/></g>' +
        '<g class="e-sleep" stroke-width="1.6"><path d="M23 81.5 H27"/><path d="M33 81.5 H37"/></g>';
    const need = small
      ? '<g class="need"><circle cx="50" cy="9" r="9" class="acc"/><path d="M44 14 L39.5 20 L47.5 16 Z" class="acc"/><path d="M50 3.6 C52.9 7.4 53.9 9.3 53.9 11 a3.9 3.9 0 0 1 -7.8 0 C46.1 9.3 47.1 7.4 50 3.6Z" class="acc-ic"/></g>'
      : '<g class="need"><circle cx="50" cy="9" r="8" class="acc"/><path d="M44.5 13.5 L40.5 19 L47.5 15.5 Z" class="acc"/><path d="M50 4.2 C52.6 7.6 53.5 9.3 53.5 10.8 a3.5 3.5 0 0 1 -7 0 C46.5 9.3 47.4 7.6 50 4.2Z" class="acc-ic"/></g>';
    return '<svg class="pot-svg" aria-hidden="true" viewBox="0 0 60 92">' +
      (small ? '' : '<ellipse cx="30" cy="91" rx="17" ry="1.6" class="shadow"/>') +
      '<rect x="11" y="68" width="38" height="6" rx="3" class="rim"/><path d="M14 74 H46 L43 90 H17 Z" class="pot"/>' +
      '<g class="face"><g class="e-open"><circle cx="25" cy="81" r="' + r + '"/><circle cx="35" cy="81" r="' + r + '"/>' +
      '<g class="e-shine"><circle cx="' + (small ? 25.9 : 25.8) + '" cy="' + (small ? 80.1 : 80.2) + '" r="' + (small ? 0.9 : 0.8) + '"/><circle cx="' + (small ? 35.9 : 35.8) + '" cy="' + (small ? 80.1 : 80.2) + '" r="' + (small ? 0.9 : 0.8) + '"/></g></g>' +
      eyes + '</g>' + need +
      '<g class="spark"><circle cx="7" cy="34" r="1.5"/><circle cx="53" cy="44" r="1.3"/><circle cx="12" cy="12" r="1.1"/><circle cx="50" cy="60" r="1.1"/></g></svg>';
  }

  // ---------- CSS (ported from the boards; colours as tokens per accent and theme) ----------
  const CSS = `
:root{--pl-5:#43297E;--pl-4:#5B3E96;--pl-3:#8471B4;--pl-2:#A69AC0;--pl-1:#AEAAB4;--pl-pot:#DED8EA;--pl-rim:#CDC4DE;--pl-eye:#0E0E10;--pl-acc:#5B3E96;--pl-acc-ic:#FFFFFF;--pl-off:#E1DDE8}
:root[data-accent="blue"]{--pl-5:#12407A;--pl-4:#1F5FAF;--pl-3:#5D86C4;--pl-2:#93ABCF;--pl-1:#AEAAB4;--pl-pot:#D6E0EE;--pl-rim:#C3D0E3;--pl-acc:#1F5FAF;--pl-off:#DDE3EC}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--pl-5:#D4C4FF;--pl-4:#B49BF5;--pl-3:#9081C4;--pl-2:#756C94;--pl-1:#64616B;--pl-pot:#38334A;--pl-rim:#4A4458;--pl-eye:#F2F0F5;--pl-acc:#B49BF5;--pl-acc-ic:#0E0E10;--pl-off:#3A3842}
:root:not([data-theme="light"])[data-accent="blue"]{--pl-5:#C4D8FF;--pl-4:#8DB2EE;--pl-3:#6E8FC4;--pl-2:#5E7194;--pl-1:#64616B;--pl-pot:#2E3A4E;--pl-rim:#3E4C63;--pl-acc:#8DB2EE;--pl-off:#33404F}}
:root[data-theme="dark"]{--pl-5:#D4C4FF;--pl-4:#B49BF5;--pl-3:#9081C4;--pl-2:#756C94;--pl-1:#64616B;--pl-pot:#38334A;--pl-rim:#4A4458;--pl-eye:#F2F0F5;--pl-acc:#B49BF5;--pl-acc-ic:#0E0E10;--pl-off:#3A3842}
:root[data-theme="dark"][data-accent="blue"]{--pl-5:#C4D8FF;--pl-4:#8DB2EE;--pl-3:#6E8FC4;--pl-2:#5E7194;--pl-pot:#2E3A4E;--pl-rim:#3E4C63;--pl-acc:#8DB2EE;--pl-off:#33404F}
.pl{position:relative;flex:none;color:var(--pl-4);transform-origin:50% 100%;display:inline-block}
.pl svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
.pl.xl{width:104px;height:159px}.pl.lg{width:80px;height:123px}.pl.md{width:56px;height:86px}.pl.rw{width:48px;height:74px}.pl.tl{width:44px;height:67px}.pl.sm{width:32px;height:49px}
.pl .rim{fill:var(--pl-rim)}.pl .pot{fill:var(--pl-pot)}.pl .shadow{fill:var(--pl-eye);opacity:.08}
.pl .e-open circle{fill:var(--pl-eye)}.pl .e-shine circle{fill:var(--pl-pot)}
.pl .e-happy,.pl .e-sleep{stroke:var(--pl-eye);fill:none;stroke-linecap:round}.pl .e-drowsy{fill:var(--pl-eye)}
.pl .acc{fill:var(--pl-acc)}.pl .acc-ic{fill:var(--pl-acc-ic)}.pl .spark{fill:var(--pl-acc)}
.pl .body,.pl .sway,.pl .lean{transform-box:view-box;transform-origin:30px 70px;transition:transform .35s}
.pl .g3,.pl .g4,.pl .g5,.pl .fall,.pl .fall2,.pl .need,.pl .spark,.pl .e-happy,.pl .e-drowsy,.pl .e-sleep,.pl .e-shine,.pl .bud{display:none}
.pl.h3 .g3,.pl.h4 .g3,.pl.h5 .g3,.pl.h4 .g4,.pl.h5 .g4,.pl.h5 .g5,.pl.h1 .fall,.pl.h1 .fall2,.pl.h2 .fall2,.pl.h1 .need,.pl.h2 .need,.pl.h5 .spark,.pl.h4 .e-shine{display:inline}
.pl.h4 .lt4,.pl.h5 .lt4,.pl.h1 .nb1{display:none}
.pl.u1 .b1,.pl.u2 .b1,.pl.u2 .b2,.pl.u3 .b1,.pl.u3 .b2,.pl.u3 .b3{display:inline}
.pl.h5{color:var(--pl-5)}.pl.h4{color:var(--pl-4)}.pl.h3{color:var(--pl-3)}.pl.h2{color:var(--pl-2)}.pl.h1{color:var(--pl-1)}
.pl.h2 .body{transform:rotate(-7deg)}.pl.h1 .body{transform:rotate(-17deg)}
.pl.s1 .body{transform:none}.pl.s5.h2 .body,.pl.s5.h1 .body{transform:rotate(-3deg)}
.pl.h5 .e-open,.pl.h2 .e-open,.pl.h1 .e-open{display:none}
.pl.h5 .e-happy,.pl.h2 .e-drowsy,.pl.h1 .e-sleep{display:inline}
.pl.joy .e-open,.pl.joy .e-drowsy,.pl.joy .e-sleep{display:none}.pl.joy .e-happy{display:inline}
/* bare: planted straight in the ground (garden scene): no pot or face, the bubble and shimmer stay */
.pl.bare .rim,.pl.bare .pot,.pl.bare .face,.pl.bare .shadow{display:none}
.pl.ghost{color:var(--pl-off)}.pl.ghost .face,.pl.ghost .need,.pl.ghost .spark,.pl.ghost .fall,.pl.ghost .fall2{display:none}.pl.ghost .pot-svg{opacity:.6}.pl.ghost .sway,.pl.ghost .body{animation:none;transform:none}
@keyframes pl-sway{0%,100%{transform:rotate(-2.6deg)}50%{transform:rotate(2.6deg)}}
@keyframes pl-swayS{0%,100%{transform:rotate(-1deg)}50%{transform:rotate(.6deg)}}
.pl .sway{animation:pl-sway 3.6s ease-in-out infinite}
.pl.h3 .sway{animation-duration:4.6s}.pl.h2 .sway{animation:pl-swayS 7s ease-in-out infinite}.pl.h1 .sway{animation:none}
.pl.d1 .sway{animation-delay:-.7s}.pl.d2 .sway{animation-delay:-1.9s}.pl.d3 .sway{animation-delay:-2.6s}.pl.d4 .sway{animation-delay:-1.2s}.pl.d5 .sway{animation-delay:-3.1s}
@keyframes pl-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.12)}}
.pl .e-open{transform-box:fill-box;transform-origin:center;animation:pl-blink 5.4s infinite}
.pl.d2 .e-open{animation-delay:-2.1s}.pl.d3 .e-open{animation-delay:-3.7s}.pl.d4 .e-open{animation-delay:-1.3s}.pl.d5 .e-open{animation-delay:-4.4s}
@keyframes pl-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
.pl .need{animation:pl-bob 1.8s ease-in-out infinite}
@keyframes pl-twinkle{0%,100%{opacity:0}50%{opacity:1}}
.pl .spark circle{animation:pl-twinkle 2.8s ease-in-out infinite}
.pl .spark circle:nth-child(2){animation-delay:-.9s}.pl .spark circle:nth-child(3){animation-delay:-1.7s}.pl .spark circle:nth-child(4){animation-delay:-2.3s}
@keyframes pl-pop{0%{transform:scale(1,1)}18%{transform:scale(1.1,.86)}42%{transform:scale(.93,1.12)}68%{transform:scale(1.03,.97)}100%{transform:scale(1,1)}}
.pl.pop{animation:pl-pop .75s cubic-bezier(.3,1.3,.5,1)}
.pl.leaning .lean{transform:rotate(4deg)}
.pl.off *{animation-play-state:paused!important}
/* growth moment */
.grow-ov{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:color-mix(in srgb,var(--bg) 88%,transparent);cursor:pointer}
.grow-ov .stagewrap{position:relative;width:176px;height:270px}
.grow-ov .lay,.grow-ov .potl{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 76%}
.grow-ov .potl{transform-origin:50% 98%}
.grow-ov .pl{position:absolute;left:0;top:0;width:100%;height:100%}
@keyframes pl-out{0%{transform:scale(1,1);opacity:1}20%{transform:scale(1.06,.86);opacity:1}46%{transform:scale(.5);opacity:0}100%{transform:scale(.5);opacity:0}}
@keyframes pl-in{0%,34%{transform:scale(.3);opacity:0}52%{opacity:1}70%{transform:scale(1.14,.92)}85%{transform:scale(.96,1.05)}100%{transform:scale(1,1);opacity:1}}
@keyframes pl-dip{0%,100%{transform:scale(1,1)}14%{transform:scale(1.07,.88)}30%{transform:scale(.97,1.04)}62%{transform:scale(1.04,.95)}78%{transform:scale(1,1)}}
.grow-ov .lay.out{animation:pl-out 1.6s cubic-bezier(.4,0,.3,1) forwards}
.grow-ov .lay.in{opacity:0;animation:pl-in 1.6s cubic-bezier(.3,1.2,.5,1) forwards}
.grow-ov .potl.dip{animation:pl-dip 1.6s ease-in-out}
@keyframes pl-burst{0%,28%{transform:translateY(0);opacity:0}36%{opacity:1}76%{transform:translateY(-36px);opacity:0}100%{transform:translateY(-36px);opacity:0}}
.grow-ov .bdot{fill:var(--pl-acc);animation:pl-burst 1.6s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes pl-ring{0%,24%{transform:scale(.2);opacity:0}34%{opacity:.8}72%{transform:scale(2.8);opacity:0}100%{transform:scale(2.8);opacity:0}}
.grow-ov .ring{fill:none;stroke:var(--pl-acc);stroke-width:1.2;transform-box:fill-box;transform-origin:center;animation:pl-ring 1.6s ease-out forwards}
@keyframes pl-chip{0%{transform:translateY(10px) scale(.9);opacity:0}60%{transform:translateY(-2px) scale(1.04);opacity:1}100%{transform:translateY(0) scale(1);opacity:1}}
.grow-ov .gchip{height:36px;display:flex;align-items:center}
.grow-ov .gchip span{background:var(--fg);color:var(--bg);border-radius:18px;padding:7px 16px;font-size:15px;font-weight:600;animation:pl-chip .5s cubic-bezier(.3,1.4,.5,1) forwards}
@media (prefers-reduced-motion:reduce){.pl .sway,.pl .e-open,.pl .need,.pl .spark circle,.pl.pop,.grow-ov .lay,.grow-ov .potl,.grow-ov .bdot,.grow-ov .ring,.grow-ov .gchip span{animation:none!important}.grow-ov .lay.out,.grow-ov .bdot,.grow-ov .ring{opacity:0}.grow-ov .lay.in{opacity:1}}
`;
  let styled = false;
  function ensureStyle() {
    if (styled || typeof document === 'undefined') return;
    styled = true;
    const st = document.createElement('style');
    st.id = 'plant-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // Animation is paused for plants scrolled off screen.
  let io = null;
  function watch(el) {
    if (typeof IntersectionObserver === 'undefined') return;
    if (!io) io = new IntersectionObserver((list) => list.forEach((en) => en.target.classList.toggle('off', !en.isIntersecting)), { rootMargin: '60px' });
    io.observe(el);
  }

  let seq = 0;
  // A potted plant. form 1..5, care 1..5 (1 wilted .. 5 lush), size: xl | lg | md | rw | tl | sm.
  function make(form, care, o) {
    o = o || {};
    ensureStyle();
    const size = o.size || 'rw';
    const small = size === 'rw' || size === 'tl' || size === 'sm';
    const el = document.createElement('span');
    const buds = form === 4 ? Math.max(0, Math.min(3, o.buds || 0)) : 0;
    el.className = 'pl ' + size + ' s' + form + ' h' + (care || 4) + ' d' + ((o.seed != null ? o.seed : seq++) % 5 + 1) + (buds ? ' u' + buds : '') + (o.ghost ? ' ghost' : '') + (o.bare ? ' bare' : '');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = plantSvg(form) + (o.potless ? '' : potSvg(small));
    if (!o.still) watch(el);
    return el;
  }
  // Squash-bounce with happy eyes, as when watered.
  function water(el) {
    if (!el) return;
    el.classList.remove('pop'); void el.offsetWidth;
    el.classList.add('pop', 'joy');
    setTimeout(() => el.classList.remove('pop', 'joy'), 1400);
  }
  // Lean toward a finger.
  function leanOnTouch(el) {
    if (!el) return;
    const on = () => el.classList.add('leaning'), off = () => el.classList.remove('leaning');
    el.addEventListener('pointerdown', on); ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, off));
  }
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // The growth moment: about 1.6 s, plays once, tap to skip, light haptic, then a chip naming the new stage.
  function grow(fromForm, toForm, care, stageName) {
    ensureStyle();
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'grow-ov';
      ov.setAttribute('role', 'status');
      ov.setAttribute('aria-label', 'Grew into ' + stageName);
      const chip = document.createElement('div'); chip.className = 'gchip';
      const wrap = document.createElement('div'); wrap.className = 'stagewrap';
      const out = make(fromForm, care, { size: 'xl', potless: true, still: true, seed: 0 }); out.classList.add('joy');
      const inn = make(toForm, care, { size: 'xl', potless: true, still: true, seed: 0 }); inn.classList.add('joy');
      const lo = document.createElement('div'); lo.className = 'lay out'; lo.appendChild(out);
      const li = document.createElement('div'); li.className = 'lay in'; li.appendChild(inn);
      const pot = make(toForm, care, { size: 'xl', still: true, seed: 0 }); pot.classList.add('joy');
      pot.querySelector('.plant-svg').remove();
      const pw = document.createElement('div'); pw.className = 'potl dip'; pw.appendChild(pot);
      const fx = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      fx.setAttribute('viewBox', '0 0 60 92'); fx.setAttribute('aria-hidden', 'true');
      fx.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible';
      let dots = '<circle class="ring" cx="30" cy="42" r="12"/>';
      for (let i = 0; i < 10; i++) dots += '<g transform="rotate(' + (i * 36) + ' 30 42)"><circle class="bdot" cx="30" cy="42" r="' + (i % 2 ? 1.5 : 1.9) + '"/></g>';
      fx.innerHTML = dots;
      wrap.append(lo, li, pw, fx);
      ov.append(chip, wrap);
      document.body.appendChild(ov);
      try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) { /* ignore */ }
      let done = false;
      const t1 = setTimeout(name, reduced() ? 0 : 1600);
      const t2 = setTimeout(finish, reduced() ? 1200 : 2700);
      function name() { chip.innerHTML = ''; const s = document.createElement('span'); s.textContent = stageName; chip.appendChild(s); }
      function finish() { if (done) return; done = true; clearTimeout(t1); clearTimeout(t2); ov.remove(); resolve(); }
      ov.addEventListener('click', finish);
    });
  }

  ensureStyle(); // tokens (--pl-*) are also used by bars and dots in app.css
  RV.plant = { make, water, leanOnTouch, grow, css: CSS };
})(window);
