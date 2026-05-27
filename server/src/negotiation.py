# -*- coding: utf-8 -*-
from typing import Dict, Any, Tuple

def get_value_anchors(car: Dict[str, Any]) -> str:
    """Generate persuasive value anchors based on the car's details."""
    anchors = []
    
    # 1. Condition
    if car.get("condition") in ["Excellent", "Very Good"]:
        anchors.append(f"in {car['condition'].lower()} condition")
        
    # 2. Mileage
    mileage = car.get("mileage", 0)
    if mileage < 30000:
        anchors.append(f"with very low mileage of only {mileage:,} km")
    elif mileage < 50000:
        anchors.append(f"with low mileage of only {mileage:,} km")
        
    # 3. Accident Free
    if car.get("accident_free") == 1:
        anchors.append("guaranteed 100% accident-free")
        
    # 4. Registration
    if car.get("registration_expiry"):
        anchors.append(f"with updated LTO registration")
        
    if not anchors:
        return "this is a very well-maintained unit"
        
    # Join into Taglish/English phrase
    if len(anchors) == 1:
        return f"it is {anchors[0]}"
    elif len(anchors) == 2:
        return f"it is {anchors[0]} and {anchors[1]}"
    else:
        return f"it is {anchors[0]}, {anchors[1]}, and {anchors[2]}"

def process_offer(car: Dict[str, Any], offer: float, round_num: int) -> Tuple[float, str, bool]:
    """
    Process the buyer's offer.
    Returns:
        (counter_price, message, is_accepted)
    """
    asking_price = car["asking_price"]
    floor_price = car["floor_price"]
    
    # Cap round_num between 1 and 3
    round_num = max(1, min(3, round_num))
    
    # If offer meets or exceeds asking price, accept immediately
    if offer >= asking_price:
        return asking_price, "Wow, that's a great offer! I am happy to accept that.", True

    # If offer meets or exceeds floor price and it is round 3 (final round), accept
    if offer >= floor_price and round_num == 3:
        return offer, f"Sige po, since this is our final round of negotiation, we can do ₱{offer:,.0f} for this unit.", True

    # If offer is below floor price
    if offer < floor_price:
        # Calculate counters for rounds 1, 2, 3
        if round_num == 1:
            # 30% down from asking towards floor
            counter = asking_price - (asking_price - floor_price) * 0.3
            anchor = get_value_anchors(car)
            msg = f"Naku, medyo mababa po iyon. Standard price is ₱{asking_price:,.0f} because {anchor}. But I can do ₱{counter:,.0f} for you today."
            return counter, msg, False
        elif round_num == 2:
            # 60% down from asking towards floor
            counter = asking_price - (asking_price - floor_price) * 0.6
            anchor = get_value_anchors(car)
            msg = f"Pasensya na po, hindi natin kaya ibigay sa ganyang presyo. Lugi na po ang dealership. The lowest I can offer right now is ₱{counter:,.0f}."
            return counter, msg, False
        else: # Round 3 (Final round)
            # Stand firm at floor price
            counter = floor_price
            msg = f"Talagang ₱{floor_price:,.0f} na po ang rock-bottom price natin para sa {car['make']} {car['model']}. Iyon na po ang pinakasagad na kaya naming ibigay."
            return counter, msg, False

    # If offer is between floor price and asking price in rounds 1 or 2
    else:
        # Counter by splitting the difference between the offer and the asking price
        counter = (asking_price + offer) / 2.0
        # Round to nearest thousand
        counter = round(counter, -3)
        
        # If the split is below floor price (should not happen mathematically if offer >= floor_price), cap at floor_price
        if counter < floor_price:
            counter = floor_price
            
        anchor = get_value_anchors(car)
        msg = f"Medyo malapit na po, pero paano kung hatiin natin ang dispensa? I can give it to you for ₱{counter:,.0f}. {anchor}."
        return counter, msg, False
