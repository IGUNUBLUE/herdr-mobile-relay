const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.27.1-405-3249571d35bd6ee7/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
