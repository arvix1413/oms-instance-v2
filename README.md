# OMS Instance V2 - Docker VPS Deployment

OMS (Order Management System) deployed on VPS with Docker.

## Live Server
- Frontend: http://43.133.56.234
- Backend API: http://43.133.56.234/api
- Default login: admin@oms.com / admin123

## Architecture
- Frontend: Next.js (static export) → Nginx (port 80)
- Backend: Node.js + Hono (port 3001)
- Database: MySQL 8.0 (port 3306)
- All services run in Docker containers

## Quick Deploy (Manual)

From workspace root:
```bash
./oms-instance-v2/deploy-local.sh
```

This will:
1. Package source code
2. Upload to server
3. Build Docker images on server
4. Push to Docker Hub (111leo1)
5. Pull & restart containers on server

## GitHub Actions CI/CD

On push to `main`, GitHub Actions will:
1. Build backend & frontend Docker images
2. Push to Docker Hub
3. SSH to server and run `/opt/oms/deploy.sh`

### Required GitHub Secrets
| Secret | Value |
|--------|-------|
| DOCKER_HUB_USER | 111leo1 |
| DOCKER_HUB_TOKEN | dckr_pat_... |
| SERVER_HOST | 43.133.56.234 |
| SERVER_USER | ubuntu |
| SERVER_PASSWORD | Www.950pp.com |
| SERVER_PORT | 22 |

## Server Structure
```
/opt/oms/
├── docker-compose.yml   # Uses Docker Hub images
├── init.sql             # DB schema + seed data
├── deploy.sh            # Pull & restart script
└── uploads/             # Uploaded files (persistent)
```

## Docker Hub Images
- `111leo1/oms-backend:latest`
- `111leo1/oms-frontend:latest`
# Last deploy: Mon Apr  6 12:02:43 +08 2026
