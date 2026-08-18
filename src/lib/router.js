const routes = [];
export function onRoute(pattern, handler) { routes.push({ pattern, handler }); }
export function navigate(hash) { window.location.hash = hash; }
export function startRouter() {
  const run = () => {
    const hash = window.location.hash.replace(/^#/, '') || '/';
    for (const { pattern, handler } of routes) {
      const m = hash.match(pattern);
      if (m) return handler(m);
    }
  };
  window.addEventListener('hashchange', run);
  run();
}
