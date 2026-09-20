const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.24.0-391-dc272cf388816026/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
