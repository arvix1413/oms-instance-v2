#!/bin/bash
# Local development with remote MySQL via SSH tunnel
# Usage: ./start-local.sh

echo "🔗 Starting SSH tunnel to remote MySQL..."
# Tunnel: localhost:3307 → 43.133.56.234:3306
sshpass -p 'Www.950pp.com' ssh -o StrictHostKeyChecking=no \
  -L 3307:localhost:3306 \
  -N -f ubuntu@43.133.56.234
echo "✅ SSH tunnel running on localhost:3307"

echo "🚀 Starting backend on port 3001..."
cd backend && npm run dev &
BACKEND_PID=$!

echo "🌐 Starting frontend on port 3000..."
cd ../frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Local dev running:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all"

trap "kill $BACKEND_PID $FRONTEND_PID; pkill -f 'ssh.*3307'; echo 'Stopped'" INT
wait
