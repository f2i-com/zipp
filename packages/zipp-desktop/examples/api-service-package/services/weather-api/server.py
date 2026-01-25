"""
Simple Weather API Service for ZIPP Package Demo

This is a mock weather service that returns simulated weather data.
In a real package, this could connect to actual weather APIs.
"""

from flask import Flask, request, jsonify
import os
import random

app = Flask(__name__)

# Mock weather data
WEATHER_CONDITIONS = [
    "Sunny",
    "Partly Cloudy",
    "Cloudy",
    "Light Rain",
    "Heavy Rain",
    "Thunderstorm",
    "Snowy",
    "Foggy",
    "Windy"
]

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "service": "weather-api"})

@app.route('/weather', methods=['GET'])
def get_weather():
    """Get mock weather data for a city"""
    city = request.args.get('city', 'Unknown')

    # Generate mock weather data
    weather_data = {
        "city": city,
        "temperature": random.randint(-10, 35),
        "conditions": random.choice(WEATHER_CONDITIONS),
        "humidity": random.randint(20, 95),
        "wind_speed": random.randint(0, 50),
        "timestamp": "2024-01-01T12:00:00Z"
    }

    return jsonify(weather_data)

@app.route('/forecast', methods=['GET'])
def get_forecast():
    """Get 5-day mock forecast for a city"""
    city = request.args.get('city', 'Unknown')

    forecast = []
    for day in range(5):
        forecast.append({
            "day": day + 1,
            "temperature_high": random.randint(10, 35),
            "temperature_low": random.randint(-5, 15),
            "conditions": random.choice(WEATHER_CONDITIONS),
            "precipitation_chance": random.randint(0, 100)
        })

    return jsonify({
        "city": city,
        "forecast": forecast
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8950))
    log_level = os.environ.get('LOG_LEVEL', 'info')

    print(f"[Weather API] Starting on port {port} (log level: {log_level})")
    app.run(host='127.0.0.1', port=port, debug=(log_level == 'debug'))
