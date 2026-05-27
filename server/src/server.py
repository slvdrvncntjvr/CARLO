# -*- coding: utf-8 -*-
"""
Agora Agent & Token Service

HTTP APIs:
- GET  /get_config     -> Agent.generate_config()
- POST /startAgent     -> Agent.start()
- POST /stopAgent      -> Agent.stop()
- GET  /api/inventory  -> Get all cars
- POST /api/inventory -> Add a new car
- GET  /api/leads      -> Get CRM leads
- GET  /api/calls      -> Get call history
- POST /api/webhook/agent -> Agora agent stop webhook
"""
import logging
import os
import random
import time
from typing import Any, Dict, Optional
from dotenv import load_dotenv

# Load environment variables from .env.local or .env
_base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_base_dir, '.env.local'), override=True)
load_dotenv(os.path.join(_base_dir, '.env'), override=True)

from fastapi import APIRouter, FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agora_agent.agentkit.token import generate_convo_ai_token
from agent import Agent

from database import (
    init_db,
    get_all_cars,
    get_car_by_id,
    add_car,
    create_lead,
    create_call,
    get_all_leads,
    get_all_calls,
    get_db_connection
)
from summarizer import generate_summary

logger = logging.getLogger("uvicorn.error")


def _log_route_error(route: str, exc: Exception, **context) -> None:
    """Log route failures with safe request context and a traceback."""
    safe_context = {key: value for key, value in context.items() if value is not None}
    logger.exception(
        "Request failed route=%s context=%s error_type=%s error=%s",
        route,
        safe_context,
        type(exc).__name__,
        exc,
    )


def _to_http_error(exc: Exception) -> HTTPException:
    """Convert SDK exceptions to HTTP errors"""
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, RuntimeError):
        return HTTPException(status_code=500, detail=str(exc))
    return HTTPException(status_code=500, detail=f"Internal error: {exc}")

try:
    agent = Agent()
except ValueError as e:
    logger.exception(
        "Failed to initialize Agora Agent SDK. Service will fail if endpoints are called without proper configuration: %s",
        e,
    )
    agent = None


# FastAPI application
app = FastAPI(
    title="Agora Agent & Token Service",
    version="2.0.0",
    description="Agora Conversational AI service",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter()


# Request models
class StartAgentRequest(BaseModel):
    """Request body for POST /startAgent"""
    channelName: str
    rtcUid: int
    userUid: int
    parameters: Optional[Dict[str, Any]] = None


class StopAgentRequest(BaseModel):
    """Request body for POST /stopAgent"""
    agentId: str


class CarCreateRequest(BaseModel):
    """Request body for POST /api/inventory"""
    make: str
    model: str
    year: int
    color: str
    mileage: int
    transmission: str
    fuel_type: str
    condition: str
    asking_price: float
    floor_price: float
    location: str
    registration_expiry: str
    accident_free: int  # 0 = No, 1 = Yes
    status: Optional[str] = "available"


# Background processor for call summary and lead generation
async def process_call_summary(agent_id: str):
    logger.info("Processing call summary for agent_id=%s", agent_id)
    try:
        # Retrieve the car_id and start time from the database
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT car_id, strftime('%s', created_at) FROM calls WHERE session_id = ?", (agent_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            logger.warning("No call record found in database for agent_id=%s", agent_id)
            return
            
        car_id, start_timestamp = row
        start_timestamp = int(start_timestamp) if start_timestamp else int(time.time())
        duration = int(time.time()) - start_timestamp
        if duration < 0:
            duration = 0
        
        # Fetch transcript from Agora
        transcript = await agent.get_history(agent_id)
        if not transcript or not transcript.strip():
            logger.info("Transcript is empty for agent_id=%s. Call might have been dropped.", agent_id)
            return
            
        # Get car details
        car = get_car_by_id(car_id) if car_id else None
        
        # Generate summary using Claude (or fallback)
        summary_data = await generate_summary(transcript, car)
        
        # Create lead entry
        lead_id = create_lead(
            buyer_name=summary_data.get("buyer_name"),
            buyer_phone=summary_data.get("buyer_phone"),
            car_id=car_id,
            final_offer=summary_data.get("final_offer"),
            outcome=summary_data.get("outcome", "Negotiating"),
            lead_score=summary_data.get("lead_score", "Warm"),
            summary=summary_data.get("summary", "")
        )
        logger.info("Created lead id=%s for agent_id=%s", lead_id, agent_id)
        
        # Update the call log with duration and transcript
        create_call(session_id=agent_id, car_id=car_id, duration=duration, transcript=transcript)
        logger.info("Updated call log for agent_id=%s with duration=%ss", agent_id, duration)
        
    except Exception as e:
        logger.exception("Error processing call summary for agent_id=%s: %s", agent_id, e)


# API endpoints
def _generate_channel_name() -> str:
    return f"ai-conversation-{int(time.time())}-{random.randint(1000, 9999)}"


@router.get("/get_config")
async def get_config(
    channel: Optional[str] = Query(default=None),
    uid: Optional[int] = Query(default=None),
):
    """Generate connection configuration"""
    if agent is None:
        raise HTTPException(
            status_code=500,
            detail="Service not properly configured. Please check environment variables.",
        )

    try:
        user_uid = random.randint(1000, 9999999) if uid is None or uid <= 0 else uid
        agent_uid = str(random.randint(10000000, 99999999))
        channel_name = channel or _generate_channel_name()

        app_id = os.getenv("AGORA_APP_ID")
        app_certificate = os.getenv("AGORA_APP_CERTIFICATE")

        token = generate_convo_ai_token(
            app_id=app_id,
            app_certificate=app_certificate,
            channel_name=channel_name,
            account=str(user_uid),
            token_expire=3600,
        )

        config_data = {
            "app_id": app_id,
            "token": token,
            "uid": str(user_uid),
            "channel_name": channel_name,
            "agent_uid": agent_uid,
        }

        return {
            "code": 0,
            "data": config_data,
            "msg": "success",
        }
    except Exception as e:
        _log_route_error("/get_config", e, channel=channel, uid=uid)
        raise _to_http_error(e)


@router.post("/startAgent")
async def start_agent(request: StartAgentRequest):
    """Start agent in a channel"""
    if agent is None:
        raise HTTPException(
            status_code=500,
            detail="Service not properly configured. Please check environment variables.",
        )

    try:
        output_audio_codec = None
        car_id = None
        if request.parameters:
            output_audio_codec = request.parameters.get("output_audio_codec")
            car_id = request.parameters.get("carId")
            # Parse carId as int if present
            if car_id is not None:
                try:
                    car_id = int(car_id)
                except (ValueError, TypeError):
                    car_id = None

        result = await agent.start(
            channel_name=request.channelName,
            agent_uid=request.rtcUid,
            user_uid=request.userUid,
            output_audio_codec=output_audio_codec,
            car_id=car_id
        )
        
        # Pre-create the call log to store car_id and start timestamp
        agent_id = result.get("agent_id")
        if agent_id:
            create_call(session_id=agent_id, car_id=car_id, duration=0, transcript="")
            
        return {"code": 0, "msg": "success", "data": result}
    except Exception as e:
        _log_route_error(
            "/startAgent",
            e,
            channelName=request.channelName,
            rtcUid=request.rtcUid,
            userUid=request.userUid,
        )
        raise _to_http_error(e)


@router.post("/stopAgent")
async def stop_agent(request: StopAgentRequest, background_tasks: BackgroundTasks):
    """Stop agent by ID"""
    if agent is None:
        raise HTTPException(
            status_code=500,
            detail="Service not properly configured. Please check environment variables.",
        )

    try:
        await agent.stop(request.agentId)
        # Process the post-call summary asynchronously
        background_tasks.add_task(process_call_summary, request.agentId)
        return {"code": 0, "msg": "success"}
    except Exception as e:
        _log_route_error("/stopAgent", e, agentId=request.agentId)
        raise _to_http_error(e)


# CRM & Webhook endpoints
@router.get("/api/inventory")
async def api_get_inventory():
    """Retrieve all cars in inventory"""
    try:
        cars = get_all_cars()
        return {"code": 0, "msg": "success", "data": cars}
    except Exception as e:
        _log_route_error("/api/inventory", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/inventory")
async def api_add_inventory(request: CarCreateRequest):
    """Add a new car to inventory"""
    try:
        car_id = add_car(request.model_dump())
        return {"code": 0, "msg": "success", "data": {"car_id": car_id}}
    except Exception as e:
        _log_route_error("/api/inventory", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/inventory/status")
async def api_update_car_status(car_id: int = Query(...), status: str = Query(...)):
    """Update status of a car (available/sold)"""
    try:
        update_car_status(car_id, status)
        return {"code": 0, "msg": "success"}
    except Exception as e:
        _log_route_error("/api/inventory/status", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/leads")
async def api_get_leads():
    """Retrieve all leads sorted by score and timestamp"""
    try:
        leads = get_all_leads()
        return {"code": 0, "msg": "success", "data": leads}
    except Exception as e:
        _log_route_error("/api/leads", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/calls")
async def api_get_calls():
    """Retrieve all calls"""
    try:
        calls = get_all_calls()
        return {"code": 0, "msg": "success", "data": calls}
    except Exception as e:
        _log_route_error("/api/calls", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/webhook/agent")
async def agent_webhook(request: Dict[str, Any], background_tasks: BackgroundTasks):
    """Agora webhook for agent left/stop events"""
    logger.info("Received Agora webhook: %s", request)
    payload = request.get("payload", {})
    agent_id = payload.get("agentId")
    if agent_id:
        background_tasks.add_task(process_call_summary, agent_id)
    return {"code": 0, "msg": "success"}


# Initialize DB on FastAPI startup
@app.on_event("startup")
def startup_event():
    try:
        init_db()
        logger.info("SQLite database initialized and seeded successfully.")
    except Exception as e:
        logger.exception("Failed to initialize SQLite database on startup: %s", e)


app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
