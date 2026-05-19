@echo off
setlocal

set "ROOT=%~dp0.."
set "MYSQL_BASE=C:\Program Files\MySQL\MySQL Server 8.0"
set "MYSQLD=%MYSQL_BASE%\bin\mysqld.exe"
set "MYSQL=%MYSQL_BASE%\bin\mysql.exe"
set "MYSQLADMIN=%MYSQL_BASE%\bin\mysqladmin.exe"
set "DATA_ROOT=%ROOT%\.mysql-data"
set "DATA_DIR=%DATA_ROOT%\data"
set "CONF=%DATA_ROOT%\my.ini"
set "DB_HOST=127.0.0.1"
set "DB_PORT=3307"
set "DB_NAME=localbasket"

if not exist "%MYSQLD%" (
  echo MySQL server binary not found at "%MYSQLD%".
  exit /b 1
)

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

(
  echo [client]
  echo port=%DB_PORT%
  echo.
  echo [mysqld]
  echo basedir=%MYSQL_BASE:\=/%
  echo datadir=%DATA_DIR:\=/%
  echo port=%DB_PORT%
  echo bind-address=127.0.0.1
  echo mysqlx=0
  echo default-storage-engine=INNODB
) > "%CONF%"

if not exist "%DATA_DIR%\mysql" (
  echo Initializing portable local MySQL data directory...
  "%MYSQLD%" --initialize-insecure --basedir="%MYSQL_BASE%" --datadir="%DATA_DIR%"
  if errorlevel 1 (
    echo MySQL initialization failed.
    exit /b 1
  )
)

set /a attempts=0
"%MYSQLADMIN%" -u root -h %DB_HOST% -P %DB_PORT% ping >nul 2>&1
if not errorlevel 1 goto mysql_ready

echo Starting portable local MySQL on %DB_HOST%:%DB_PORT%...
start "localbasket-mysql" /min "%MYSQLD%" --defaults-file="%CONF%"

:wait_mysql
timeout /t 1 >nul
"%MYSQLADMIN%" -u root -h %DB_HOST% -P %DB_PORT% ping >nul 2>&1
if not errorlevel 1 goto mysql_ready
set /a attempts+=1
if %attempts% GEQ 20 (
  echo Portable local MySQL did not become ready on port %DB_PORT%.
  exit /b 1
)
goto wait_mysql

:mysql_ready
if %attempts% EQU 0 echo Using existing MySQL instance on %DB_HOST%:%DB_PORT%.
echo Ensuring database "%DB_NAME%" exists...
"%MYSQL%" -u root -h %DB_HOST% -P %DB_PORT% -e "CREATE DATABASE IF NOT EXISTS `%DB_NAME%`;"
if errorlevel 1 (
  echo Database creation failed.
  exit /b 1
)

curl.exe -fsS http://127.0.0.1:5000/api/health >nul 2>&1
if not errorlevel 1 (
  echo LocalBasket backend is already running on http://localhost:5000
  exit /b 0
)

echo Starting LocalBasket backend...
node "%ROOT%\backend\server.js"
