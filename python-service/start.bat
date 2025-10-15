@echo off
echo Starting TA-Lib Pattern Recognition Service...

REM Activate virtual environment if exists
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

REM Run with Python
python pattern_service.py

pause

