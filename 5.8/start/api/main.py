from __future__ import annotations

from datetime import datetime, date, timedelta
from typing import Optional, Any, Dict, List, Tuple

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api.db import get_conn


app = FastAPI(title="Operatyvnyi Dashboard API (sync, raw SQL)")

# CORS "allow all" щоб web міг викликати API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# Helpers
# -----------------------------
ALLOWED_SORT_FIELDS = {"id", "occurred_at", "sector", "direction", "event_type", "intensity"}
ALLOWED_ORDER = {"asc", "desc"}


def parse_ymd(s: Optional[str], name: str) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid '{name}'. Use YYYY-MM-DD")


def build_where(
    *,
    from_: Optional[str],
    to: Optional[str],
    sector: Optional[str],
    direction: Optional[str],
    event_type: Optional[str],
    min_intensity: Optional[int],
) -> Tuple[str, List[Any]]:
    where: List[str] = []
    values: List[Any] = []

    d_from = parse_ymd(from_, "from")
    d_to = parse_ymd(to, "to")

    if d_from:
        where.append("occurred_at >= %s")
        values.append(d_from)

    if d_to:
        # inclusive "to" by using < (to + 1 day)
        where.append("occurred_at < %s")
        values.append(d_to + timedelta(days=1))

    if sector:
        where.append("sector = %s")
        values.append(sector)

    if direction:
        where.append("direction = %s")
        values.append(direction)

    if event_type:
        where.append("event_type = %s")
        values.append(event_type)

    if min_intensity is not None:
        where.append("intensity >= %s")
        values.append(int(min_intensity))

    if where:
        return " WHERE " + " AND ".join(where), values
    return "", values


def ts_to_str(x: Any) -> Optional[str]:
    if x is None:
        return None
    # psycopg2 дає datetime
    try:
        return x.isoformat(sep=" ", timespec="seconds")
    except Exception:
        return str(x)


# -----------------------------
# Endpoints
# -----------------------------
@app.get("/")
def root():
    return {"message": "Operatyvnyi Dashboard API. See /docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/filters")
def filters():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT DISTINCT sector FROM incidents ORDER BY sector;")
        sectors = [r[0] for r in cur.fetchall()]

        cur.execute("SELECT DISTINCT direction FROM incidents ORDER BY direction;")
        directions = [r[0] for r in cur.fetchall()]

        cur.execute("SELECT DISTINCT event_type FROM incidents ORDER BY event_type;")
        event_types = [r[0] for r in cur.fetchall()]

        cur.execute("SELECT MIN(occurred_at), MAX(occurred_at) FROM incidents;")
        mn, mx = cur.fetchone()

    return {
        "sectors": sectors,
        "directions": directions,
        "event_types": event_types,
        "min_date": mn.date().isoformat() if mn else None,
        "max_date": mx.date().isoformat() if mx else None,
    }


@app.get("/kpi")
def kpi(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
    sector: Optional[str] = None,
    direction: Optional[str] = None,
    event_type: Optional[str] = None,
    min_intensity: Optional[int] = Query(None, ge=1),
):
    where_sql, values = build_where(
        from_=from_,
        to=to,
        sector=sector,
        direction=direction,
        event_type=event_type,
        min_intensity=min_intensity,
    )

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT
              COUNT(*)::int AS total_incidents,
              COALESCE(SUM(intensity), 0)::int AS total_intensity,
              COALESCE(AVG(intensity), 0)::float AS avg_intensity
            FROM incidents
            {where_sql}
            """,
            values,
        )
        total_incidents, total_intensity, avg_intensity = cur.fetchone()

        cur.execute(
            f"""
            SELECT direction, COUNT(*)::int AS c
            FROM incidents
            {where_sql}
            GROUP BY direction
            ORDER BY c DESC, direction ASC
            LIMIT 1
            """,
            values,
        )
        row = cur.fetchone()
        top_direction = row[0] if row else None

    return {
        "total_incidents": total_incidents,
        "total_intensity": total_intensity,
        "avg_intensity": round(float(avg_intensity), 2),
        "top_direction": top_direction,
    }


@app.get("/trend")
def trend(
    group: str = "day",
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
    sector: Optional[str] = None,
    direction: Optional[str] = None,
    event_type: Optional[str] = None,
    min_intensity: Optional[int] = Query(None, ge=1),
):
    if group not in ("day", "week"):
        raise HTTPException(status_code=400, detail="group must be day|week")

    where_sql, values = build_where(
        from_=from_,
        to=to,
        sector=sector,
        direction=direction,
        event_type=event_type,
        min_intensity=min_intensity,
    )

    t_expr = "DATE(occurred_at)" if group == "day" else "DATE_TRUNC('week', occurred_at)::date"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT {t_expr} AS t, COUNT(*)::int AS value
            FROM incidents
            {where_sql}
            GROUP BY t
            ORDER BY t
            """,
            values,
        )
        rows = cur.fetchall()

    return [{"t": r[0].isoformat(), "value": r[1]} for r in rows]


@app.get("/distribution/directions")
def distribution_directions(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
    sector: Optional[str] = None,
    direction: Optional[str] = None,
    event_type: Optional[str] = None,
    min_intensity: Optional[int] = Query(None, ge=1),
):
    where_sql, values = build_where(
        from_=from_,
        to=to,
        sector=sector,
        direction=direction,
        event_type=event_type,
        min_intensity=min_intensity,
    )

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT direction AS label, COUNT(*)::int AS value
            FROM incidents
            {where_sql}
            GROUP BY direction
            ORDER BY value DESC, label ASC
            """,
            values,
        )
        rows = cur.fetchall()

    return [{"label": r[0], "value": r[1]} for r in rows]


@app.get("/distribution/types")
def distribution_types(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
    sector: Optional[str] = None,
    direction: Optional[str] = None,
    event_type: Optional[str] = None,
    min_intensity: Optional[int] = Query(None, ge=1),
):
    where_sql, values = build_where(
        from_=from_,
        to=to,
        sector=sector,
        direction=direction,
        event_type=event_type,
        min_intensity=min_intensity,
    )

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT event_type AS label, COUNT(*)::int AS value
            FROM incidents
            {where_sql}
            GROUP BY event_type
            ORDER BY value DESC, label ASC
            """,
            values,
        )
        rows = cur.fetchall()

    return [{"label": r[0], "value": r[1]} for r in rows]


@app.get("/heatmap")
def heatmap(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
    sector: Optional[str] = None,
    direction: Optional[str] = None,
    event_type: Optional[str] = None,
    min_intensity: Optional[int] = Query(None, ge=1),
):
    """
    sector × week (COUNT)
    -> { columns:[week_labels], rows:[{ sector, values:[...] }] }
    """
    where_sql, values = build_where(
        from_=from_,
        to=to,
        sector=sector,
        direction=direction,
        event_type=event_type,
        min_intensity=min_intensity,
    )

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT
              sector,
              DATE_TRUNC('week', occurred_at)::date AS wk,
              COUNT(*)::int AS c
            FROM incidents
            {where_sql}
            GROUP BY sector, wk
            ORDER BY sector, wk
            """,
            values,
        )
        rows = cur.fetchall()

    # rows: [(sector, wk_date, count), ...]
    weeks_sorted = sorted({r[1] for r in rows})
    columns = [w.isoformat() for w in weeks_sorted]

    # map sector -> {wk -> count}
    sector_map: Dict[str, Dict[date, int]] = {}
    for sec, wk, c in rows:
        sector_map.setdefault(sec, {})[wk] = c

    sectors_sorted = sorted(sector_map.keys())
    out_rows = []
    for sec in sectors_sorted:
        wk_counts = sector_map[sec]
        values_list = [wk_counts.get(w, 0) for w in weeks_sorted]
        out_rows.append({"sector": sec, "values": values_list})

    return {"columns": columns, "rows": out_rows}


@app.get("/incidents")
def incidents_list(
    # dashboard filters
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
    sector: Optional[str] = None,
    direction: Optional[str] = None,
    event_type: Optional[str] = None,
    min_intensity: Optional[int] = Query(None, ge=1),
    # paging + sorting
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
    sort: str = Query("occurred_at"),
    order: str = Query("desc"),
):
    sort = sort.strip()
    order = order.strip().lower()

    if sort not in ALLOWED_SORT_FIELDS:
        raise HTTPException(status_code=400, detail=f"sort must be one of {sorted(ALLOWED_SORT_FIELDS)}")
    if order not in ALLOWED_ORDER:
        raise HTTPException(status_code=400, detail="order must be asc|desc")

    where_sql, values = build_where(
        from_=from_,
        to=to,
        sector=sector,
        direction=direction,
        event_type=event_type,
        min_intensity=min_intensity,
    )

    offset = (page - 1) * page_size

    with get_conn() as conn, conn.cursor() as cur:
        # total
        cur.execute(
            f"SELECT COUNT(*)::int FROM incidents {where_sql}",
            values,
        )
        total = cur.fetchone()[0]

        # items
        cur.execute(
            f"""
            SELECT id, occurred_at, sector, direction, event_type, intensity, source, summary
            FROM incidents
            {where_sql}
            ORDER BY {sort} {order}, id DESC
            LIMIT %s OFFSET %s
            """,
            values + [page_size, offset],
        )
        rows = cur.fetchall()

    items = []
    for r in rows:
        items.append(
            {
                "id": r[0],
                "occurred_at": ts_to_str(r[1]),
                "sector": r[2],
                "direction": r[3],
                "event_type": r[4],
                "intensity": r[5],
                "source": r[6],
                "summary": r[7],
            }
        )

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@app.get("/incidents/{incident_id}")
def incident_detail(incident_id: int):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, occurred_at, sector, direction, event_type, intensity, source, summary
            FROM incidents
            WHERE id = %s
            """,
            [incident_id],
        )
        r = cur.fetchone()

    if not r:
        raise HTTPException(status_code=404, detail="Incident not found")

    return {
        "id": r[0],
        "occurred_at": ts_to_str(r[1]),
        "sector": r[2],
        "direction": r[3],
        "event_type": r[4],
        "intensity": r[5],
        "source": r[6],
        "summary": r[7],
    }
