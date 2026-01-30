Before going to prod:

- test wearable upload
- set new env vars in prod
- check prod db and migrate if needed

Nice to have:

- set up MinIO for local dev, don't rely on production R2
- somehow pick the right DATABASE_URL depending on running in docker or not
