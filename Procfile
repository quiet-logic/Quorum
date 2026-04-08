web: python -u seed_data.py; python -u seed_mcq.py; echo "Seeding done, starting gunicorn..."; gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --log-level debug --preload
