const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.26.2-401-1022f191fd54aa82/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
