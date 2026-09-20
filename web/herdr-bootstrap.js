const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.22.0-386-eb51ce0bb29bb417/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
