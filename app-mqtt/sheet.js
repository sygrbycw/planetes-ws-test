const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const closing = new WeakSet();

export function openSheet(dialog, focus) {
  if (dialog.open) return;
  dialog.classList.remove('sheet-expanded');
  dialog.showModal();
  focus.focus({ preventScroll: true });
  if (reducedMotion.matches) dialog.classList.add('sheet-visible');
  else requestAnimationFrame(() => requestAnimationFrame(() => {
    if (dialog.open && !closing.has(dialog)) dialog.classList.add('sheet-visible');
  }));
}

function clearDrag(dialog) {
  dialog.classList.remove('sheet-dragging');
  dialog.style.removeProperty('--sheet-offset');
  dialog.style.removeProperty('--sheet-shade');
}

export function closeSheet(dialog) {
  if (!dialog.open || closing.has(dialog)) return;
  closing.add(dialog);
  dialog.classList.remove('sheet-visible');
  clearDrag(dialog);
  const finish = () => {
    dialog.close();
    closing.delete(dialog);
  };
  if (reducedMotion.matches) finish();
  else setTimeout(finish, 220);
}

export function enableSheetDrag(dialog, handle) {
  let drag;
  let moved = false;
  let compactHeight;
  let settleTimer;
  const maxHeight = () => (window.visualViewport?.height ?? window.innerHeight) -
    (parseFloat(getComputedStyle(dialog).paddingTop) || 0);
  function settle(expanded, height) {
    clearDrag(dialog);
    dialog.classList.toggle('sheet-expanded', expanded);
    if (reducedMotion.matches) {
      dialog.style.removeProperty('height');
      return;
    }
    dialog.classList.add('sheet-settling');
    dialog.style.height = height + 'px';
    settleTimer = setTimeout(() => {
      dialog.classList.remove('sheet-settling');
      dialog.style.removeProperty('height');
    }, 220);
  }
  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || closing.has(dialog) ||
        dialog.classList.contains('keyboard-open') || dialog.classList.contains('destination-screen')) return;
    clearTimeout(settleTimer);
    dialog.classList.remove('sheet-settling');
    const expanded = dialog.classList.contains('sheet-expanded');
    const height = dialog.getBoundingClientRect().height;
    if (!expanded) compactHeight = height;
    drag = { id: event.pointerId, y: event.clientY, height, expanded, limit: maxHeight() };
    moved = false;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const distance = event.clientY - drag.y;
    if (Math.abs(distance) > 5) moved = true;
    if (!moved) return;
    const offset = drag.expanded ? 0 : Math.max(0, distance);
    dialog.classList.add('sheet-dragging');
    dialog.style.height = Math.max(compactHeight, Math.min(drag.limit, drag.height - distance)) + 'px';
    dialog.style.setProperty('--sheet-offset', offset + 'px');
    dialog.style.setProperty('--sheet-shade', String(Math.max(0, 0.66 * (1 - offset / dialog.offsetHeight))));
  });
  handle.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    const distance = event.clientY - drag.y;
    const { expanded, height, limit } = drag;
    drag = null;
    if (moved && expanded && distance >= 55) settle(false, compactHeight);
    else if (moved && !expanded && distance <= -55) settle(true, limit);
    else if (moved && !expanded && distance >= Math.min(75, height * 0.25)) {
      dialog.style.removeProperty('height');
      closeSheet(dialog);
    } else if (moved) settle(expanded, expanded ? limit : compactHeight);
    else clearDrag(dialog);
  });
  handle.addEventListener('pointercancel', () => {
    if (drag && moved) settle(drag.expanded, drag.height);
    drag = null;
    clearDrag(dialog);
  });
  handle.addEventListener('click', () => {
    if (!moved) closeSheet(dialog);
    moved = false;
  });
  dialog.addEventListener('close', () => {
    clearTimeout(settleTimer);
    dialog.classList.remove('sheet-settling', 'sheet-expanded');
    dialog.style.removeProperty('height');
    drag = null;
  });
}

export function keepFieldsVisible(dialog) {
  const viewport = window.visualViewport;
  const editable = element => element?.matches('textarea, input:not([type="checkbox"])');
  const content = dialog.querySelector('.sheet-content');

  function syncViewport() {
    if (!dialog.open || !viewport || viewport.scale !== 1 || !editable(document.activeElement)) {
      dialog.classList.remove('keyboard-open');
      dialog.style.removeProperty('--keyboard-inset');
      dialog.style.removeProperty('--sheet-visible-height');
      dialog.style.removeProperty('--visible-top');
      return;
    }
    const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    dialog.classList.toggle('keyboard-open', inset > 60);
    dialog.style.setProperty('--keyboard-inset', inset + 'px');
    dialog.style.setProperty('--sheet-visible-height', viewport.height + 'px');
    dialog.style.setProperty('--visible-top', viewport.offsetTop + 'px');
    const field = document.activeElement.getBoundingClientRect();
    const area = content.getBoundingClientRect();
    if (field.bottom > area.bottom - 12) content.scrollTop += field.bottom - area.bottom + 12;
    else if (field.top < area.top) content.scrollTop += field.top - area.top - 12;
  }

  viewport?.addEventListener('resize', syncViewport);
  viewport?.addEventListener('scroll', syncViewport);
  dialog.addEventListener('focusin', syncViewport);
  dialog.addEventListener('focusout', () => requestAnimationFrame(syncViewport));
  dialog.addEventListener('close', syncViewport);
  dialog.addEventListener('click', event => {
    if (editable(document.activeElement) &&
        !event.target.closest('input, textarea, label, button, a, summary')) document.activeElement.blur();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.id === 'spot-name' && !event.isComposing) {
      event.preventDefault();
      event.target.blur();
    }
  });
}
