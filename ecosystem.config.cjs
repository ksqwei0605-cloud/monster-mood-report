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
    {
      name: "vllm-server",
      script: "/miniconda3/bin/python3",
      args: "-m vllm.entrypoints.openai.api_server --model /root/Qwen3-VL-32B-Instruct-FP8 --port 8100 --tensor-parallel-size 2 --gpu-memory-utilization 0.90 --max-num-seqs 8 --max-model-len 8192 --trust-remote-code --dtype bfloat16",
      interpreter: "none",
      exec_mode: "fork",
      env: {
        VLLM_USE_V1: "0",
      },
      autorestart: true,
      max_restarts: 5,
      restart_delay: 15000,
    },
  ],
};
