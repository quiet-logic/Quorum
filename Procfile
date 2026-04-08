web: python -u seed_data.py 2>&1; python -u seed_mcq.py 2>&1; gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120 --preload
