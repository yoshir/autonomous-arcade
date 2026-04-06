module.exports = {
  apps: [{
    name: 'autonomous-arcade-heartbeat',
    script: 'index.js',
    cwd: '.',
    interpreter: 'node',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: 30_000,
    exp_backoff_restart_delay: 1000,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
