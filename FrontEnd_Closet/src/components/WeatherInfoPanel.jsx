// WeatherInfoPanel.jsx
import { useEffect, useState } from "react";
import './weatherInfoPanel.css'

function WeatherInfoPanel() {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    const API_KEY = "e5d2792a9345a4eec9a9f3c3b36e0c04";
    const city = "Seoul";
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=kr`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setWeather(data);
      })
      .catch((err) => console.error("날씨 가져오기 실패", err));
  }, []);

  if (!weather) return <div>날씨 정보를 불러오는 중...</div>;

  return (
    <div className="weatherInfo">
        <img
        src={`https://openweathermap.org/img/wn/${weather.weather[0].icon}@2x.png`}
        alt="weather icon"
      />
      <div classname="weatherWindow">
      <div>📍 {weather.name} 현재 날씨</div>
      <div>🌡️ 기온: {weather.main.temp}°C</div>
      <div>😎 체감온도: {weather.main.feels_like}°C</div>
      <div>💧 습도: {weather.main.humidity}%</div>
      <div>🌬️ 바람: {weather.wind.speed} m/s</div>
      <div>☁️ 상태: {weather.weather[0].description}</div>
      </div>
      
    </div>
  );
}

export default WeatherInfoPanel;
