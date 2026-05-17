module.exports = {
  apps: [
    {
      name: "yaoyao-backend",
      cwd: "/root/monster-mood-report/backend",
      script: "/usr/bin/python3",
      args: "-m uvicorn main:app --host 0.0.0.0 --port 8787",
      interpreter: "none",
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "yaoyao-frontend",
      cwd: "/root/monster-mood-report",
      script: "npx",
      args: "vite dev --host 0.0.0.0 --port 5173",
      interpreter: "none",
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
