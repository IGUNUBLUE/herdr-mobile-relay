const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.21.3-384-f711bbeac8b1837d/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
