const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.21.3-385-659411daf6b98e5e/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
