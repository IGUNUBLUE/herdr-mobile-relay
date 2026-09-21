const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.26.3-403-6e0cf335e81c8015/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
