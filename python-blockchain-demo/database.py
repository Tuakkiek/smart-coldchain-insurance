import os
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env", override=True)

MYSQL_HOST = os.getenv("MYSQL_HOST")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE")
MYSQL_USER = os.getenv("MYSQL_USER")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD")

MYSQL_SSL_CA = os.getenv("MYSQL_SSL_CA", "certs/ca.pem")

CA_PATH = (BASE_DIR / MYSQL_SSL_CA).resolve()

def get_db_connection(): 

    connection = mysql.connector.connect(
        host = MYSQL_HOST, 
        port = MYSQL_PORT, 
        user = MYSQL_USER, 
        password = MYSQL_PASSWORD, 
        database = MYSQL_DATABASE,

        charset="utf8mb4",

        ssl_ca=str(CA_PATH),
        ssl_verify_cert=True,
        ssl_verify_identity=True,

        connection_timeout=15
    )

    return connection

