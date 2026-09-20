const e = new URL(window.__HERDR_ENTRY__ || "/builds/0.26.0-394-7099487ae74012bc/index.html", location);
  e.search = location.search;
  e.hash = location.hash;
  location.replace(e);
