"""SQLAlchemy engine and request-scoped sessions."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, URL, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(database_url: str | URL) -> Engine:
    url = make_url(database_url)
    dialect = url.get_backend_name()
    connect_args = {"check_same_thread": False} if dialect == "sqlite" else {}
    if dialect == "mysql":
        ca_path = url.query.get("ssl_ca")
        # The service URI requires TLS. A project CA enables certificate and
        # hostname verification; without it, encryption is still mandatory.
        connect_args = {
            "ssl": (
                {"ca": ca_path, "check_hostname": True, "verify_mode": "required"}
                if ca_path else {"verify_mode": "none"}
            ),
            "connect_timeout": 10,
            "read_timeout": 10,
            "write_timeout": 10,
        }
        if ca_path:
            url = url.set(query={key: value for key, value in url.query.items() if key != "ssl_ca"})
    engine = create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=dialect == "mysql",
        pool_recycle=1800 if dialect == "mysql" else -1,
    )
    if dialect == "sqlite":
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session
