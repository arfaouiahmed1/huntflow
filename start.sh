#!/usr/bin/env bash

echo -e "\033[1;36m"
cat << "EOF"
=============================================================================
  _   _ _   _ _   _ _____ _____ _     _____        __ 
 | | | | | | | \ | |_   _|  ___| |   / _ \ \      / / 
 | |_| | | | |  \| | | | | |_  | |  | | | \ \ /\ / /  
 |  _  | |_| | |\  | | | |  _| | |__| |_| |\ V  V /   
 |_| |_|\___/|_| \_| |_| |_|   |_____\___/  \_/\_/    
                                                      
                  Job Finder v0.1.0                   
=============================================================================
EOF
echo -e "\033[0m"

echo -e "\033[1;32mStarting Scrapling Agent server...\033[0m"
(cd scrapling-agent && uv run uvicorn server:app --port 8001) &
PYTHON_PID=$!

echo -e "\033[1;32mStarting Next.js dev server...\033[0m"
npm run dev &
NEXT_PID=$!

echo -e "\033[1;33mBoth servers are running. Press Ctrl+C to stop.\033[0m"

cleanup() {
    echo -e "\n\033[1;33mStopping servers...\033[0m"
    kill $PYTHON_PID 2>/dev/null
    kill $NEXT_PID 2>/dev/null
    echo -e "\033[1;32mAll servers stopped.\033[0m"
    exit 0
}

trap cleanup SIGINT SIGTERM

wait
