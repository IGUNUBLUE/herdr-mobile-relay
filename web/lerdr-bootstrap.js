const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.26.1-398-af1ea152433a350b/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
