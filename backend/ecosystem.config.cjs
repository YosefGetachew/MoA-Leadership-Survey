module.exports = {
  apps: [
    {
      name: "moa-leadership-survey-backend",
      cwd: __dirname,
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "5001"
      },
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      time: true
    }
  ]
};
