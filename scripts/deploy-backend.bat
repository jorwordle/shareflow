@echo off
echo ===================================
echo ShareFlow Backend Deployment Script
echo ===================================
echo.

REM Check if Railway CLI is installed
where railway >nul 2>nul
if %errorlevel% neq 0 (
    echo Railway CLI not found. Installing...
    npm install -g @railway/cli
)

echo.
echo Select an option:
echo 1. Deploy backend to Railway
echo 2. Check deployment status
echo 3. View logs
echo 4. Exit
echo.

set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" goto deploy
if "%choice%"=="2" goto status
if "%choice%"=="3" goto logs
if "%choice%"=="4" goto end
goto invalid

:deploy
echo.
echo Preparing backend for deployment...
cd server

if not exist package.json (
    echo ERROR: package.json not found in server directory
    pause
    exit /b 1
)

echo Logging into Railway...
railway login

echo Linking to Railway project...
railway link

echo Setting environment variables...
railway variables set PORT=3001
railway variables set NODE_ENV=production

set /p client_url="Enter your Netlify URL (e.g., https://shareflow.netlify.app): "
railway variables set CLIENT_URL=%client_url%

echo Deploying to Railway...
railway up

echo.
echo Deployment complete!
echo Your backend URL is:
railway domain

cd ..
pause
goto end

:status
echo Checking deployment status...
cd server
railway status
railway logs --lines 20
cd ..
pause
goto end

:logs
cd server
railway logs -f
cd ..
goto end

:invalid
echo Invalid choice!
pause

:end
echo Goodbye!
exit /b 0