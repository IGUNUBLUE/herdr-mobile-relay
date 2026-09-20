const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.25.0-393-25a6af8f06a4f9f6/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
