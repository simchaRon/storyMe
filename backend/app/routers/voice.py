from fastapi import APIRouter, Depends, HTTPException, status

from ..models import User
from ..security import get_current_user

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/clone")
def clone_voice(_: User = Depends(get_current_user)):
    """Hook for a future voice-cloning provider. Not built yet."""
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Voice cloning is not available yet")
