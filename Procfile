web: sh -c 'echo "PORT=$PORT" && python -u seed_data.py && python -u seed_mcq.py && gunicorn app:app --bind 0.0.0.0:${PORT:-8080} --workers 1 --timeout 120' 2>&1
