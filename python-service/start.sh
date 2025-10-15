#!/bin/bash

# Start TA-Lib Pattern Service

echo "Starting TA-Lib Pattern Recognition Service..."

# Activate virtual environment if exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run with gunicorn (production)
gunicorn --bind 0.0.0.0:5000 \
         --workers 2 \
         --timeout 30 \
         --log-level info \
         pattern_service:app

# Or run with Flask development server
# python pattern_service.py

