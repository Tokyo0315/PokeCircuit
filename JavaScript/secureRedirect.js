(function () {
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  const isHTTPS = window.location.protocol === "https:";
  const isHTTP = window.location.protocol === "http:";

  // If running on local network HTTP (ex: 192.168.x.x),
  // redirect to localhost or HTTPS
  if (!isLocalhost && isHTTP) {
    console.warn("Insecure HTTP detected. Redirecting to a secure origin...");

    // 1) Try redirect to HTTPS first
    const httpsURL =
      "https://" + window.location.host + window.location.pathname;

    // If your machine doesn't have HTTPS certificates,
    // fallback to localhost
    const localhostURL =
      "http://localhost:" + window.location.port + window.location.pathname;

    // Attempt HTTPS redirect
    fetch(httpsURL)
      .then(() => {
        console.log("HTTPS available. Redirecting now...");
        window.location.replace(httpsURL);
      })
      .catch(() => {
        console.log("HTTPS not available. Redirecting to localhost...");
        window.location.replace(localhostURL);
      });
  }
})();
