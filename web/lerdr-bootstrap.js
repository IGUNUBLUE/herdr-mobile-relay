const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.25.0-393-a3945f591a703133/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
