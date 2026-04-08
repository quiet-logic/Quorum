web: python seed_data.py && python seed_mcq.py && echo "Starting gunicorn..." && gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --log-level debug --preload
