# -*- coding: utf-8 -*-
import os
import re
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("uvicorn.error")

FALLBACK_PROMPT = """
You are an expert CRM assistant. Analyze this transcript between a Voice AI sales agent (CARLO) and a buyer, and extract structured information.
"""

def clean_phone_number(text: str) -> Optional[str]:
    """Extract and clean a Philippine mobile phone number."""
    if not text:
        return None
    # Regex to find common Philippine number patterns:
    # 09171234567, +639171234567, 9171234567, etc.
    numbers = re.findall(r'(?:\+63|0)?(9\d{9})\b', text)
    if numbers:
        return "0" + numbers[0]
    return None

def fallback_parse(transcript: str, car_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Robust rule-based parser in case LLM is unavailable or fails.
    """
    transcript_lower = transcript.lower()
    
    # 1. Try to find a phone number
    phone = clean_phone_number(transcript)
    
    # 2. Try to find a name
    # Common Taglish/English name introductions:
    # "ako si vincent", "my name is vincent", "tawagin mo akong vincent", "vincent po"
    name = None
    name_patterns = [
        r"(?:ako si|i am|my name is|tawagin mo akong)\s+([a-zA-Z\s]{2,20})",
        r"\b([a-zA-Z]{2,20})\s+(?:po\s+)?(?:ang pangalan ko|pangalan ko)"
    ]
    for pattern in name_patterns:
        match = re.search(pattern, transcript_lower)
        if match:
            name = match.group(1).strip().title()
            break
            
    # 3. Final offer extraction
    final_offer = None
    # Look for numbers in the transcript, especially near "offer" or "₱" or "pesos" or "k"
    # e.g., "550k", "550,000", "550000"
    offers = re.findall(r'(?:₱|peso|pesos|offer|price)?\s*(\d{3})(?:\s*k|\s*thousand|\s*,\s*000|000)\b', transcript_lower)
    if offers:
        final_offer = float(offers[-1]) * 1000.0
    else:
        # Just search for 6 digit numbers
        offers_raw = re.findall(r'\b(\d{6})\b', transcript)
        if offers_raw:
            final_offer = float(offers_raw[-1])

    # 4. Determine Outcome
    outcome = "Negotiating"
    if "agree" in transcript_lower or "sige" in transcript_lower or "deal" in transcript_lower or "tanggapin" in transcript_lower:
        outcome = "Agreed on Price"
    elif "ayaw" in transcript_lower or "mahal" in transcript_lower or "hindi na" in transcript_lower:
        outcome = "No Deal"
        
    # 5. Score Lead
    # Hot: Name + Phone + Agreed/Negotiated offer
    # Warm: Name or Phone, or Negotiating
    # Cold: No contact info and No Deal/Low offer
    if phone and name and outcome == "Agreed on Price":
        lead_score = "Hot"
    elif phone or name or outcome == "Negotiating":
        lead_score = "Warm"
    else:
        lead_score = "Cold"
        
    # 6. Generate Summary text
    car_name = f"{car_info['year']} {car_info['make']} {car_info['model']}" if car_info else "the vehicle"
    summary_parts = [f"Buyer inquired about {car_name}."]
    if name:
        summary_parts.append(f"Buyer identified as {name}.")
    if phone:
        summary_parts.append(f"Provided contact number {phone}.")
    if final_offer:
        summary_parts.append(f"Discussed offer of ₱{final_offer:,.0f}.")
    summary_parts.append(f"Call ended in status: {outcome}.")
    
    return {
        "buyer_name": name,
        "buyer_phone": phone,
        "final_offer": final_offer,
        "outcome": outcome,
        "lead_score": lead_score,
        "summary": " ".join(summary_parts)
    }

async def generate_summary(transcript: str, car_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Generate structured post-call summary using Claude LLM,
    falling back to rule-based parser if the API call fails or key is missing.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.info("ANTHROPIC_API_KEY not configured. Using rule-based fallback parser.")
        return fallback_parse(transcript, car_info)
        
    try:
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=api_key)
        
        car_details = ""
        if car_info:
            car_details = f"Car under negotiation: {car_info['year']} {car_info['make']} {car_info['model']} (Asking: ₱{car_info['asking_price']:,.0f}, Floor: ₱{car_info['floor_price']:,.0f})"
            
        system_prompt = (
            "You are CARLO's backoffice CRM analyzer. Your job is to read transcripts of phone calls between CARLO (the Voice AI sales agent) and buyers, "
            "and extract structured JSON. You must return ONLY valid JSON with no markdown formatting around it (do not wrap in ```json or ```). "
            "The JSON must have the following keys:\n"
            "1. 'buyer_name': The buyer's name (string, or null if not captured)\n"
            "2. 'buyer_phone': The buyer's mobile phone number (string starting with '09', or null if not captured)\n"
            "3. 'final_offer': The last price offered or agreed upon (float, or null if none)\n"
            "4. 'outcome': One of 'Agreed on Price', 'Negotiating', 'No Deal', or 'Sold' (string)\n"
            "5. 'lead_score': One of 'Hot', 'Warm', 'Cold' (string). Score as 'Hot' if both name and phone are captured AND we agreed on a price. "
            "Score as 'Warm' if we captured some contact info but didn't close, or if they are negotiating reasonably. Score as 'Cold' if they low-balled, "
            "refused to negotiate, or left without leaving contact info.\n"
            "6. 'summary': A 2-3 sentence overview of the call, including objections raised (e.g. price too high, wanted manual instead of automatic) and recommended next steps (string)."
        )
        
        user_message = f"{car_details}\n\nCall Transcript:\n{transcript}"
        
        response = await client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            temperature=0.0,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_message}
            ]
        )
        
        response_text = response.content[0].text.strip()
        
        # Clean any potential markdown JSON wrapping if present
        if response_text.startswith("```"):
            # strip markdown lines
            response_text = re.sub(r'^```[a-zA-Z]*\n', '', response_text)
            response_text = re.sub(r'\n```$', '', response_text)
            response_text = response_text.strip()
            
        result = json.loads(response_text)
        
        # Validate keys
        required_keys = ["buyer_name", "buyer_phone", "final_offer", "outcome", "lead_score", "summary"]
        for key in required_keys:
            if key not in result:
                result[key] = None
                
        # Clean phone number
        if result.get("buyer_phone"):
            result["buyer_phone"] = clean_phone_number(result["buyer_phone"])
            
        return result
        
    except Exception as e:
        logger.exception("Error in Claude post-call summary generation, falling back to rules: %s", e)
        return fallback_parse(transcript, car_info)
