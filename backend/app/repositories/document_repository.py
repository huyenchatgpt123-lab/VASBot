from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import asc, desc

from app.models.document import Document


class DocumentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, doc_id: int) -> Optional[Document]:
        return self.db.query(Document).filter(Document.id == doc_id).first()

    def get_all(self) -> List[Document]:
        return self.db.query(Document).order_by(Document.created_at.desc()).all()

    def get_paginated(
        self,
        search: Optional[str] = None,
        sort_by: str = "created_at",
        order: str = "desc",
        page: int = 1,
        page_size: int = 20,
        department: Optional[str] = None,
        month: Optional[int] = None,
        school_year: Optional[str] = None,
    ) -> Tuple[List[Document], int]:
        query = self.db.query(Document)

        if search:
            query = query.filter(Document.filename.ilike(f"%{search}%"))
        if department:
            query = query.filter(Document.department == department)
        if month is not None:
            query = query.filter(Document.month == month)
        if school_year:
            query = query.filter(Document.school_year == school_year)

        sort_column = getattr(Document, sort_by, Document.created_at)
        order_func = desc if order == "desc" else asc
        query = query.order_by(order_func(sort_column))

        total = query.count()
        docs = query.offset((page - 1) * page_size).limit(page_size).all()
        return docs, total

    def create(
        self, filename: str, filepath: str, uploaded_by: int, page_count: int,
        department: str = None, month: int = None, school_year: str = None,
    ) -> Document:
        doc = Document(
            filename=filename,
            filepath=filepath,
            uploaded_by=uploaded_by,
            page_count=page_count,
            department=department,
            month=month,
            school_year=school_year,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def delete(self, doc_id: int) -> bool:
        doc = self.get_by_id(doc_id)
        if not doc:
            return False
        self.db.delete(doc)
        self.db.commit()
        return True

    def count(self) -> int:
        return self.db.query(Document).count()

    def total_pages(self) -> int:
        result = self.db.query(Document).all()
        return sum(d.page_count for d in result)
