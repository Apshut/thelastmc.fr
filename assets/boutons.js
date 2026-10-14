/* The Last — les boutons « Lueur de braise » (nether.css) : les deux gestes que le CSS seul ne sait pas faire. Sans ce
   script, tout reste lisible et utilisable.
   1. Les braises : quand la souris entre sur un lingot (.btn-main), huit pixels de braise montent et s'éteignent en
      700 ms, puis sont retirés. Rien au repos, rien au doigt, rien avec « réduire les animations », rien sur un lingot
      calme (.btn-calme, comme « Envoyer » de Volkar).
   2. Le verrouillé parle : un .btn-locked[aria-disabled="true"] reste atteignable au clavier (au lieu de disabled) ; un
      clic le secoue de 2 px et éclaire pendant 1,6 s ce qui l'explique (les éléments de son aria-describedby).
   Les boutons ajoutés plus tard par les pages sont pris aussi (écoute sur le document).
   À inclure sur les pages qui ont un lingot ou un verrouillé :  <script src="/assets/boutons.js" defer></script> */
(() => {
'use strict';
const D = document;
const souris = matchMedia('(hover: hover) and (pointer: fine)'), reduit = matchMedia('(prefers-reduced-motion: reduce)');

/* 1. les braises : des grains de 2 px, posés sur la grille de 2 px du lingot, chacun un peu différent */
function braises(b) {
  if (b.querySelectorAll('.etincelle').length >= 8) return;          // survols répétés : une volée à la fois, 8 grains au plus
  const w = b.offsetWidth;
  for (let k = 0; k < 8; k++) {
    const i = D.createElement('i');
    i.className = 'etincelle'; i.setAttribute('aria-hidden', 'true');
    i.style.left = Math.round((0.1 + 0.8 * (k + Math.random() * 0.6) / 8) * w / 2) * 2 + 'px';
    i.style.top = Math.round(Math.random() * 3) * 2 + 'px';
    i.style.setProperty('--h', -(24 + Math.round(Math.random() * 6) * 2) + 'px');
    i.style.setProperty('--d', (Math.round(Math.random() * 4) - 2) * 2 + 'px');
    i.style.animationDelay = k * 25 + 'ms';
    i.addEventListener('animationend', () => i.remove(), { once: true });
    b.appendChild(i);
  }
}
D.addEventListener('pointerenter', e => {
  const b = e.target;
  if (!b.classList || !b.classList.contains('btn-main') || b.classList.contains('btn-calme')) return;
  if (e.pointerType !== 'mouse' || !souris.matches || reduit.matches || b.matches('[disabled], [aria-disabled="true"]')) return;
  braises(b);
}, true);                                                              // pointerenter ne remonte pas : on l'écoute à la descente

/* 2. le verrouillé : la secousse, puis l'explication en or */
D.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.btn-locked[aria-disabled="true"]');
  if (!b) return;
  e.preventDefault();
  b.classList.remove('secoue'); void b.offsetWidth; b.classList.add('secoue');   // relance la secousse à chaque clic
  (b.getAttribute('aria-describedby') || '').split(/\s+/).forEach(id => {
    const m = id && D.getElementById(id); if (!m) return;
    m.classList.add('eclaire'); clearTimeout(m.eclaireT); m.eclaireT = setTimeout(() => m.classList.remove('eclaire'), 1600);
  });
});
D.addEventListener('animationend', e => { if (e.animationName === 'secoue') e.target.classList.remove('secoue'); });
})();
