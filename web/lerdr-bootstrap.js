const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.26.0-396-3c926af092a7e232/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
