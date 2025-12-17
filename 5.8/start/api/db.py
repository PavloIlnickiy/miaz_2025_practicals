import os
from contextlib import contextmanager

import psycopg2
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())


def _db_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set. Create .env from .env.example")
    return url


@contextmanager
def get_conn():
    conn = psycopg2.connect(_db_url())
    conn.autocommit = True
    try:
        yield conn
    finally:
        conn.close()
