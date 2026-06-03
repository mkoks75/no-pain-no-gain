import os
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://npng:verander_dit@localhost:5437/npng"
)

def get_conn():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
