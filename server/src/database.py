# -*- coding: utf-8 -*-
import sqlite3
import os
from typing import List, Dict, Any, Optional

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///c:/Users/Vincent/CARLO/data/inventory.db")

# Helper to get clean path from sqlite:/// URL
def get_db_path() -> str:
    if DATABASE_URL.startswith("sqlite:///"):
        return DATABASE_URL[10:]
    return DATABASE_URL

def get_db_connection():
    db_path = get_db_path()
    # Ensure directory exists just in case
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create cars table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        make TEXT NOT NULL,
        model TEXT NOT NULL,
        year INTEGER NOT NULL,
        color TEXT NOT NULL,
        mileage INTEGER NOT NULL,
        transmission TEXT NOT NULL,
        fuel_type TEXT NOT NULL,
        condition TEXT NOT NULL,
        asking_price REAL NOT NULL,
        floor_price REAL NOT NULL,
        location TEXT NOT NULL,
        registration_expiry TEXT NOT NULL,
        accident_free INTEGER NOT NULL, -- 0 = No, 1 = Yes
        status TEXT DEFAULT 'available' -- 'available', 'sold'
    )
    """)
    
    # Create leads table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buyer_name TEXT,
        buyer_phone TEXT,
        car_id INTEGER,
        final_offer REAL,
        outcome TEXT,
        lead_score TEXT, -- 'Hot', 'Warm', 'Cold'
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (car_id) REFERENCES cars(id)
    )
    """)
    
    # Create calls table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE,
        car_id INTEGER,
        duration INTEGER DEFAULT 0,
        transcript TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (car_id) REFERENCES cars(id)
    )
    """)
    
    # Check if empty and seed
    cursor.execute("SELECT COUNT(*) FROM cars")
    if cursor.fetchone()[0] == 0:
        seed_cars = [
            ("Toyota", "Vios", 2019, "Silver", 35000, "Automatic", "Gasoline", "Excellent", 480000.0, 430000.0, "Quezon City", "2027-08-15", 1, "available"),
            ("Honda", "City", 2020, "Modern Steel Metallic", 25000, "Automatic", "Gasoline", "Excellent", 580000.0, 530000.0, "Pasig", "2027-09-20", 1, "available"),
            ("Mitsubishi", "Montero Sport", 2018, "Jet Black", 55000, "Automatic", "Diesel", "Very Good", 980000.0, 900000.0, "Makati", "2027-06-10", 1, "available"),
            ("Toyota", "Innova", 2017, "Freedom White", 68000, "Manual", "Diesel", "Good", 680000.0, 620000.0, "Caloocan", "2027-05-18", 1, "available"),
            ("Ford", "Ranger", 2021, "Absolute Black", 18000, "Automatic", "Diesel", "Excellent", 880000.0, 820000.0, "Mandaluyong", "2027-11-05", 1, "available")
        ]
        cursor.executemany("""
        INSERT INTO cars (make, model, year, color, mileage, transmission, fuel_type, condition, asking_price, floor_price, location, registration_expiry, accident_free, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, seed_cars)
        conn.commit()
        
    conn.close()

# Database CRUD helpers
def get_all_cars() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cars")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_car_by_id(car_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cars WHERE id = ?", (car_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_car_status(car_id: int, status: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE cars SET status = ? WHERE id = ?", (status, car_id))
    conn.commit()
    conn.close()

def create_lead(buyer_name: Optional[str], buyer_phone: Optional[str], car_id: int, final_offer: Optional[float], outcome: str, lead_score: str, summary: str) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO leads (buyer_name, buyer_phone, car_id, final_offer, outcome, lead_score, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (buyer_name, buyer_phone, car_id, final_offer, outcome, lead_score, summary))
    conn.commit()
    lead_id = cursor.lastrowid
    conn.close()
    return lead_id

def create_call(session_id: str, car_id: Optional[int], duration: int, transcript: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO calls (session_id, car_id, duration, transcript)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
            duration = excluded.duration,
            transcript = excluded.transcript
        """, (session_id, car_id, duration, transcript))
        conn.commit()
    except Exception as e:
        print(f"Error creating/updating call: {e}")
    finally:
        conn.close()

def get_all_leads() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT l.*, c.make, c.model, c.year, c.asking_price 
    FROM leads l
    LEFT JOIN cars c ON l.car_id = c.id
    ORDER BY 
      CASE l.lead_score
        WHEN 'Hot' THEN 1
        WHEN 'Warm' THEN 2
        WHEN 'Cold' THEN 3
        ELSE 4
      END ASC, l.created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_all_calls() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT cl.*, c.make, c.model, c.year 
    FROM calls cl
    LEFT JOIN cars c ON cl.car_id = c.id
    ORDER BY cl.created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]
