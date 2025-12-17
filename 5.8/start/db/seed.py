import os
import random
from datetime import datetime, timedelta

import psycopg2
from dotenv import load_dotenv, find_dotenv


N_ROWS = 500

SECTORS = ["North", "South", "East", "West", "Center"]
DIRECTIONS = ["Dnipro", "Kharkiv", "Donetsk", "Zaporizhzhia", "Kherson", "Sumy"]
EVENT_TYPES = ["Strike", "Recon", "Assault", "Shelling", "Drone", "EW"]


def make_row():
    now = datetime.now()
    start = now - timedelta(days=90)
    occurred_at = start + timedelta(seconds=random.randint(0, 90 * 24 * 3600))

    sector = random.choice(SECTORS[: random.randint(3, 6)])
    direction = random.choice(DIRECTIONS[: random.randint(4, 8)])
    event_type = random.choice(EVENT_TYPES[: random.randint(4, 6)])
    intensity = random.randint(1, 50)

    source = random.choice(["OSINT", "Unit report", "SIGINT", "UAV feed", None])
    summary = f"{event_type} in {sector}/{direction}, intensity={intensity}"

    return (occurred_at, sector, direction, event_type, intensity, source, summary)


def main():
    load_dotenv(find_dotenv())
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL not found. Create .env from .env.example")

    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            # optional: clear table
            cur.execute("TRUNCATE incidents RESTART IDENTITY;")

            rows = [make_row() for _ in range(N_ROWS)]
            cur.executemany(
                """
                INSERT INTO incidents
                (occurred_at, sector, direction, event_type, intensity, source, summary)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
                """,
                rows,
            )
        print(f"Seeded {N_ROWS} rows.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
