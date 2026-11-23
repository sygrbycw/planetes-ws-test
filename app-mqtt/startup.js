import { beginCompass } from './compass-ui.js?v=ui1-8-mqtt1';

const splash = document.getElementById('startup');
const main = document.querySelector('main');
const light = splash.querySelector('.startup-light');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const duration = 4000;
const revealDuration = 650;
const startAngle = -35 * Math.PI / 180;
let frame;
let entered = false;
let origin;

function complete() {
  cancelAnimationFrame(frame);
  splash.classList.add('startup-ready');
  light.style.removeProperty('transform');
}

function sweep(now) {
  origin ??= now;
  const elapsed = now - origin;
  if (elapsed >= duration + revealDuration) {
    complete();
    return;
  }
  const progress = Math.min(1, elapsed / duration);
  const reveal = Math.max(0, (elapsed - duration) / revealDuration);
  if (elapsed >= duration) splash.classList.add('startup-reveal');
  const angle = startAngle + 2 * Math.PI * progress;
  light.style.opacity = String(Math.min(1, elapsed / 180) * Math.max(0, 1 - reveal * 3));
  light.style.transform = 'rotate(' + angle + 'rad)';
  frame = requestAnimationFrame(sweep);
}

splash.addEventListener('click', () => {
  if (entered) return;
  entered = true;
  // Safari の許可は、このタップの同期処理で開始する。
  void beginCompass();
  cancelAnimationFrame(frame);
  splash.classList.add('startup-exit');
  const finish = () => {
    splash.hidden = true;
    main.inert = false;
  };
  if (motion.matches) finish();
  else setTimeout(finish, 380);
});
motion.addEventListener('change', () => { if (motion.matches && !entered) complete(); });
if (motion.matches) complete();
else frame = requestAnimationFrame(sweep);


