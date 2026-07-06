window.__BACKEND_URL__ = window.__BACKEND_URL__ || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'
    ? 'http://localhost:3000'
    : 'https://your-render-app.onrender.com'
);
