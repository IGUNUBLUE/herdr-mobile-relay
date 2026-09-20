const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.26.0-395-2f16390d1e0eed2a/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
