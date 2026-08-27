// ui-anim.js — lightweight interaction animations & feedback

(function () {
  function attach() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      // quick press animation
      btn.style.transition = 'transform 80ms ease';
      btn.style.transform = 'translateY(1px) scale(0.998)';
      setTimeout(() => { btn.style.transform = ''; }, 120);
    });

    // subtle hover glow for active controls
    document.querySelectorAll('.asset-btn, .primary-btn, .ghost-btn').forEach((b) => {
      b.addEventListener('mouseenter', () => {
        b.style.boxShadow = '0 6px 18px rgba(0,0,0,0.15)';
      });
      b.addEventListener('mouseleave', () => { b.style.boxShadow = ''; });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
