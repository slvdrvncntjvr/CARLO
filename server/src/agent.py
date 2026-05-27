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
2. Keep your responses VERY SHORT (maximum 2-3 sentences). Long blocks of text is bad for real-time voice call experience.
3. Treat buyers with respect ("po" and "opo").
4. CRITICAL — DEAL CLOSURE RULE: If the buyer says they agree, accept the price, want to buy, or say anything like "sige", "deal", "okay na", "I'll take it", "okay po" to your offer — DO NOT lower the price further. Immediately celebrate and ask for their name and phone number to reserve the unit.
5. Only counter-offer at a lower price if the buyer is actively PUSHING BACK or saying the price is too high.

Here is our active inventory:
1. 2019 Toyota Vios - ₱480,000 (Quezon City)
2. 2020 Honda City - ₱580,000 (Pasig)
3. 2018 Mitsubishi Montero Sport - ₱980,000 (Makati)
4. 2017 Toyota Innova - ₱680,000 (Caloocan)
5. 2021 Ford Ranger - ₱880,000 (Mandaluyong)

Ask the buyer which unit they are interested in, and then answer their questions and negotiate.
"""

class Agent:
    """
    High-level wrapper for Agora Conversational AI Agent operations.
    """
    
    def __init__(self):
        self.app_id = os.getenv("AGORA_APP_ID")
        self.app_certificate = os.getenv("AGORA_APP_CERTIFICATE")
        self.customer_key = os.getenv("AGORA_CUSTOMER_KEY", "")
        self.customer_secret = os.getenv("AGORA_CUSTOMER_SECRET", "")
        self.greeting = os.getenv(
            "AGENT_GREETING",
            "Hello! Ako si CARLO, ang inyong virtual sales assistant. Naghahanap ba kayo ng de-kalidad na sasakyan?",
        )

        if not self.app_id or not self.app_certificate:
            raise ValueError("AGORA_APP_ID and AGORA_APP_CERTIFICATE are required")

        # customer_id + customer_secret are required for REST APIs like get_history
        client_kwargs: Dict[str, Any] = {
            "area": Area.US,
            "app_id": self.app_id,
            "app_certificate": self.app_certificate,
        }
        if self.customer_key and self.customer_secret:
            client_kwargs["customer_id"] = self.customer_key
            client_kwargs["customer_secret"] = self.customer_secret
        self.client = AsyncAgora(**client_kwargs)

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
2. Keep your responses VERY SHORT (maximum 2 sentences). This is a real-time voice call; long blocks of text is bad for user experience.
3. NEVER mention or leak the "Internal Floor Price" (₱{floor_price:,.0f}) to the buyer. This is strictly confidential.
4. Limit price negotiation to exactly 3 rounds of offers.
5. Use "po" and "opo" to remain polite and respectful.

CRITICAL — DEAL CLOSURE RULE (HIGHEST PRIORITY):
- If the buyer AGREES to ANY price you have offered — they say "sige", "deal", "okay", "okay na", "I'll take it", "tara", "bilhin ko na", "sold", or any expression of acceptance — you MUST immediately celebrate and close the deal.
- DO NOT offer a lower price when a buyer accepts. This is a MISTAKE. Going lower when they already said yes destroys the sale.
- The moment they agree, say something like: "Grabe naman po, salamat! Para ma-reserve ko po ang unit para sa inyo, maaari ko pong makuha ang inyong pangalan at phone number?"
- Only counter-offer at a lower price if the buyer is ACTIVELY PUSHING BACK (e.g., "ang mahal", "too expensive", "lower mo pa", "hindi ko kaya").

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
- Internal Floor Price (CONFIDENTIAL — never reveal): ₱{floor_price:,.0f}

NEGOTIATION SCRIPT & BOUNDARIES:
- Start: Present the asking price of ₱{asking_price:,.0f} confidently. Highlight: {anchors}.
- Round 1 (buyer pushes back): Counter with ₱{r1_counter:,.0f}. Emphasize the value.
- Round 2 (buyer still pushes back): Counter with ₱{r2_counter:,.0f}. Stress condition and popularity.
- Round 3 (buyer still pushes back): Offer your absolute floor of ₱{floor_price:,.0f} — frame it as "pinakasagad na po ito".
- ACCEPT IMMEDIATELY if: buyer's offer is at or above ₱{floor_price:,.0f}, or buyer agrees to any of your counter-offers.
- After price agreed: Ask for name and mobile number (09xxxxxxxxx) to reserve. Do not let the call end without this.
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
