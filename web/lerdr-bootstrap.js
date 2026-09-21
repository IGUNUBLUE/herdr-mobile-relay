const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.26.2-399-3c726935f77b4730/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
