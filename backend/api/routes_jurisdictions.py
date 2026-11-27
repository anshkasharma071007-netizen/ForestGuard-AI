import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, StringConstraints, model_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.api.deps import hash_password, require_admin
from backend.database.session import get_db
from backend.models import User
from backend.models.entities import AuthorityJurisdiction, Jurisdiction
from backend.services.geography import jurisdiction_label, lock_routing, postgis, reroute_unassigned

router = APIRouter(prefix="/api/authority", tags=["jurisdictions"], dependencies=[Depends(require_admin)])
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120,
                                         pattern=r"^[^\x00-\x1f\x7f]+$")]
Position = tuple[Annotated[float, Field(ge=-180, le=180)], Annotated[float, Field(ge=-90, le=90)]]
Ring = Annotated[list[Position], Field(min_length=4, max_length=20000)]
Polygon = Annotated[list[Ring], Field(min_length=1, max_length=100)]


class Boundary(BaseModel):
    type: Literal["Polygon", "MultiPolygon"]
    coordinates: Polygon | Annotated[list[Polygon], Field(min_length=1, max_length=100)]

    @model_validator(mode="after")
    def validate_rings(self):
        polygons = [self.coordinates] if self.type == "Polygon" else self.coordinates
        for polygon in polygons:
            for ring in polygon:
                if (not isinstance(ring[0], tuple) or ring[0] != ring[-1] or len(set(ring[:-1])) < 3):
                    raise ValueError("Use closed GeoJSON polygon rings with at least three distinct positions.")
        if self.type == "MultiPolygon" and isinstance(self.coordinates[0][0], tuple):
            raise ValueError("Use a list of polygons for MultiPolygon.")
        return self


class JurisdictionInput(BaseModel):
    name: Name
    priority: int = Field(default=100, ge=0, le=10000)
    boundary: Boundary


class Assignments(BaseModel):
    jurisdiction_ids: set[Annotated[int, Field(gt=0)]] = Field(max_length=100)


class OfficerInput(Assignments):
    name: Name
    email: Annotated[EmailStr, Field(max_length=180)]
    password: str = Field(min_length=12, max_length=128)
    role: Literal["range_officer", "guard"]


def add_jurisdiction(db, data, *, demo=False):
    boundary = data.boundary.model_dump(mode="json")
    if db.get_bind().dialect.name == "postgresql":
        spatial = postgis(db)
        shape = spatial.ST_GeomFromGeoJSON(json.dumps(boundary))
        if not db.scalar(select(spatial.ST_IsValid(shape))):
            raise HTTPException(422, "The jurisdiction boundary is not a valid polygon.")
    lock_routing(db)
    jurisdiction = Jurisdiction(name=data.name, priority=data.priority, boundary=boundary, is_demo=demo)
    db.add(jurisdiction)
    db.flush()
    reroute_unassigned(db, demo=demo)
    return jurisdiction


def replace_assignments(db, user, ids):
    found = set(db.scalars(select(Jurisdiction.id).where(Jurisdiction.id.in_(ids))))
    if found != set(ids):
        raise HTTPException(422, "One or more jurisdictions do not exist.")
    db.execute(delete(AuthorityJurisdiction).where(AuthorityJurisdiction.user_id == user.id))
    db.add_all(AuthorityJurisdiction(user_id=user.id, jurisdiction_id=jurisdiction_id) for jurisdiction_id in ids)


def commit(db):
    try:
        db.commit()
    except IntegrityError:
        raise HTTPException(409, "That name or email is already in use.") from None


@router.get("/jurisdictions")
def list_jurisdictions(db: Session = Depends(get_db)):
    jurisdictions = db.scalars(select(Jurisdiction).order_by(Jurisdiction.name))
    return {"items": [{**jurisdiction_label(item), "priority": item.priority, "boundary": item.boundary}
                      for item in jurisdictions]}


@router.post("/jurisdictions", status_code=201)
def create_jurisdiction(payload: JurisdictionInput, db: Session = Depends(get_db)):
    try:
        jurisdiction = add_jurisdiction(db, payload)
        commit(db)
    except IntegrityError:
        raise HTTPException(409, "That jurisdiction name is already in use.") from None
    return jurisdiction_label(jurisdiction)


@router.get("/officers")
def list_officers(db: Session = Depends(get_db)):
    users = db.scalars(select(User).where(User.role.in_(("range_officer", "guard"))).order_by(User.name))
    assignments = {}
    for user_id, jurisdiction_id in db.execute(select(AuthorityJurisdiction.user_id, AuthorityJurisdiction.jurisdiction_id)):
        assignments.setdefault(user_id, []).append(jurisdiction_id)
    return {"items": [{"id": user.id, "name": user.name, "email": user.email, "role": user.role,
                      "jurisdiction_ids": assignments.get(user.id, [])} for user in users]}


@router.post("/officers", status_code=201)
def create_officer(payload: OfficerInput, db: Session = Depends(get_db)):
    user = User(name=payload.name, email=payload.email.lower(), password_hash=hash_password(payload.password),
                role=payload.role)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        raise HTTPException(409, "That email is already in use.") from None
    replace_assignments(db, user, payload.jurisdiction_ids)
    commit(db)
    return {"id": user.id}


@router.put("/officers/{user_id}/jurisdictions")
def assign_officer(user_id: int, payload: Assignments, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not user or user.role not in {"range_officer", "guard"}:
        raise HTTPException(404, "Officer not found.")
    replace_assignments(db, user, payload.jurisdiction_ids)
    commit(db)
    return {"jurisdiction_ids": sorted(payload.jurisdiction_ids)}
