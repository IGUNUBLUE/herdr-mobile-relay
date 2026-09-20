const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.23.1-389-3e5bec0b9a77608a/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
