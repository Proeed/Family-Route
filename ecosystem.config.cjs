module.exports = {
  apps: [
    {
      name: 'family-route-api',
      cwd: './server',
      script: 'index.js',
      autorestart: true,
      watch: false,
    },
    {
      name: 'family-route-client',
      cwd: './client',
      script: 'node_modules/vite/bin/vite.js',
      args: '--port 5173',
      autorestart: true,
      watch: false,
    },
    {
      name: 'family-route-tunnel',
      script: 'C:/Users/idhan/bin/cloudflared.exe',
      args: 'tunnel --url http://localhost:5173 --no-autoupdate',
      autorestart: true,
      watch: false,
    },
    {
      name: 'family-route-watchdog',
      cwd: './server',
      script: 'watchdog.js',
      autorestart: true,
      watch: false,
    },
  ],
};
