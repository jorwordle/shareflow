@echo off
echo =====================================
echo ShareFlow Frontend Deployment Script
echo =====================================
echo.

REM Check if Netlify CLI is installed
where netlify >nul 2>nul
if %errorlevel% neq 0 (
    echo Netlify CLI not found. Installing...
    npm install -g netlify-cli
)

echo.
echo Select an option:
echo 1. Deploy frontend to Netlify
echo 2. Setup continuous deployment
echo 3. Check deployment status
echo 4. Open Netlify dashboard
echo 5. Exit
echo.

set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto deploy
if "%choice%"=="2" goto continuous
if "%choice%"=="3" goto status
if "%choice%"=="4" goto dashboard
if "%choice%"=="5" goto end
goto invalid

:deploy
echo.
echo Preparing frontend for deployment...
cd frontend

if not exist package.json (
    echo ERROR: package.json not found in frontend directory
    pause
    exit /b 1
)

echo Installing dependencies...
npm install

set /p backend_url="Enter your Railway backend URL (e.g., https://shareflow-server.up.railway.app): "

echo Setting environment variables...
echo NEXT_PUBLIC_SERVER_URL=%backend_url% > .env.production

echo Building production bundle...
call npm run build

if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

echo Logging into Netlify...
netlify login

echo Deploying to Netlify...
netlify deploy --prod --dir=.next

echo.
echo Deployment complete!
echo Your frontend URL is:
netlify status

cd ..
pause
goto end

:continuous
echo Setting up continuous deployment...
cd frontend

netlify init
netlify link

set /p backend_url="Enter your Railway backend URL: "
netlify env:set NEXT_PUBLIC_SERVER_URL %backend_url%

echo Continuous deployment configured!
echo Future pushes to your repository will trigger automatic deployments.

cd ..
pause
goto end

:status
echo Checking deployment status...
cd frontend
netlify status
netlify env:list
cd ..
pause
goto end

:dashboard
netlify open
goto end

:invalid
echo Invalid choice!
pause

:end
echo Goodbye!
exit /b 0