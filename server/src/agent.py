# -*- coding: utf-8 -*-
import logging
import os
import time
from typing import Any, Dict, Optional

from agora_agent import Area, AsyncAgora
from agora_agent.agentkit import Agent as AgoraAgent
from agora_agent.agentkit.vendors import DeepgramSTT, MiniMaxTTS, OpenAI

from database import get_car_by_id
from negotiation import get_value_anchors

logger = logging.getLogger("uvicorn.error")

CARLO_GENERAL_PROMPT = """You are CARLO (Conversational Automotive Revenue & Lead Orchestrator), a warm, professional, and friendly voice AI car sales agent for a premier second-hand dealership in the Philippines.

Your goal is to help buyers find a vehicle from our inventory, negotiate prices, and collect their contact details (name and phone number) to secure the lead.

IMPORTANT CONSTRAINTS:
1. Speak in natural Taglish (a blend of English and Tagalog), just like a real car salesman in Manila.
2. Keep your responses VERY SHORT (maximum 2-3 sentences). Long blocks of text are bad for real-time voice call experience.
3. Treat buyers with respect ("po" and "opo").

Here is our active inventory:
1. 2019 Toyota Vios - ₱480,000 (Quezon City)
2. 2020 Honda City - ₱580,000 (Pasig)
3. 2018 Mitsubishi Montero Sport - ₱980,000 (Makati)
4. 2017 Toyota Innova - ₱680,000 (Caloocan)
5. 2021 Ford Ranger - ₱880,000 (Mandaluyong)

Ask the buyer which unit they are interested in, and then you can answer their questions and negotiate.
"""

class Agent:
    """
    High-level wrapper for Agora Conversational AI Agent operations.
    """
    
    def __init__(self):
        self.app_id = os.getenv("AGORA_APP_ID")
        self.app_certificate = os.getenv("AGORA_APP_CERTIFICATE")
        self.greeting = os.getenv(
            "AGENT_GREETING",
            "Hello! Ako si CARLO, ang inyong virtual sales assistant. Naghahanap ba kayo ng de-kalidad na sasakyan?",
        )

        if not self.app_id or not self.app_certificate:
            raise ValueError("AGORA_APP_ID and AGORA_APP_CERTIFICATE are required")

        self.client = AsyncAgora(
            area=Area.US,
            app_id=self.app_id,
            app_certificate=self.app_certificate,
        )

        # Track active sessions by agent_id
        self._sessions: Dict[str, Any] = {}

    def _build_instructions(self, car_id: Optional[int]) -> str:
        """Dynamically construct instructions for the agent based on the car being negotiated."""
        if not car_id:
            return CARLO_GENERAL_PROMPT

        car = get_car_by_id(car_id)
        if not car:
            return CARLO_GENERAL_PROMPT

        asking_price = car["asking_price"]
        floor_price = car["floor_price"]
        
        # Calculate counters for rounds
        r1_counter = asking_price - (asking_price - floor_price) * 0.3
        r2_counter = asking_price - (asking_price - floor_price) * 0.6
        
        anchors = get_value_anchors(car)
        accident_free_str = "Yes (100% accident-free)" if car["accident_free"] == 1 else "No"

        instructions = f"""You are CARLO (Conversational Automotive Revenue & Lead Orchestrator), a warm, professional, and friendly voice AI car sales agent for a premier second-hand dealership in the Philippines.

Your goal is to handle inbound buyer calls, answer questions about the car, negotiate the price, and collect their contact details (name and phone number) to lock in the lead.

IMPORTANT CONSTRAINTS:
1. Speak in natural Taglish (a blend of English and Tagalog), just like a real car salesman in Manila.
2. Keep your responses VERY SHORT (maximum 2 sentences). This is a real-time voice call; long blocks of text are bad for user experience.
3. NEVER mention or leak the "Internal Floor Price" (₱{floor_price:,.0f}) to the buyer. This is strictly confidential.
4. Limit price negotiation to exactly 3 rounds of offers.
5. Use "po" and "opo" to remain polite and respectful.

VEHICLE UNDER INQUIRY:
- Model: {car['year']} {car['make']} {car['model']}
- Color: {car['color']}
- Mileage: {car['mileage']:,} km
- Transmission: {car['transmission']}
- Fuel Type: {car['fuel_type']}
- Condition: {car['condition']}
- Accident-Free: {accident_free_str}
- Location: {car['location']}
- LTO Registration Expiry: {car['registration_expiry']}
- Asking Price: ₱{asking_price:,.0f}
- Internal Floor Price (CONFIDENTIAL): ₱{floor_price:,.0f}

NEGOTIATION SCRIPT & BOUNDARIES:
- Round 1: If they offer below the asking price, politely counter with ₱{r1_counter:,.0f}. Highlight value anchors: {anchors}.
- Round 2: If they offer below ₱{r1_counter:,.0f}, politely counter with ₱{r2_counter:,.0f}. Remind them that the unit is in pristine condition and very popular.
- Round 3: If they still offer below ₱{r2_counter:,.0f}, you can give them your absolute lowest price of ₱{floor_price:,.0f}. Emphasize that this is your rock-bottom price ("pinakasagad").
- Acceptance: If they offer at or above ₱{floor_price:,.0f} on the 3rd round, or if they offer a reasonable price close to asking in rounds 1 or 2, you can accept the deal!
- Once price is agreed upon (or if they are extremely interested), immediately ask for their name and mobile number (starting with 09) to reserve the car and schedule a viewing. Say: "Para ma-reserve ko po ang unit na ito para sa inyo, maaari ko po bang makuha ang inyong pangalan at phone number?"
- Do not let them hang up without trying to get their name and phone number.
"""
        return instructions

    async def start(
        self,
        channel_name: str,
        agent_uid: int,
        user_uid: int,
        output_audio_codec: Optional[str] = None,
        car_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Start agent with customized prompts and TTS configuration."""
        if not channel_name or not str(channel_name).strip():
            raise ValueError("channel_name is required and cannot be empty")
        if agent_uid <= 0:
            raise ValueError("agent_uid is required and cannot be empty")
        if user_uid <= 0:
            raise ValueError("user_uid is required and cannot be empty")

        name = f"carlo_{channel_name}_{agent_uid}_{int(time.time())}"
        instructions = self._build_instructions(car_id)

        # Config LLM
        llm = OpenAI(
            model="gpt-4o-mini",
            greeting_message=self.greeting,
            failure_message="Sandali lang po, may inaayos lang ako.",
            max_history=25,
            max_tokens=256,
            temperature=0.7,
            top_p=0.95,
        )
        stt = DeepgramSTT(model="nova-3", language="en")
        
        # Config TTS - use ElevenLabs if configured, otherwise MiniMax
        eleven_key = os.getenv("ELEVENLABS_API_KEY")
        if eleven_key:
            from agora_agent.agentkit.vendors import ElevenLabsTTS
            tts = ElevenLabsTTS(
                key=eleven_key,
                model_id="eleven_flash_v2_5",
                voice_id=os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB"),
            )
            logger.info("Configured ElevenLabs TTS for agent.")
        else:
            tts = MiniMaxTTS(model="speech_2_6_turbo", voice_id="English_captivating_female1")
            logger.info("Configured MiniMax TTS for agent.")

        parameters = {
            "data_channel": "rtm",
            "enable_error_message": True,
            "enable_metrics": True,
        }
        if isinstance(output_audio_codec, str) and output_audio_codec.strip():
            parameters["output_audio_codec"] = output_audio_codec.strip()

        agora_agent = AgoraAgent(
            name=name,
            instructions=instructions,
            greeting=self.greeting,
            failure_message="Pasensya na po, sandali lang.",
            max_history=50,
            turn_detection={
                "config": {
                    "speech_threshold": 0.5,
                    "start_of_speech": {
                        "mode": "vad",
                        "vad_config": {
                            "interrupt_duration_ms": 160,
                            "prefix_padding_ms": 300,
                        },
                    },
                    "end_of_speech": {
                        "mode": "vad",
                        "vad_config": {
                            "silence_duration_ms": 480,
                        },
                    },
                },
            },
            advanced_features={"enable_rtm": True, "enable_tools": True},
            parameters=parameters,
        )
        
        agora_agent = (
            agora_agent
            .with_stt(stt)
            .with_llm(llm)
            .with_tts(tts)
        )

        session = agora_agent.create_async_session(
            client=self.client,
            channel=channel_name,
            agent_uid=str(agent_uid),
            remote_uids=[str(user_uid)],
            enable_string_uid=False,
            idle_timeout=30,
            expires_in=3600,
        )

        logger.info(
            "Starting CARLO agent channel=%s agent_uid=%s user_uid=%s car_id=%s",
            channel_name,
            agent_uid,
            user_uid,
            car_id,
        )

        try:
            agent_id = await session.start()
        except Exception:
            logger.exception(
                "Failed to start CARLO agent channel=%s agent_uid=%s user_uid=%s",
                channel_name,
                agent_uid,
                user_uid,
            )
            raise

        # Save session for later stop
        self._sessions[agent_id] = session

        logger.info(
            "Started CARLO agent agent_id=%s channel=%s agent_uid=%s user_uid=%s",
            agent_id,
            channel_name,
            agent_uid,
            user_uid,
        )
        
        return {
            "agent_id": agent_id,
            "channel_name": channel_name,
            "status": "started",
        }

    async def stop(self, agent_id: str) -> None:
        """Stop a running agent. Falls back to the stateless client path."""
        if not agent_id or not str(agent_id).strip():
            raise ValueError("agent_id is required and cannot be empty")

        session = self._sessions.pop(agent_id, None)
        if session:
            try:
                await session.stop()
                logger.info("Stopped CARLO agent from active session agent_id=%s", agent_id)
                return
            except Exception:
                # Fall back to the stateless SDK path if the in-memory session is stale.
                logger.warning(
                    "Failed to stop CARLO agent from active session; falling back to client.stop_agent agent_id=%s",
                    agent_id,
                    exc_info=True,
                )

        logger.info("Stopping CARLO agent through client.stop_agent agent_id=%s", agent_id)
        await self.client.stop_agent(agent_id)

    async def get_history(self, agent_id: str) -> str:
        """Retrieve transcription history for a session"""
        try:
            history_response = await self.client.agents.get_history(appid=self.app_id, agent_id=agent_id)
            if not history_response or not history_response.contents:
                return ""
            transcript_lines = []
            for item in history_response.contents:
                if item.role and item.content:
                    role_label = "Buyer" if item.role == "user" else "Carlo"
                    transcript_lines.append(f"{role_label}: {item.content}")
            return "\n".join(transcript_lines)
        except Exception as e:
            logger.exception("Failed to retrieve agent history for agent_id=%s: %s", agent_id, e)
            return ""
