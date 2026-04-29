from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.core.config import settings
from app.models.work_order import WorkOrderAttachment


ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


async def validate_work_order_photos(photos: list[UploadFile]) -> None:
    if not photos:
        return
    if len(photos) > settings.MAX_WORK_ORDER_PHOTOS:
        raise HTTPException(status_code=422, detail=f"Upload up to {settings.MAX_WORK_ORDER_PHOTOS} photos")

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    for photo in photos:
        content_type = (photo.content_type or "").lower()
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=422, detail="Only JPG, PNG, or WebP photos are allowed")
        contents = await photo.read()
        if len(contents) > max_bytes:
            raise HTTPException(status_code=422, detail=f"Each photo must be {settings.MAX_UPLOAD_MB} MB or smaller")
        await photo.seek(0)


async def save_work_order_photos(work_order_id: int, photos: list[UploadFile]) -> list[WorkOrderAttachment]:
    if not photos:
        return []
    if len(photos) > settings.MAX_WORK_ORDER_PHOTOS:
        raise HTTPException(status_code=422, detail=f"Upload up to {settings.MAX_WORK_ORDER_PHOTOS} photos")

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    upload_root = Path(settings.UPLOAD_DIR).resolve()
    work_order_dir = upload_root / "work-orders" / str(work_order_id)
    work_order_dir.mkdir(parents=True, exist_ok=True)

    attachments: list[WorkOrderAttachment] = []
    for photo in photos:
        content_type = (photo.content_type or "").lower()
        extension = ALLOWED_IMAGE_TYPES.get(content_type)
        if not extension:
            raise HTTPException(status_code=422, detail="Only JPG, PNG, or WebP photos are allowed")

        contents = await photo.read()
        if len(contents) > max_bytes:
            raise HTTPException(status_code=422, detail=f"Each photo must be {settings.MAX_UPLOAD_MB} MB or smaller")

        filename = f"{uuid4().hex}{extension}"
        target = work_order_dir / filename
        target.write_bytes(contents)

        attachments.append(WorkOrderAttachment(
            work_order_id=work_order_id,
            file_url=f"/uploads/work-orders/{work_order_id}/{filename}",
            original_filename=Path(photo.filename or "photo").name[:255],
            content_type=content_type,
            file_size=len(contents),
        ))

    return attachments
