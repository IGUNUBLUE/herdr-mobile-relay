const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.25.0-392-3e465093b17fa2f2/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
