#!/bin/bash
# Verify deployment and database migration

SERVER="ubuntu@43.133.56.234"
SERVER_PASS="Www.950pp.com"

echo "🔍 Verifying OMS Deployment..."
echo ""

echo "1. Checking database columns..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
docker exec oms-mysql mysql -uoms_user -poms_db_2026 oms_db -e "
SELECT 
  CASE 
    WHEN COUNT(*) >= 2 THEN '✅ All required columns exist'
    ELSE '❌ Missing columns'
  END as status
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA='oms_db' 
  AND TABLE_NAME='customer_orders' 
  AND COLUMN_NAME IN ('currency', 'delivery_address')
" 2>/dev/null
ENDSSH

echo ""
echo "2. Checking customer orders data..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
docker exec oms-mysql mysql -uoms_user -poms_db_2026 oms_db -e "
SELECT 
  co.id, 
  co.po_number, 
  c.customer_name,
  co.currency,
  co.total_amount
FROM customer_orders co 
LEFT JOIN customers c ON co.customer_id = c.id
LIMIT 3
" 2>/dev/null
ENDSSH

echo ""
echo "3. Checking Docker containers..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep oms"

echo ""
echo "4. Testing frontend..."
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://43.133.56.234)
if [ "$FRONTEND_STATUS" = "200" ]; then
  echo "✅ Frontend is accessible (HTTP $FRONTEND_STATUS)"
else
  echo "❌ Frontend error (HTTP $FRONTEND_STATUS)"
fi

echo ""
echo "5. Testing backend..."
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://43.133.56.234:3001)
if [ "$BACKEND_STATUS" = "404" ] || [ "$BACKEND_STATUS" = "401" ]; then
  echo "✅ Backend is running (HTTP $BACKEND_STATUS - expected for root path)"
else
  echo "⚠️  Backend status: HTTP $BACKEND_STATUS"
fi

echo ""
echo "✅ Verification complete!"
echo "Visit: http://43.133.56.234"
