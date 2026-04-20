# Face Swap System - Backend

Node.js + Express backend with MySQL database for real-time face swapping.

## Tech Stack
- Node.js + Express.js
- MySQL (MAMP)
- JWT Authentication
- Multer for file uploads

## Setup
1. Copy `.env.example` to `.env`
2. Update database credentials for MAMP (port 8889, user: root, password: root)
3. Run `npm install`
4. Run `npm run dev` for development

## Database
Run `setup_database.sql` in MAMP phpMyAdmin or MySQL client to create tables.

## API Endpoints (Coming)
- POST /api/auth/register - User registration
- POST /api/auth/login - User login
- POST /api/faces/upload - Upload face image
- GET /api/faces - Get user's face images
- POST /api/swap/start - Start face swapping
- POST /api/swap/stop - Stop face swapping
