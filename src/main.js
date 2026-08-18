import { onRoute, startRouter } from './lib/router.js';
import { mountAdmin } from './admin/admin.js';

onRoute(/^\/admin/, () => {
  const el = document.getElementById('admin-root');
  el.hidden = false;
  document.getElementById('map').style.display = 'none';
  mountAdmin(el);
});

// Agent A registers the map routes here.
startRouter();
