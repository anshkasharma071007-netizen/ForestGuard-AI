"""Index Indian mobile identities while preserving historical account ownership."""

import re
from collections import defaultdict

import phonenumbers
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def _historical_mobile(value: str) -> str | None:
    if not re.fullmatch(r"[+0-9 ().-]+", value):
        return None
    try:
        parsed = phonenumbers.parse(value, "IN")
    except phonenumbers.NumberParseException:
        return None
    canonical = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    mobile_types = {phonenumbers.PhoneNumberType.MOBILE, phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE,
                    phonenumbers.PhoneNumberType.UNKNOWN}
    if not parsed.extension and re.fullmatch(r"\+91[6-9][0-9]{9}", canonical) and phonenumbers.number_type(parsed) in mobile_types:
        return canonical
    return None


def upgrade():
    op.add_column("citizens", sa.Column("normalized_phone", sa.String(13)))
    citizens = sa.table("citizens", sa.column("id"), sa.column("phone"), sa.column("normalized_phone"))
    connection = op.get_bind()
    groups = defaultdict(list)
    for citizen in connection.execute(sa.select(citizens.c.id, citizens.c.phone)).all():
        if phone := _historical_mobile(citizen.phone):
            groups[phone].append(citizen.id)
    for phone, ids in groups.items():
        values = {"normalized_phone": phone}
        if len(ids) == 1:
            values["phone"] = phone
        connection.execute(citizens.update().where(citizens.c.id.in_(ids)).values(**values))
    op.create_index("ix_citizens_normalized_phone", "citizens", ["normalized_phone"])


def downgrade():
    op.drop_index("ix_citizens_normalized_phone", table_name="citizens")
    op.drop_column("citizens", "normalized_phone")
