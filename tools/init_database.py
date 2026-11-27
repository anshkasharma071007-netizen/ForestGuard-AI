"""Initialize or upgrade a local Forest Guard PostgreSQL development database."""

from __future__ import annotations

import argparse
import getpass
import os
import re
import secrets
import warnings
from pathlib import Path

import psycopg
from alembic import command
from alembic.config import Config
from alembic.util import CommandError
from psycopg import sql
from sqlalchemy import text
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.config import ROOT
from backend.database.session import Base, create_database_engine
from backend.models import entities  # noqa: F401 - register application tables

ROOT = Path(ROOT)


def identifier(value):
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", value) or value.startswith("pg_"):
        raise argparse.ArgumentTypeError("Use a lowercase PostgreSQL name (letters, digits, underscores)")
    return value


def ask_password(prompt):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            return getpass.getpass(prompt)
    except (EOFError, getpass.GetPassWarning):
        raise ValueError("Use an interactive terminal for password prompts or configure libpq credentials.") from None


def check_role(conn, name):
    role = conn.execute(
        """
        SELECT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR
                   rolreplication OR rolbypassrls OR rolinherit),
               EXISTS (SELECT FROM pg_auth_members WHERE member = pg_roles.oid)
        FROM pg_roles WHERE rolname = %s
        """, (name,),
    ).fetchone()
    if role and role != (True, False):
        raise ValueError("The existing application role has incompatible privileges or memberships.")
    return role is not None


def write_private(path, content):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(content)


def check_passfile(path):
    if not path.is_file() or path.is_symlink():
        raise ValueError("The runtime passfile must be a regular file.")
    if os.name != "nt" and path.stat().st_mode & 0o077:
        raise ValueError("Set the runtime passfile permissions to 0600.")


def provision(args, admin, passfile):
    with psycopg.connect(dbname=args.maintenance_db, autocommit=True, **admin) as conn:
        # Serialize provisioning on the same maintenance DB, including nontransactional CREATE DATABASE.
        conn.execute("SELECT pg_advisory_lock(hashtext('forest-guard-local-setup'))")
        owner = conn.execute("SELECT current_user").fetchone()[0]
        if owner == args.app_user:
            raise ValueError("Use different owner and application logins.")
        exists = check_role(conn, args.app_user)
        database = conn.execute(
            "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = %s", (args.database,)
        ).fetchone()
        if database and database[0] != owner:
            raise ValueError("Connect as the existing database owner or choose another database name.")

        password = None
        if not exists:
            if passfile.exists():
                raise ValueError("A passfile already exists for a missing role. Choose another --passfile.")
            password = secrets.token_urlsafe(32)
            verifier = conn.pgconn.encrypt_password(password.encode(), args.app_user.encode(), b"scram-sha-256")
            conn.execute(sql.SQL(
                "CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT "
                "NOREPLICATION NOBYPASSRLS PASSWORD {}"
            ).format(sql.Identifier(args.app_user), sql.Literal(verifier.decode())))
            save_passfile(args, passfile, password)
            password = None
        elif not passfile.exists():
            password = ask_password("Existing application role password: ")
            if not password or "\n" in password or "\r" in password:
                raise ValueError("Provide a password that can be stored in a libpq passfile.")

        if not database:
            conn.execute(sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(sql.Identifier(args.database)))
        # Keep the lock for migrations and grant setup as well.
        migrate(args, admin)
        return password


def save_passfile(args, passfile, password):
    escaped = password.replace("\\", "\\\\").replace(":", "\\:")
    host = args.host.replace(":", "\\:")
    write_private(passfile, f"{host}:{args.port}:{args.database}:{args.app_user}:{escaped}\n")


def migrate(args, admin):
    owner_url = URL.create("postgresql+psycopg", username=args.admin_user, password=admin.get("password"),
                           host=args.host, port=args.port, database=args.database)
    database = create_database_engine(owner_url.update_query_dict({"options": "-csearch_path=public", "connect_timeout": "5"}))
    app_role = sql.Identifier(args.app_user)
    try:
        with database.connect() as connection:
            with connection.begin():
                check_database_layout(connection)
                prepare_schema(args, connection, app_role)
    finally:
        database.dispose()


def postgis_schema(connection):
    return connection.scalar(text("""
        SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = 'postgis'
    """))


def check_database_layout(connection):
    schemas = set(connection.exec_driver_sql("""
        SELECT nspname FROM pg_namespace
        WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
    """).scalars())
    tables = set(connection.exec_driver_sql(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    ).scalars())
    spatial = postgis_schema(connection)
    if spatial == "public":
        tables.discard("spatial_ref_sys")
    allowed_schemas = {"public", spatial} if spatial else {"public"}
    allowed_tables = Base.metadata.tables.keys() | {"alembic_version"}
    if schemas != allowed_schemas or tables - allowed_tables or (tables and "alembic_version" not in tables):
        raise ValueError("Choose an empty database or an existing dedicated Forest Guard Alembic database.")


def prepare_schema(args, connection, app_role):
    spatial = postgis_schema(connection)
    if spatial is None:
        if not connection.scalar(text("SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'")):
            raise ValueError("Install the PostGIS extension for the local PostgreSQL server before migrating.")
        connection.exec_driver_sql("CREATE EXTENSION postgis WITH SCHEMA public")
        spatial = "public"
    alembic = Config(str(ROOT / "alembic.ini"))
    alembic.attributes["connection"] = connection
    command.upgrade(alembic, "head")
    command.check(alembic)

    name = sql.Identifier(args.database)
    connection.exec_driver_sql(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(name).as_string())
    connection.exec_driver_sql(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(name, app_role).as_string())
    connection.exec_driver_sql("REVOKE ALL ON SCHEMA public FROM PUBLIC")
    connection.exec_driver_sql(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(app_role).as_string())
    if spatial != "public":
        connection.exec_driver_sql(sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(
            sql.Identifier(spatial), app_role,
        ).as_string())
    for table in Base.metadata.sorted_tables:
        qualified = sql.Identifier("public", table.name)
        connection.exec_driver_sql(sql.SQL(
            "GRANT SELECT, INSERT, UPDATE, DELETE ON {} TO {}"
        ).format(qualified, app_role).as_string())
        if "id" not in table.c:
            continue  # Composite-key tables such as report_reads have no id sequence.
        sequence = connection.scalar(text("""
            SELECT seq.relname FROM pg_class AS seq
            WHERE seq.oid = pg_get_serial_sequence(:table, 'id')::regclass
        """), {"table": f"public.{table.name}"})
        if sequence:
            connection.exec_driver_sql(sql.SQL("GRANT USAGE, SELECT ON SEQUENCE {} TO {}").format(
                sql.Identifier("public", sequence), app_role
            ).as_string())
    connection.exec_driver_sql(sql.SQL(
        "REVOKE ALL ON public.alembic_version FROM {}"
    ).format(app_role).as_string())
    connection.exec_driver_sql(sql.SQL(
        "GRANT SELECT ON public.alembic_version TO {}"
    ).format(app_role).as_string())


def verify(runtime_url, passfile, password=None):
    database = create_database_engine(runtime_url.set(password=password).update_query_dict({
        "passfile": passfile.as_posix(), "connect_timeout": "5",
    }))
    try:
        with Session(database) as session:
            identity = session.execute(text(
                "SELECT current_user, current_database(), current_schema(), "
                "has_schema_privilege('public','CREATE'), "
                "has_table_privilege('public.alembic_version','UPDATE')"
            )).one()
            if identity != (runtime_url.username, runtime_url.database, "public", False, False):
                raise ValueError("The runtime connection has an unexpected identity, search path or privileges.")
            for table in Base.metadata.sorted_tables:
                session.execute(table.select().limit(0))
                grants = session.execute(text("""
                    SELECT bool_and(has_table_privilege(:name, privilege))
                    FROM unnest(ARRAY['INSERT','UPDATE','DELETE']) AS privilege
                """), {"name": f"public.{table.name}"}).scalar_one()
                if not grants:
                    raise ValueError(f"Runtime write permissions are incomplete for {table.name}.")
    finally:
        database.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=("127.0.0.1", "localhost", "::1"), default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--admin-user", default="postgres")
    parser.add_argument("--maintenance-db", type=identifier, default="postgres")
    parser.add_argument("--database", type=identifier, default="forest_guard_ai")
    parser.add_argument("--app-user", type=identifier, default="forest_guard_app")
    parser.add_argument("--passfile", type=Path)
    parser.add_argument("--use-libpq", action="store_true", help="Use the existing libpq login instead of prompting")
    parser.add_argument("--no-env", action="store_true", help="Skip creation of a missing .env")
    args = parser.parse_args()
    if args.database in {args.maintenance_db, "postgres", "template0", "template1"}:
        parser.error("Choose a dedicated application database.")
    if not 0 < args.port < 65536:
        parser.error("Port must be in the range 1–65535.")

    local = ROOT / ".forest-guard-local"
    local.mkdir(mode=0o700, exist_ok=True)
    passfile = (args.passfile or local / f"{args.database}-{args.app_user}.pgpass").absolute()
    if passfile.exists() or passfile.is_symlink():
        check_passfile(passfile)
    elif not passfile.parent.is_dir():
        parser.error("The --passfile parent directory must exist.")
    admin = {"host": args.host, "port": args.port, "user": args.admin_user, "connect_timeout": 5}
    if not args.use_libpq:
        password = ask_password("PostgreSQL owner password (Enter to use libpq defaults): ")
        if password:
            admin["password"] = password
    existing_password = provision(args, admin, passfile)

    runtime_url = URL.create("postgresql+psycopg", username=args.app_user, host=args.host,
                             port=args.port, database=args.database)
    verify(runtime_url, passfile, existing_password)
    if existing_password is not None:
        save_passfile(args, passfile, existing_password)
    print(f"{args.database} is at Alembic head and the backend database connection passed as {args.app_user}.")
    settings = f'DATABASE_URL={runtime_url}\nPGPASSFILE="{passfile.as_posix()}"'
    envfile = ROOT / ".env"
    if not args.no_env:
        template = (ROOT / ".env.example").read_text(encoding="utf-8")
        # Keep other example settings, and generate the token-signing secret for this checkout.
        lines = [line for line in template.splitlines() if not line.startswith(("DATABASE_URL=", "SECRET_KEY="))]
        lines.extend((f"SECRET_KEY={secrets.token_urlsafe(32)}", settings))
        try:
            write_private(envfile, "\n".join(lines) + "\n")
        except FileExistsError:
            print("Existing .env preserved. Use these settings for this database:")
        else:
            print("Created .env with the verified runtime settings.")
            return
    print(settings)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, psycopg.Error, SQLAlchemyError, CommandError) as exc:
        # Avoid printing SQL statements or driver parameters containing credentials.
        message = str(exc) if isinstance(exc, (ValueError, CommandError)) else type(exc).__name__
        if isinstance(exc, (psycopg.OperationalError, SQLAlchemyError)):
            message += ". Check the local server, port, role privileges, and login credentials."
        if isinstance(exc, psycopg.Error) and exc.diag.message_primary and not isinstance(exc, psycopg.OperationalError):
            message = exc.diag.message_primary
        raise SystemExit(f"Database setup failed. {message}") from None
