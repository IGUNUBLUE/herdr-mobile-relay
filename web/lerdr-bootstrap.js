const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.25.0-393-6a8bb630927b00de/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
